/**
 * The same table, played against a deployed contract.
 *
 * Two things live here. `ChainSession` seats you at a table with a wallet.
 * `Observer` watches the house table without one, which is the mode the demo
 * runs in: it needs no signature, no gas and no permission, because everything
 * it shows is public by design — the questions, the claims, and how long each
 * answer took. The cards stay hidden until the contract declassifies them,
 * which is the honest thing for a spectator to see.
 */

import { AGENTS, describeQuery, truthfulAnswer, candidates, SEATS } from './rules.js';
import { PHASE, fail, done, readableError } from './iface.js';

export const ABI = [
  'function openTable() payable returns (uint256)',
  'function sit(uint256 tableId) payable',
  'function ask(uint256 tableId, uint8 queryMask, bool modeAll)',
  'function respond(uint256 tableId, bool claim, uint8 phrasing)',
  'function accuse(uint256 tableId, uint256 answerId)',
  'function declare(uint256 tableId, uint8 guess)',
  'function claimTimeout(uint256 tableId)',
  'function seatCard(uint256 tableId, uint8 seat) view returns (bytes32 id, bytes32 mask)',
  'function tableState(uint256 tableId) view returns (uint8 phase, uint8 filled, uint8 alive, uint8 turn, bool awaitingAnswer, uint8 responder, uint32 pot, uint64 deadline)',
  'function ledgerLength(uint256 tableId) view returns (uint256)',
  'function ledger(uint256 tableId, uint256 i) view returns (uint8 asker, uint8 responder, uint8 queryMask, bool modeAll, bool answered, bool claim, uint8 phrasing, uint64 askedAt, uint32 elapsed, bytes32 truth, bool audited, bool wasLie)',
  'function glasses(address) view returns (uint32)',
  'function seatOwner(uint256 tableId, uint8 seat) view returns (address)',
  'function nextTable() view returns (uint256)',
  'error WrongPhase()',
  'error NoGlasses()',
  'error NotYourTurn()',
  'error NotYou()',
  'error BadQuery()',
];

const CONTRACT_PHASE = ['idle', 'playing', 'awaiting-accusation', 'awaiting-declaration', 'closed'];

/* --------------------------------------------------------------- the wallet */

export const CHAINS = {
  84532: { name: 'Base Sepolia', hex: '0x14a34', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  8453:  { name: 'Base',         hex: '0x2105',  rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};

function providerLabel(entry) {
  return `${entry.info?.rdns || ''} ${entry.info?.name || ''}`.toLowerCase();
}

/** Discover EIP-6963 wallets, then fall back to the legacy injected list. */
export async function injectedProvider() {
  const found = [];
  const add = (provider, info = {}) => {
    if (provider?.request && !found.some(entry => entry.provider === provider)) found.push({ provider, info });
  };
  const receive = event => add(event?.detail?.provider, event?.detail?.info);
  if (globalThis.addEventListener && globalThis.dispatchEvent && globalThis.CustomEvent) {
    globalThis.addEventListener('eip6963:announceProvider', receive);
    globalThis.dispatchEvent(new CustomEvent('eip6963:requestProvider'));
    await new Promise(resolve => setTimeout(resolve, 80));
    globalThis.removeEventListener('eip6963:announceProvider', receive);
  }
  const legacy = globalThis.ethereum;
  for (const provider of legacy?.providers || []) add(provider);
  add(legacy);

  return found.find(entry => entry.provider.isRabby || providerLabel(entry).includes('rabby'))?.provider
    || found.find(entry => entry.provider.isMetaMask && !entry.provider.isPhantom)?.provider
    || found.find(entry => !entry.provider.isPhantom)?.provider
    || found[0]?.provider;
}

/**
 * Ask for an account, then make sure it is on the right chain. Both steps can
 * be refused, and refusal is a normal answer — so neither throws past here.
 */
export async function connectWallet(chainId) {
  const eth = await injectedProvider();
  if (!eth) return fail('No wallet in this browser. The table upstairs plays without one.');

  try {
    const accounts = await eth.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) return fail('No account offered.');

    const want = CHAINS[chainId];
    const have = await eth.request({ method: 'eth_chainId' });
    if (have?.toLowerCase() !== want.hex) {
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want.hex }] });
      } catch (err) {
        // 4902: the wallet has never heard of this chain. Offer to add it.
        if (err?.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: want.hex, chainName: want.name,
              rpcUrls: [want.rpc], blockExplorerUrls: [want.explorer],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            }],
          });
        } else {
          return fail(readableError(err));
        }
      }
    }
    return done({ address: accounts[0], provider: eth });
  } catch (err) {
    return fail(readableError(err));
  }
}

/* ------------------------------------------------------------ shared reading */

/** Pull the public record. Anybody may do this; no wallet, no permission. */
async function readLedger(contract, tableId, from = 0) {
  const n = Number(await contract.ledgerLength(tableId));
  const rows = [];
  for (let i = from; i < n; i++) {
    const r = await contract.ledger(tableId, i);
    rows.push({
      id: i,
      asker: Number(r.asker),
      responder: Number(r.responder),
      queryMask: Number(r.queryMask),
      modeAll: r.modeAll,
      text: describeQuery(Number(r.queryMask), r.modeAll),
      answered: r.answered,
      claim: r.claim,
      elapsed: Number(r.elapsed),
      audited: r.audited,
      wasLie: r.audited ? r.wasLie : undefined,
      truth: r.truth,
    });
  }
  return rows;
}

