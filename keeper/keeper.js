/**
 * THE ARCHIVE — the keeper that keeps a table alive.
 *
 * Four bot wallets, four personalities, and one chair kept open for a visitor.
 * It is not a bot mode:
 * the contract cannot tell these apart from anybody else, which is the point.
 * A visitor who walks in at three in the morning takes one of these seats and
 * the round carries on.
 *
 * The brains are the same modules the simulator uses, so anything proved at
 * `npm run sim` is the behaviour that shows up on chain.
 *
 * Env:
 *   RPC_URL           an endpoint for the chain the game is on
 *   CONTRACT          deployed Incognito address
 *   KEEPER_KEYS       five comma-separated private keys (four seats, one spare)
 *   INCO_ENV          'testnet' for Base Sepolia, 'mainnet' for Base
 */

import { ethers } from 'ethers';
import { createRequire } from 'node:module';
import 'dotenv/config';
import { createBot, PERSONALITIES } from '../game/bots.js';
import { AGENTS, describeQuery } from '../game/rules.js';

const require = createRequire(import.meta.url);
const { Lightning } = require('@inco/lightning-js/lite');

const RPC = process.env.RPC_URL;
const ADDRESS = process.env.CONTRACT;
const KEYS = (process.env.KEEPER_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
const INCO_ENV = process.env.INCO_ENV || 'testnet';
const TABLE_FUND = process.env.TABLE_FUND_ETH || '0';

if (INCO_ENV !== 'mainnet' && process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const ABI = [
  'function openTable() payable returns (uint256)',
  'function sit(uint256 tableId) payable',
  'function ask(uint256 tableId, uint8 queryMask, bool modeAll)',
  'function respond(uint256 tableId, bool claim, uint8 phrasing)',
  'function accuse(uint256 tableId, uint256 answerId)',
  'function settleAccusation(uint256 tableId, tuple(bytes32 handle, bytes32 value) decryption, bytes[] signatures)',
  'function declare(uint256 tableId, uint8 guess)',
  'function settleDeclaration(uint256 tableId, tuple(bytes32 handle, bytes32 value) decryption, bytes[] signatures)',
  'function claimTimeout(uint256 tableId)',
  'function seatCard(uint256 tableId, uint8 seat) view returns (bytes32 id, bytes32 mask)',
  'function tableState(uint256 tableId) view returns (uint8 phase, uint8 filled, uint8 alive, uint8 turn, bool awaitingAnswer, uint8 responder, uint32 pot, uint64 deadline)',
  'function pendingReveal(uint256 tableId) view returns (uint256 answerId, uint8 actor, uint8 guess, bytes32 handle)',
  'function ledgerLength(uint256 tableId) view returns (uint256)',
  'function nextTable() view returns (uint256)',
  'function ledger(uint256 tableId, uint256 i) view returns (uint8 asker, uint8 responder, uint8 queryMask, bool modeAll, bool answered, bool claim, uint8 phrasing, uint64 askedAt, uint32 elapsed, bytes32 truth, bool audited, bool wasLie)',
  'function glasses(address) view returns (uint32)',
  'function served(address) view returns (bool)',
  'function refill()',
  'function seatOwner(uint256 tableId, uint8 seat) view returns (address)',
  'error NotYourTurn()',
  'error NotYou()',
  'error WrongPhase()',
  'error NoGlasses()',
  'error BadQuery()',
  'error StillInTime()',
  'event Seated(uint256 indexed tableId, uint8 seat, address player)',
  'event Dealt(uint256 indexed tableId)',
  'event Asked(uint256 indexed tableId, uint256 answerId, uint8 asker, uint8 responder, uint8 queryMask, bool modeAll)',
  'event Answered(uint256 indexed tableId, uint256 answerId, bool claim, uint8 phrasing, uint32 elapsed)',
  'event Verdict(uint256 indexed tableId, uint256 answerId, bool wasLie, uint8 eliminated)',
  'event Won(uint256 indexed tableId, uint8 seat, uint32 pot)',
];

const PHASE = ['Open', 'Playing', 'AwaitingAccusation', 'AwaitingDeclaration', 'Closed'];
const BOT_SEATS = 4;

function ethersWalletClient(wallet) {
  return {
    account: { address: wallet.address },
    transport: { url: 'UNUSED IN TEST' },
    request: async ({ method, params }) => wallet.provider.send(method, params || []),
    signTypedData: async payload => {
      const types = { ...payload.types };
      delete types.EIP712Domain;
      return wallet.signTypedData(payload.domain, types, payload.message);
    },
  };
}

function hexFromBytes(bytes) {
  if (typeof bytes === 'string') return bytes;
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

function valueToBytes32(value) {
  const raw = value && typeof value === 'object' && 'value' in value ? value.value : value;
  const n = typeof raw === 'boolean' ? (raw ? 1n : 0n) : BigInt(raw);
  return `0x${n.toString(16).padStart(64, '0')}`;
}

function attestationForSolidity(attestation) {
  return {
    decryption: {
      handle: attestation.handle,
      value: valueToBytes32(attestation.plaintext ?? attestation.value),
    },
    signatures: (attestation.covalidatorSignatures ?? attestation.signatures ?? []).map(hexFromBytes),
  };
}

function plaintextValue(attestation) {
  const plaintext = attestation?.plaintext ?? attestation;
  return plaintext && typeof plaintext === 'object' && 'value' in plaintext ? plaintext.value : plaintext;
}

function describeError(err, depth = 0) {
  if (!err || depth > 4) return '';
  const head = err.shortMessage || err.message || String(err);
  const cause = err.cause ? describeError(err.cause, depth + 1) : '';
  return cause && cause !== head ? `${head} :: ${cause}` : head;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function ciphertextPending(err) {
  const message = describeError(err).toLowerCase();
  return message.includes('not found')
    || message.includes('not have been processed yet')
    || message.includes('cannot reach threshold')
    || message.includes("cannot read properties of null");
}

async function waitForCiphertext(label, operation) {
  const attempts = Number(process.env.INCO_RETRY_ATTEMPTS || 12);
  const baseDelay = Number(process.env.INCO_RETRY_MS || 5000);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!ciphertextPending(err) || attempt === attempts) throw err;
      const delay = Math.min(baseDelay * attempt, 15000);
      console.log(`${new Date().toISOString().slice(11, 19)} Inco ${label} pending; retry ${attempt}/${attempts} in ${delay}ms`);
      await wait(delay);
    }
  }
  throw lastError;
}

async function decryptHandle(zap, wallet, handle) {
  return waitForCiphertext('decrypt', async () => {
    const [attestation] = await zap.attestedDecrypt(ethersWalletClient(wallet), [handle]);
    return plaintextValue(attestation);
  });
}

async function revealHandle(zap, handle) {
  return waitForCiphertext('reveal', async () => {
    const [attestation] = await zap.attestedReveal([handle]);
    return attestationForSolidity(attestation);
  });
}

/** A liar takes longer, but not reliably. That unreliability is the game. */
function hesitation(lying) {
  const base = lying
    ? (Math.random() < 0.6 ? 3200 + Math.random() * 3000 : 900 + Math.random() * 900)
    : (Math.random() < 0.15 ? 3000 + Math.random() * 2000 : 700 + Math.random() * 1000);
  return Math.round(base);
}

export class Keeper {
  constructor() {
    if (!RPC || !ADDRESS || KEYS.length < 5)
      throw new Error('set RPC_URL, CONTRACT and five KEEPER_KEYS');
    this.provider = new ethers.JsonRpcProvider(RPC);
    this.wallets = KEYS.slice(0, 5).map(k => new ethers.Wallet(k, this.provider));
    this.game = this.wallets.map(w => new ethers.Contract(ADDRESS, ABI, w));
    this.read = new ethers.Contract(ADDRESS, ABI, this.provider);
    this.zap = null;
    this.bots = null;
    this.tableId = null;
    this.running = true;
    this.onStep = null; this.onError = null; this.onBalances = null;
    // One nonce owner per wallet. Two keepers on the same keys would collide,
    // which is why fly.toml pins this to a single machine.
    this.nonces = new Map();
    this.lastBalanceCheck = 0;
  }

  stop() { this.running = false; }

  /**
   * Send with an explicit nonce we track ourselves. The public RPC's pending
   * count lags, and a keeper that fires two moves inside one block will get
   * one of them silently dropped.
   */
  async send(seat, fn, args, overrides = {}) {
    const w = this.wallets[seat];
    if (!this.nonces.has(seat)) {
      this.nonces.set(seat, await this.provider.getTransactionCount(w.address, 'pending'));
    }
    const nonce = this.nonces.get(seat);
    try {
      const tx = await this.game[seat][fn](...args, { ...overrides, nonce });
      this.nonces.set(seat, nonce + 1);
      return await tx.wait();
    } catch (err) {
      // Anything nonce-shaped means our count drifted; resync and let the loop retry.
      const m = (err.shortMessage || err.message || '').toLowerCase();
      if (m.includes('nonce') || m.includes('replacement')) this.nonces.delete(seat);
      throw err;
    }
  }

  /**
   * The contract pays Inco per encrypted operation out of its own balance, and
   * the seats pay gas out of theirs. Either running dry stops the room, so it
   * is worth knowing before it happens rather than after.
   */
  async checkBalances() {
    if (Date.now() - this.lastBalanceCheck < 60000) return;
    this.lastBalanceCheck = Date.now();
    const balances = {};
    let low = false;
    for (let s = 0; s < 5; s++) {
      const b = await this.provider.getBalance(this.wallets[s].address);
      balances[`seat${s}`] = ethers.formatEther(b);
      if (b < ethers.parseEther('0.002')) low = true;
    }
    const cb = await this.provider.getBalance(ADDRESS);
    if (cb < ethers.parseEther('0.005')) {
      this.log(`! contract float is down to ${ethers.formatEther(cb)} ETH — deals will start failing`);
      low = true;
    }
    if (low) this.log('! top up before the table stalls');
    this.onBalances?.({ balances, contractBalance: ethers.formatEther(cb) });
  }

  log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

  async ensureAnte(seat) {
    const address = this.wallets[seat].address;
    const balance = await this.read.glasses(address);
    if (balance > 0n) return;
    if (!(await this.read.served(address))) return; // first sit pours the initial five
    await this.send(seat, 'refill', []);
    this.log(`seat ${seat} refilled for the next table`);
  }

  async initZap() {
    if (this.zap) return;
    this.zap = INCO_ENV === 'mainnet'
      ? await Lightning.baseMainnet({ hostChainRpcUrls: [RPC] })
      : await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [RPC] });
    const deployment = this.zap.deployment || {};
    this.log(`Inco ${INCO_ENV} executor ${deployment.executorAddress || this.zap.executorAddress} major ${deployment.majorVersion || 'unknown'}`);
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') this.log('Inco testnet TLS verification disabled for covalidators');
    if (this.zap.covalidatorUrls) this.log(`Inco covalidators ${this.zap.covalidatorUrls.join(', ')}`);
  }

  /** Open a table, seat four regulars, and leave the last chair for a visitor. */
  async openTable() {
    const seatValue = ethers.parseEther(TABLE_FUND);
    await this.ensureAnte(0);
    const rc = await this.send(0, 'openTable', [], { value: seatValue });
    this.tableId = 0n;
    for (const ev of rc.logs) {
      try {
        const p = this.read.interface.parseLog(ev);
        if (p?.name === 'Seated') this.tableId = p.args.tableId;
      } catch { /* not ours */ }
    }
    this.log(`table ${this.tableId} opened by seat 0`);
    for (let s = 1; s < BOT_SEATS; s++) {
      await this.ensureAnte(s);
      await this.send(s, 'sit', [this.tableId], { value: seatValue });
      this.log(`seat ${s} sat down`);
    }
    this.bots = null;
    this.log(`table ${this.tableId} is waiting for a player in seat ${BOT_SEATS}`);
  }

  async ensureTable() {
    const seatValue = ethers.parseEther(TABLE_FUND);
    const next = Number(await this.read.nextTable());
    if (next > 0) {
      const candidate = BigInt(next - 1);
      const st = await this.read.tableState(candidate);
      const phase = PHASE[Number(st.phase)];
      if (phase !== 'Closed') {
        if (phase !== 'Open' && Number(st.filled) === 5) {
          const keeperAddresses = new Set(this.wallets.map(wallet => wallet.address.toLowerCase()));
          const owners = [];
          for (let seat = 0; seat < 5; seat++) owners.push((await this.read.seatOwner(candidate, seat)).toLowerCase());
          if (owners.every(owner => keeperAddresses.has(owner))) {
            this.log(`leaving legacy all-bot table ${candidate} and opening a visitor table`);
            await this.openTable();
            return;
          }
        }
        this.tableId = candidate;
        if (phase === 'Open') {
          for (let s = Number(st.filled); s < BOT_SEATS; s++) {
            await this.ensureAnte(s);
            await this.send(s, 'sit', [this.tableId], { value: seatValue });
            this.log(`seat ${s} sat down`);
          }
          this.bots = null;
          this.log(`table ${this.tableId} is waiting for a player in seat ${BOT_SEATS}`);
          return;
        }
        await this.deal();
        return;
      }
    }
    await this.openTable();
  }

  /**
   * Read the four cards this seat is permitted to see. A seat asking for its
   * own card gets a rejection from the covalidators, which is the whole game
   * expressed as an access error.
   */
  async readTable() {
    const owners = [];
    for (let seat = 0; seat < 5; seat++) owners.push((await this.read.seatOwner(this.tableId, seat)).toLowerCase());
    const keeperByAddress = new Map(this.wallets.map((wallet, index) => [wallet.address.toLowerCase(), index]));
    const cards = [];
    for (let seat = 0; seat < 5; seat++) {
      const viewerSeat = owners.findIndex((owner, candidate) => candidate !== seat && keeperByAddress.has(owner));
      if (viewerSeat < 0) throw new Error(`no keeper may read seat ${seat}`);
      const viewer = keeperByAddress.get(owners[viewerSeat]);
      const [idHandle] = await this.read.seatCard(this.tableId, seat);
      const id = await decryptHandle(this.zap, this.wallets[viewer], idHandle);
      cards.push(Number(id));
    }
    return cards;
  }

  async deal() {
    const cards = await this.readTable();
    const keeperAddresses = new Set(this.wallets.map(wallet => wallet.address.toLowerCase()));
    const owners = [];
    for (let seat = 0; seat < 5; seat++) owners.push((await this.read.seatOwner(this.tableId, seat)).toLowerCase());
    this.bots = PERSONALITIES.map((p, s) => {
      if (!keeperAddresses.has(owners[s])) return null;
      const b = createBot(p, s);
      b.myTrueId = cards[s];
      b.observe(cards.filter((_, k) => k !== s), cards.map((id, k) => (k === s ? null : id)));
      return b;
    });
    this.log('dealt: ' + cards.map((c, s) => `${s}:${AGENTS[c].name}`).join('  '));
  }

  /** Replay any ledger rows the bots have not seen yet. */
  async syncLedger() {
    const n = Number(await this.read.ledgerLength(this.tableId));
    const firstBot = this.bots.find(Boolean);
    if (!firstBot) return;
    const known = firstBot.answers.length;
    for (let i = known; i < n; i++) {
      const row = await this.read.ledger(this.tableId, i);
      if (!row.answered) continue;
      const entry = {
        id: i, asker: Number(row.asker), responder: Number(row.responder),
        queryMask: Number(row.queryMask), modeAll: row.modeAll,
        claim: row.claim, answered: true, elapsed: Number(row.elapsed),
        audited: row.audited,
      };
      this.bots.forEach(b => b?.record(entry));
    }
  }

  async step() {
    const st = await this.read.tableState(this.tableId);
    const phase = PHASE[Number(st.phase)];

    if (phase === 'Closed') { this.log('table closed'); this.tableId = null; this.bots = null; return; }

    // Four bots are seated, but the deal deliberately waits for a visitor.
    if (phase === 'Open') return;

    if (!this.bots) await this.deal();

    // A reveal is pending: post the attestation so the room can carry on.
    if (phase === 'AwaitingAccusation' || phase === 'AwaitingDeclaration') {
      await this.settlePending(phase);
      return;
    }

    // Nobody has moved inside the window: take the seat out and carry on.
    if (Number(st.deadline) > 0 && Date.now() / 1000 > Number(st.deadline) + 5) {
      this.log('  turn timed out — claiming');
      await this.send(0, 'claimTimeout', [this.tableId]);
      return;
    }

    await this.syncLedger();

    // Somebody owes an answer.
    if (st.awaitingAnswer) {
      const seat = Number(st.responder);
      const n = Number(await this.read.ledgerLength(this.tableId));
      const row = await this.read.ledger(this.tableId, n - 1);
      const asker = Number(row.asker);
      const bot = this.bots[seat];
      if (!bot) return;                              // the visitor must answer
      const { claim, honest } = bot.respond(asker, bot.knownIdOf(asker), Number(row.queryMask), row.modeAll);
      const lying = claim !== honest;
      await wait(hesitation(lying));               // the tell, paid for in real time
      await this.send(seat, 'respond', [this.tableId, claim, lying ? 2 : 0]);
      this.log(`  seat ${seat} answers ${claim ? 'YES' : 'NO'}${lying ? '   [lie]' : ''}`);
      return;
    }

    // Anybody who was lied to may spend a glass.
    for (let s = 0; s < 5; s++) {
      const target = this.bots[s]?.accusation();
      if (!target) continue;
      const bal = await this.read.glasses(this.wallets[s].address);
      if (bal < 1n) continue;
      await this.send(s, 'accuse', [this.tableId, target.id]);
      this.log(`  seat ${s} calls answer #${target.id} a lie`);
      return;
    }

    // Whoever's turn it is either names themselves or asks.
    const me = Number(st.turn);
    const bot = this.bots[me];
    if (!bot) return;                                // the visitor's turn
    const guess = bot.declaration();
    if (guess != null) {
      await this.send(me, 'declare', [this.tableId, guess]);
      this.log(`  seat ${me} declares ${AGENTS[guess].name}`);
      return;
    }
    const q = bot.ask();
    await this.send(me, 'ask', [this.tableId, q.queryMask, q.modeAll]);
    this.log(`  seat ${me} asks: ${describeQuery(q.queryMask, q.modeAll)}`);
  }

  /** Reveal settlement is attestation-driven in current @inco/lightning. */
  async settlePending(phase) {
    const pending = await this.read.pendingReveal(this.tableId);
    const { decryption, signatures } = await revealHandle(this.zap, pending.handle);
    const fn = phase === 'AwaitingAccusation' ? 'settleAccusation' : 'settleDeclaration';
    await this.send(0, fn, [this.tableId, decryption, signatures]);
    this.log(`  ${phase} settled`);
  }

  async run() {
    while (this.running) {
      try {
        await this.initZap();
        await this.checkBalances();
        if (this.tableId == null) await this.ensureTable();
        await this.step();
        this.onStep?.({ tableId: this.tableId?.toString() });
        await wait(1200);
      } catch (err) {
        this.log('!', describeError(err));
        this.onError?.(err);
        await wait(5000);
      }
    }
    this.log('stopped');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  new Keeper().run().catch(e => { console.error(e); process.exit(1); });
}
