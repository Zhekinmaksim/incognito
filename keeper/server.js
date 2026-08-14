/**
 * The keeper, wrapped for somewhere it has to survive.
 *
 * Fly restarts machines, moves them between hosts and sends SIGTERM when it
 * wants the process gone. None of that is a problem for a keeper that holds no
 * state — everything authoritative lives on chain — but it does need to say
 * whether it is healthy, stop cleanly mid-transaction, and refuse to run twice.
 */

import http from 'node:http';
import { Keeper } from './keeper.js';

const PORT = Number(process.env.PORT || 8080);

const status = {
  startedAt: new Date().toISOString(),
  tableId: null,
  lastStep: null,
  lastError: null,
  steps: 0,
  errors: 0,
  balances: {},
  contractBalance: null,
  stalled: false,
};

/**
 * Health is not "the process is up" — a keeper that has been throwing for ten
 * minutes is up and useless. It is "a move was made recently".
 */
const STALL_MS = Number(process.env.STALL_MS || 5 * 60 * 1000);
function describeError(err, depth = 0) {
  if (!err || depth > 4) return '';
  const head = err.shortMessage || err.message || String(err);
  const cause = err.cause ? describeError(err.cause, depth + 1) : '';
  return cause && cause !== head ? `${head} :: ${cause}` : head;
}

function healthy() {
  if (!status.lastStep) return Date.now() - Date.parse(status.startedAt) < STALL_MS;
  return Date.now() - Date.parse(status.lastStep) < STALL_MS;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const ok = healthy();
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok, stalled: !ok, lastStep: status.lastStep }));
    return;
  }
  if (req.url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
    return;
  }
  res.writeHead(404).end();
});

async function main() {
  server.listen(PORT, '0.0.0.0', () => console.log(`status on :${PORT}`));

  const keeper = new Keeper();
  keeper.onStep = (info) => {
    status.steps++;
    status.lastStep = new Date().toISOString();
    status.tableId = info?.tableId ?? status.tableId;
    status.stalled = false;
  };
  keeper.onError = (err) => {
    status.errors++;
    status.lastError = { at: new Date().toISOString(), message: describeError(err) };
  };
  keeper.onBalances = (b) => { Object.assign(status, b); };

  let stopping = false;
  const stop = async (sig) => {
    if (stopping) return;
    stopping = true;
    console.log(`${sig}: finishing the current move, then closing`);
    keeper.stop();                       // lets an in-flight tx settle first
    setTimeout(() => process.exit(0), 15000).unref();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  // A crash inside a tx should not take the machine down: log, pause, continue.
  process.on('unhandledRejection', (e) => {
    status.errors++;
    console.error('unhandled', e);
  });

  await keeper.run();
}

main().catch((e) => { console.error(e); process.exit(1); });