async function readState(contract, tableId) {
  const s = await contract.tableState(tableId);
  return {
    phase: CONTRACT_PHASE[Number(s.phase)],
    filled: Number(s.filled),
    alive: Number(s.alive),
    turn: Number(s.turn),
    awaitingAnswer: s.awaitingAnswer,
    responder: Number(s.responder),
    pot: Number(s.pot),
    deadline: Number(s.deadline),
  };
}

function ethersWalletClient(signer, address, provider) {
  return {
    account: { address },
    transport: { url: 'UNUSED IN TEST' },
    request: async ({ method, params }) => provider?.request
      ? provider.request({ method, params: params || [] })
      : signer.provider.send(method, params || []),
    signTypedData: async payload => {
      const types = { ...payload.types };
      delete types.EIP712Domain;
      return signer.signTypedData(payload.domain, types, payload.message);
    },
  };
}

function plaintextValue(attestation) {
  const plaintext = attestation?.plaintext ?? attestation;
  return plaintext && typeof plaintext === 'object' && 'value' in plaintext ? plaintext.value : plaintext;
}

function errorDetail(err) {
  const messages = [];
  for (let current = err; current && messages.length < 4; current = current.cause) {
    const message = current.shortMessage || current.message;
    if (message && !messages.includes(message)) messages.push(message);
  }
  return messages.join(': ') || String(err);
}

async function decryptHandles(zap, signer, address, provider, handles) {
  const walletClient = ethersWalletClient(signer, address, provider);
  let batchError;
  try {
    const attestations = await zap.attestedDecrypt(walletClient, handles);
    if (attestations?.length === handles.length) return attestations.map(plaintextValue);
  } catch (err) { batchError = err; /* some Inco clients reject a fresh multi-handle request */ }

  const values = [];
  try {
    for (const handle of handles) {
      const [attestation] = await zap.attestedDecrypt(walletClient, [handle]);
      values.push(plaintextValue(attestation));
    }
  } catch (err) {
    const detail = errorDetail(err);
    const batch = errorDetail(batchError);
    throw new Error(`Inco decrypt failed: ${detail}${batch && batch !== detail ? ` (batch: ${batch})` : ''}`, { cause: err });
  }
  return values;
}

/* -------------------------------------------------------------- the observer */

/**
 * Watch the house table. No wallet, no signature, nothing asked of the visitor.
 *
 * An observer holds no decryption permission for anybody's card, and that is
 * not a limitation to work around — it is the game seen from the doorway. You
 * hear the questions and the answers and you watch people take too long, and
 * you find out who everyone was when the contract declassifies at the end.
 */
export function createObserver({ contract, tableId, onEvent = () => {}, interval = 4000 }) {
  let stopped = false;
  let ledger = [];
  let st = null;
  let timer = null;

  const view = () => ({
    phase: st?.phase === 'closed' ? PHASE.OVER : PHASE.BOTS,
    you: -1,
    turn: st?.turn ?? 0,
    alive: Array(SEATS).fill(true),
    glasses: 0,
    ledger,
    cards: Array(SEATS).fill(null),   // nobody at the door gets to look
    winner: null,
    notice: st?.phase === 'closed' ? 'The night is over.' : null,
  });

  async function poll() {
    if (stopped) return;
    if (timer) { clearTimeout(timer); timer = null; }
    try {
      const fresh = await readState(contract, tableId);
      const rows = await readLedger(contract, tableId);
      const changed = rows.length !== ledger.length || fresh.phase !== st?.phase || fresh.turn !== st?.turn;
      st = fresh;
      for (let i = 0; i < rows.length; i++) {
        const previous = ledger[i];
        const current = rows[i];
        if (!previous) onEvent({ type: current.answered ? 'answered' : 'asked', entry: current });
        else if (!previous.answered && current.answered) onEvent({ type: 'answered', entry: current });
      }
      ledger = rows;
      if (changed) onEvent({ type: 'tick', view: view() });
    } catch (err) {
      onEvent({ type: 'notice', text: readableError(err) });
    }
    timer = setTimeout(poll, interval);
  }

  poll();

  return {
    view,
    yourCandidates: () => [],
    yourAnswers: () => [],
    pendingForYou: () => null,
    ask: async () => fail('You are watching, not playing.'),
    respond: async () => fail('Nobody asked you.'),
    accuse: async () => fail('You are watching, not playing.'),
    declare: async () => fail('You are watching, not playing.'),
    refresh: poll,
    destroy() { stopped = true; if (timer) clearTimeout(timer); },
  };
}

/* ------------------------------------------------------------- playing a seat */

/**
 * A seat of your own.
 *
 * The four cards you are allowed to read take an attested decrypt signature.
 * Wallet extensions only permit that signature from an explicit click, so the
 * screen calls `decryptCards()` after the player chooses to reveal them.
 */
