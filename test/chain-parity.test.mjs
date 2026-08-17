/**
 * Drive the chain session against a fake contract, so the call shapes and the
 * interface parity are checked even without a node.
 */
import { createChainSession, createObserver } from '../game/chain.js';
import { createBot } from '../game/bots.js';
import { PHASE } from '../game/iface.js';
import { AGENTS, truthfulAnswer } from '../game/rules.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const calls = [];
const decryptBatchSizes = [];

function fakeChain({ seat = 0 } = {}) {
  const ids = [3, 7, 11, 1, 14];
  let rows = [];
  let state = { phase: 1, filled: 5, alive: 5, turn: seat, awaitingAnswer: false, responder: 0, pot: 5, deadline: 0 };
  const tx = name => ({ wait: async () => { calls.push(name); return {}; } });
  return {
    ids,
    contract: {
      async tableState(){ return { ...state, phase: state.phase }; },
      async ledgerLength(){ return rows.length; },
      async ledger(_t,i){ return rows[i]; },
      async seatCard(_t,s){ return ['0xhandle'+s, '0xmask'+s]; },
      async glasses(){ return 5; },
      ask(_t, mask, all){
        rows.push({ asker: seat, responder: 2, queryMask: mask, modeAll: all, answered: false,
                    claim:false, elapsed:0, audited:false, wasLie:false, truth:'0x0' });
        return tx('ask');
      },
      respond(_t, claim, held){
        const last = rows[rows.length-1];
        last.answered = true; last.claim = claim; last.elapsed = held;
        return tx('respond');
      },
      accuse(_t, id){ rows[id].audited = true; rows[id].wasLie = true; return tx('accuse'); },
      declare(){ state.phase = 4; return tx('declare'); },
    },
    setAwaiting(){ state.awaitingAnswer = true; state.responder = seat;
      rows.push({ asker: 1, responder: seat, queryMask: 1, modeAll: false, answered: false,
                  claim:false, elapsed:0, audited:false, wasLie:false, truth:'0x0' }); },
  };
}

const zap = {
  attestedDecrypt: async (walletClient, handles) => {
    decryptBatchSizes.push(handles.length);
    await walletClient.request({ method: 'eth_chainId', params: [] });
    return handles.map(handle => ({
      handle,
      plaintext: { value: BigInt(Number(handle.slice(-1)) + 1) },
    }));
  },
};

const signer = {
  provider: { send: async (method) => { calls.push(method); return '0x14a34'; } },
  signTypedData: async () => '0xsigned',
};

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : (fail++, console.log('  FAIL', name)); };

const keeperBot = createBot('STRAIGHT', 0);
keeperBot.observe([7, 11, 1, 14], [null, 7, 11, 1, 14]);
check('bot can read another seat card', keeperBot.knownIdOf(2) === 11);
check('bot cannot read its own card', keeperBot.knownIdOf(0) === null);

const f = fakeChain({ seat: 0 });
const events = [];
const s = createChainSession({
  contract: f.contract, signer, zap, tableId: 0n, seat: 0, address: '0xme',
  onEvent: e => events.push(e.type), interval: 30,
});
await sleep(120);

check('dealt fired', events.includes('dealt'));
check('Inco wallet client proxies RPC requests', calls.includes('eth_chainId'));
check('four cards read, own seat left blank', s.view().cards.filter(c => c != null).length === 4 && s.view().cards[0] === null);
check('four visible cards decrypt in one wallet request', decryptBatchSizes.length === 1 && decryptBatchSizes[0] === 4);
check('phase is your turn', s.view().phase === PHASE.ASK);

const r1 = await s.ask(1, false);
check('ask succeeds', r1.ok);
check('ask reached the contract', calls.includes('ask'));
await sleep(60);
check('ledger picked the question up', s.view().ledger.length >= 1);

f.setAwaiting();
await sleep(80);
check('phase flips to respond', s.view().phase === PHASE.RESPOND);
const p = s.pendingForYou();
check('pending shows the asker and the honest answer', !!p && typeof p.honest === 'boolean');

const r2 = await s.respond(p ? !p.honest : true, 6);
check('respond succeeds', r2.ok);
check('respond reached the contract', calls.includes('respond'));
await sleep(60);
check('poll notices an answer updating an existing ledger row', s.view().ledger.some(row => row.answered));

const r3 = await s.accuse(0);
check('accuse succeeds', r3.ok);

s.destroy();

// The observer must never ask for a card and never offer a move.
const o = createObserver({ contract: f.contract, tableId: 0n, onEvent(){}, interval: 30 });
await sleep(80);
check('observer sees the public ledger', o.view().ledger.length >= 1);
check('observer sees no cards', o.view().cards.every(c => c === null));
check('observer cannot ask', !(await o.ask(1,false)).ok);
check('observer cannot accuse', !(await o.accuse(0)).ok);
o.destroy();

// Both implementations must answer the same questions.
const local = await import('../game/session.js');
const ls = local.createSession({});
const needed = ['yourCandidates','yourAnswers','pendingForYou','ask','respond','accuse','declare'];
for (const m of needed) check(`local has ${m}`, typeof ls[m] === 'function');
for (const m of needed) check(`chain has ${m}`, typeof s[m] === 'function');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
