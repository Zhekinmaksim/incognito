/**
 * A table you can sit at.
 *
 * `table.js` plays a whole night in one call, which is right for balance work
 * and useless for a person. This is the same rules driven one move at a time,
 * so a screen can wait for a human between them.
 *
 * Seat 0 is yours. The bots act on their own turns and answer when the house
 * picks them, exactly as they do in the simulator.
 */

import { AGENTS, ROSTER, SEATS, candidates, describeQuery, traitsOf, truthfulAnswer } from './rules.js';
import { createBot, PERSONALITIES } from './bots.js';

export const PHASE = {
  ASK: 'ask',                 // your turn: ask or declare
  WAITING: 'waiting',         // a responder is deciding
  RESPOND: 'respond',         // the house picked you: answer, or lie
  BOTS: 'bots',               // other seats are playing
  OVER: 'over',
};

function shuffled(rng) {
  const d = [...Array(ROSTER).keys()];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function createSession({ rng = Math.random, onEvent = () => {} } = {}) {
  const ids = shuffled(rng).slice(0, SEATS);

  // The four regulars, seated around you.
  const bots = [null];
  PERSONALITIES.slice(0, SEATS - 1).forEach((p, i) => {
    const seat = i + 1;
    const b = createBot(p, seat, rng);
    b.myTrueId = ids[seat];
    b.observe(ids.filter((_, k) => k !== seat), ids.map((id, k) => (k === seat ? null : id)));
    b.glasses = 5;
    bots[seat] = b;
  });

  const S = {
    ids,
    seats: [...Array(SEATS).keys()],
    alive: Array(SEATS).fill(true),
    skip: Array(SEATS).fill(false),
    ledger: [],
    turn: 0,
    phase: PHASE.ASK,
    glasses: 5,
    winner: null,
    pending: null,     // the question awaiting an answer
    lastVerdict: null,
  };

  const emit = (type, data) => onEvent({ type, ...data });
  const aliveSeats = () => S.seats.filter(s => S.alive[s]);

  /** What you can see: every forehead but your own. */
  const seenByYou = () => ids.filter((_, k) => k !== 0);

  /** The answers you were given. Only these constrain who you are. */
  const yourAnswers = () => S.ledger.filter(a => a.asker === 0 && a.answered);

  /** Your candidate list, as the screen draws it. */
  function yourCandidates(allowLies = 0) {
    return candidates(seenByYou(), yourAnswers(), allowLies);
  }

  function eliminate(seat, why) {
    if (!S.alive[seat]) return;
    S.alive[seat] = false;
    emit('eliminated', { seat, why });
    const left = aliveSeats();
    if (left.length === 1) finish(left[0]);
  }

  function finish(winner) {
    S.winner = winner;
    S.phase = PHASE.OVER;
    emit('over', { winner, ids });
  }

  function advance() {
    for (let step = 1; step <= SEATS; step++) {
      const n = (S.turn + step) % SEATS;
      if (S.alive[n]) { S.turn = n; return; }
    }
  }

  /** A liar takes longer, but not reliably. That unreliability is the game. */
  function hesitation(lying) {
    return lying
      ? (rng() < 0.6 ? 3 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 2))
      : (rng() < 0.15 ? 3 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2));
  }

  /** Somebody asks the room a question about themselves. */
  function askFrom(seat, queryMask, modeAll) {
    const others = aliveSeats().filter(s => s !== seat);
    if (!others.length) { finish(seat); return null; }
    const responder = others[Math.floor(rng() * others.length)];

    const entry = {
      id: S.ledger.length, asker: seat, responder,
      queryMask, modeAll, answered: false, audited: false,
      text: describeQuery(queryMask, modeAll),
    };
    S.ledger.push(entry);
    S.pending = entry;
    emit('asked', { entry });
    return entry;
  }

  /**
   * The named seat answers.
   *
   * When that seat is yours the session stops and waits: you can read the
   * asker's forehead, so you know the honest answer, and the only decision
   * left is whether to give it.
   */
  function resolveAnswer(entry, humanClaim = null) {
    if (entry.responder === 0) {
      const honest = truthfulAnswer(AGENTS[ids[entry.asker]].mask, entry.queryMask, entry.modeAll);
      if (humanClaim === null) return null;          // the screen has to ask you
      const lied = humanClaim !== honest;
      entry.claim = humanClaim;
      entry.honest = honest;
      entry.told = lied ? 'lie' : 'truth';
      entry.answered = true;
      entry.elapsed = S.yourHesitation ?? hesitation(lied);
      S.yourHesitation = null;
      for (let s = 1; s < SEATS; s++) bots[s].record(entry);
      S.pending = null;
      emit('answered', { entry });
      return entry;
    }
    const bot = bots[entry.responder];
    const { claim, honest } = bot.respond(entry.asker, ids[entry.asker], entry.queryMask, entry.modeAll);
    const lied = claim !== honest;

    entry.claim = claim;
    entry.honest = honest;
    entry.told = lied ? 'lie' : 'truth';
    entry.answered = true;
    entry.elapsed = hesitation(lied);

    for (let s = 1; s < SEATS; s++) bots[s].record(entry);
    S.pending = null;
    emit('answered', { entry });
    return entry;
  }

  /** Everyone but the victim can see a lie land. Only the victim may call it. */
  function botAccusations() {
    for (const s of aliveSeats()) {
      if (s === 0) continue;
      const target = bots[s].accusation();
      if (!target || target.audited || target.asker !== s) continue;
      if (bots[s].glasses < 1) continue;
      bots[s].glasses -= 1;
      resolveAccusation(s, target);
      return true;
    }
    return false;
  }

  function resolveAccusation(accuser, entry) {
    entry.audited = true;
    const wasLie = entry.told === 'lie';
    entry.wasLie = wasLie;
    S.lastVerdict = { accuser, id: entry.id, wasLie, responder: entry.responder };
    for (let s = 1; s < SEATS; s++) bots[s].learnVerdict(entry.id, entry.responder, wasLie);
    emit('verdict', { accuser, entry, wasLie });

    if (wasLie) {
      // Opening it hands the victim the honest answer. That is the price.
      entry.claim = entry.honest;
      entry.corrected = true;
      eliminate(entry.responder, 'caught lying');
    } else {
      S.skip[accuser] = true;
      emit('penalty', { seat: accuser });
    }
  }

  // ---------------------------------------------------------------- your moves

  const api = {
    state: S,
    ids,
    bots,
    yourCandidates,
    yourAnswers,
    seenByYou,
    agentAt: (seat) => AGENTS[ids[seat]],
    personalityAt: (seat) => (seat === 0 ? 'YOU' : bots[seat].personality),

    /** Ask the room about yourself. */
    ask(queryMask, modeAll = false) {
      if (S.phase !== PHASE.ASK || S.turn !== 0) return { ok: false, why: 'not your turn' };
      if (!queryMask) return { ok: false, why: 'pick at least one trait' };
      const entry = askFrom(0, queryMask, modeAll);
      if (!entry) return { ok: true };
      S.phase = PHASE.WAITING;
      return { ok: true, entry };
    },

    /** Called by the screen once it has held the pause for the tell. */
    settleAnswer() {
      if (!S.pending) return null;
      const entry = resolveAnswer(S.pending);
      S.phase = PHASE.BOTS;
      return entry;
    },

    /**
     * You have been asked. This is what you can see on their forehead, which
     * is to say: this is the truth, and nobody can make you tell it.
     */
    pendingForYou() {
      const e = S.pending;
      if (!e || e.responder !== 0) return null;
      return {
        entry: e,
        asker: e.asker,
        askerAgent: AGENTS[ids[e.asker]],
        honest: truthfulAnswer(AGENTS[ids[e.asker]].mask, e.queryMask, e.modeAll),
      };
    },

    /** Answer them. `heldFor` is how long the screen let you hesitate. */
    respond(claim, heldFor = null) {
      if (S.phase !== PHASE.RESPOND || !S.pending) return { ok: false, why: 'nobody asked you' };
      S.yourHesitation = heldFor;
      const entry = resolveAnswer(S.pending, claim);
      const lied = entry.told === 'lie';
      // The rest of the table saw that land. Somebody may call it.
      const called = botAccusations();
      if (S.phase !== PHASE.OVER) runBots();
      return { ok: true, lied, called };
    },

    /** Spend a glass on an answer you were given. */
    accuse(answerId) {
      const entry = S.ledger[answerId];
      if (!entry || entry.audited || entry.asker !== 0) return { ok: false, why: 'not yours to call' };
      if (S.glasses < 1) return { ok: false, why: 'no glasses left' };
      S.glasses -= 1;
      resolveAccusation(0, entry);
      return { ok: true, wasLie: entry.wasLie };
    },

    /** Name yourself. */
    declare(agentId) {
      if (S.turn !== 0 || S.phase === PHASE.OVER) return { ok: false, why: 'not your turn' };
      const right = agentId === ids[0];
      emit('declared', { seat: 0, agentId, right });
      if (right) { finish(0); return { ok: true, right: true }; }
      eliminate(0, 'named the wrong agent');
      if (S.phase !== PHASE.OVER) { advance(); runBots(); }
      return { ok: true, right: false };
    },

    /**
     * Let the other seats play until it is your turn again.
     * Returns the moves made, so the screen can stage them rather than dump
     * four turns on the table at once.
     */
    runBots,
  };

  function runBots() {
    const moves = [];
    let guard = 0;
    while (S.phase !== PHASE.OVER && guard++ < 40) {
      advance();
      const me = S.turn;
      if (me === 0) {
        if (S.skip[0]) { S.skip[0] = false; moves.push({ kind: 'skip', seat: 0 }); continue; }
        S.phase = PHASE.ASK;
        break;
      }
      if (S.skip[me]) { S.skip[me] = false; moves.push({ kind: 'skip', seat: me }); continue; }

      const bot = bots[me];
      const guess = bot.declaration();
      if (guess != null) {
        const right = guess === ids[me];
        moves.push({ kind: 'declare', seat: me, agentId: guess, right });
        emit('declared', { seat: me, agentId: guess, right });
        if (right) { finish(me); break; }
        eliminate(me, 'named the wrong agent');
        continue;
      }

      const q = bot.ask();
      const entry = askFrom(me, q.queryMask, q.modeAll);
      if (!entry) break;
      if (entry.responder === 0) {
        // Hand control back: the room is waiting on you.
        S.phase = PHASE.RESPOND;
        moves.push({ kind: 'asked-you', entry });
        return moves;
      }
      resolveAnswer(entry);
      moves.push({ kind: 'exchange', entry });

      if (botAccusations()) moves.push({ kind: 'verdict', verdict: S.lastVerdict });
      if (S.phase === PHASE.OVER) break;
    }
    return moves;
  }

  emit('dealt', { ids });
  return api;
}