export function createChainSession({
  contract, signer, provider, zap, tableId, seat, address,
  onEvent = () => {}, interval = 3500,
}) {
  let stopped = false;
  let ledger = [];
  let st = null;
  let cards = Array(SEATS).fill(null);
  let glasses = 0;
  let timer = null;
  let dealtSent = false;
  let decrypting = false;

  const emit = (type, data = {}) => onEvent({ type, ...data });

  const yourAnswers = () => ledger.filter(a => a.asker === seat && a.answered);

  const yourCandidates = (allowLies = 0) => {
    const seen = cards.filter((c, i) => i !== seat && c != null);
    // Until the cards are readable there is nothing to deduce from.
    if (seen.length < SEATS - 1) return [];
    return candidates(seen, yourAnswers(), allowLies);
  };

  /**
   * Read every forehead but your own.
   *
   * A rejection on your own seat is not an error to report — it is the game
   * working. We never ask for it.
   */
  async function readCards() {
    const next = Array(SEATS).fill(null);
    const seats = [];
    const handles = [];
    for (let s = 0; s < SEATS; s++) {
      if (s === seat) continue;
      const [idHandle] = await contract.seatCard(tableId, s);
      seats.push(s);
      handles.push(idHandle);
    }
    const ids = await decryptHandles(zap, signer, address, provider, handles);
    seats.forEach((cardSeat, index) => { next[cardSeat] = Number(ids[index]); });
    cards = next;
  }

  async function decryptCards() {
    if (dealtSent) return done();
    if (decrypting) return fail('The cards are already being decrypted.');
    decrypting = true;
    emit('notice', { text: 'Approve the Inco card signature in your wallet…' });
    try {
      await readCards();
      dealtSent = true;
      emit('dealt', { cards });
      return done();
    } catch (err) {
      const detail = errorDetail(err);
      emit('notice', { text: `Inco decrypt failed: ${detail}` });
      return fail(detail);
    } finally {
      decrypting = false;
    }
  }

  function view() {
    const closed = st?.phase === 'closed';
    return {
      phase: closed ? PHASE.OVER
        : st?.awaitingAnswer && st?.responder === seat ? PHASE.RESPOND
        : st?.turn === seat ? PHASE.ASK
        : PHASE.BOTS,
      you: seat,
      turn: st?.turn ?? 0,
      alive: Array(SEATS).fill(true),
      glasses,
      ledger,
      cards,
      winner: null,
    };
  }

  async function poll() {
    if (stopped) return;
    if (timer) { clearTimeout(timer); timer = null; }
    try {
      const fresh = await readState(contract, tableId);
      const rows = await readLedger(contract, tableId);
      st = fresh;
      glasses = Number(await contract.glasses(address));

      for (let i = 0; i < rows.length; i++) {
        const previous = ledger[i];
        const current = rows[i];
        if (!previous) emit(current.answered ? 'answered' : 'asked', { entry: current });
        else if (!previous.answered && current.answered) emit('answered', { entry: current });
        if (!previous?.audited && current.audited) emit('verdict', { entry: current, wasLie: current.wasLie });
      }
      ledger = rows;
      emit('tick', { view: view() });
    } catch (err) {
      emit('notice', { text: readableError(err) });
    }
    timer = setTimeout(poll, interval);
  }

  /** Every write is the same shape: send, wait, pull, report. */
  async function write(fn, args, label) {
    try {
      emit('notice', { text: `${label}…` });
      const tx = await contract[fn](...args);
      emit('notice', { text: 'waiting on the chain' });
      await tx.wait();
      await poll();
      return done();
    } catch (err) {
      const why = readableError(err);
      emit('notice', { text: why });
      return fail(why);
    }
  }

  poll();

  return {
    view,
    yourCandidates,
    yourAnswers,

    pendingForYou() {
      if (!st?.awaitingAnswer || st.responder !== seat) return null;
      const entry = ledger[ledger.length - 1];
      if (!entry || entry.answered) return null;
      const askerCard = cards[entry.asker];
      if (askerCard == null) return null;
      return {
        entry, asker: entry.asker,
        askerAgent: AGENTS[askerCard],
        honest: truthfulAnswer(AGENTS[askerCard].mask, entry.queryMask, entry.modeAll),
      };
    },

    decryptCards,

    ask: (mask, all) => write('ask', [tableId, mask, all], 'asking the room'),

    /**
     * `heldFor` is measured by the screen, not the chain. The contract can only
     * see the gap between two blocks, which on Base is the network's pause and
     * not yours — so the tell is taken from the clock in front of you and sent
     * along with the answer.
     */
    respond: (claim, heldFor) =>
      write('respond', [tableId, claim, Math.min(255, Math.max(0, heldFor | 0))], 'answering'),

    accuse: (id) => write('accuse', [tableId, id], 'calling it'),
    declare: (agentId) => write('declare', [tableId, agentId], 'naming yourself'),
    refresh: poll,
    destroy() { stopped = true; if (timer) clearTimeout(timer); },
  };
}
