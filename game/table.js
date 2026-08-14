/**
 * A table, run in memory.
 *
 * This mirrors the contract's rules exactly: same deal, same responder choice,
 * same glass economy, same elimination on a wrong accusation. It exists so a
 * thousand games can be played in a second and the balance can be argued about
 * with numbers rather than opinions.
 */

import { AGENTS, ROSTER, SEATS } from './rules.js';
import { createBot, PERSONALITIES } from './bots.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `harshAccusation: true` restores the original rule where naming an honest
 * player kills you. The simulator showed that rule makes accusing a losing bet
 * at any skill level, because lies are only a tenth of all answers and so even
 * a perfect read of the tell is wrong two times in three. The default instead
 * costs a glass and a turn, which leaves the gamble real and survivable.
 */
export function playGame({ seed = 1, maxTurns = 60, log = null, harshAccusation = false } = {}) {
  const rng = mulberry32(seed);

  // Five distinct agents, off one shuffled deck.
  const deck = [...Array(ROSTER).keys()];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const ids = deck.slice(0, SEATS);

  const bots = PERSONALITIES.map((p, s) => createBot(p, s, rng));
  bots.forEach((b, s) => {
    b.myTrueId = ids[s];                                  // for SNAKE's modelling
    // Every seat but its own, by seat number: this is what lets a bot verify
    // an answer given to somebody else the instant it is spoken.
    const bySeat = ids.map((id, k) => (k === s ? null : id));
    b.observe(ids.filter((_, k) => k !== s), bySeat);
    b.glasses = 5;
  });

  const out = [];
  const ledger = [];
  const state = {
    alive: bots.map(() => true), skip: bots.map(() => false),
    turn: 0, pot: SEATS, over: false, winner: null,
  };
  const say = (m) => { out.push(m); if (log) log(m); };

  const aliveSeats = () => state.alive.map((a, s) => (a ? s : -1)).filter(s => s >= 0);

  function eliminate(seat, why) {
    if (!state.alive[seat]) return;
    state.alive[seat] = false;
    say(`  ✗ seat ${seat} (${bots[seat].personality}) is out — ${why}`);
    const left = aliveSeats();
    if (left.length === 1) { state.over = true; state.winner = left[0]; }
  }

  function advance() {
    for (let step = 1; step <= SEATS; step++) {
      const n = (state.turn + step) % SEATS;
      if (state.alive[n]) { state.turn = n; return; }
    }
  }

  let turns = 0;
  while (!state.over && turns < maxTurns) {
    turns++;
    const me = state.turn;
    if (state.skip[me]) { state.skip[me] = false; say(`  seat ${me} sits this one out`); advance(); continue; }
    const bot = bots[me];

    // Declare if certain.
    const guess = bot.declaration();
    if (guess != null) {
      const right = guess === ids[me];
      say(`  seat ${me} (${bot.personality}) declares "${AGENTS[guess].name}" — ${right ? 'CORRECT' : 'wrong'}`);
      if (right) { state.over = true; state.winner = me; break; }
      eliminate(me, 'named the wrong agent');
      if (state.over) break;
      advance();
      continue;
    }

    // Ask.
    const q = bot.ask();
    const others = aliveSeats().filter(s => s !== me);
    if (!others.length) { state.over = true; state.winner = me; break; }
    const responder = others[Math.floor(rng() * others.length)];

    const r = bots[responder].respond(me, ids[me], q.queryMask, q.modeAll);
    const lied = r.claim !== r.honest;
    // A liar hesitates more often than not, but not reliably: that is the point.
    const elapsed = lied
      ? (rng() < 0.6 ? 3 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 2))
      : (rng() < 0.15 ? 3 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2));

    const entry = {
      id: ledger.length, asker: me, responder, queryMask: q.queryMask,
      modeAll: q.modeAll, claim: r.claim, honest: r.honest, answered: true, elapsed,
      audited: false, told: lied ? 'lie' : 'truth',
    };
    ledger.push(entry);
    bots.forEach(b => b.record(entry));
    say(`  seat ${me} asks ${q.text} → seat ${responder} (${bots[responder].personality}) says ${r.claim ? 'YES' : 'NO'} after ${elapsed}s${lied ? '  [lie]' : ''}`);

    // Anybody may call a liar.
    for (const s of aliveSeats()) {
      const target = bots[s].accusation();
      if (!target) continue;
      const a = ledger[target.id];
      if (a.audited || a.asker !== s) continue;   // only the victim may call it

      bots[s].glasses -= 1;
      bots[a.responder].glasses += 1;
      a.audited = true;
      const wasLie = a.claim !== a.honest;
      a.wasLie = wasLie;
      say(`  ! seat ${s} (${bots[s].personality}) spends a glass on answer #${a.id} — ${wasLie ? 'LIAR' : 'wrong'}`);
      bots.forEach(b => b.learnVerdict(a.id, a.responder, wasLie));
      // Opening the verdict tells the victim what the honest answer was. This
      // is the real price of calling a liar: a rival just got a free question.
      if (wasLie) { a.claim = a.honest; a.corrected = true; }
      if (wasLie) {
        eliminate(a.responder, 'caught lying');
      } else if (harshAccusation) {
        eliminate(s, 'a false accusation');
      } else {
        state.skip[s] = true;
        say(`    seat ${s} called an honest answer — the glass is gone and so is their next turn`);
      }
      break; // one audit per turn keeps the pace human
    }

    if (state.over) break;
    advance();
  }

  // Nobody got there: the seat with the sharpest read takes it.
  if (!state.over) {
    const left = aliveSeats();
    let best = left[0], bestLen = 99;
    for (const s of left) {
      const n = bots[s].myCandidates(0).length || bots[s].myCandidates(1).length;
      if (n < bestLen) { bestLen = n; best = s; }
    }
    state.winner = best;
  }

  return {
    winner: state.winner,
    winnerPersonality: state.winner == null ? null : bots[state.winner].personality,
    turns,
    ledger,
    lies: ledger.filter(a => a.told === 'lie').length,
    audits: ledger.filter(a => a.audited).length,
    caughtLies: ledger.filter(a => a.audited && a.wasLie).length,
    falseAccusations: ledger.filter(a => a.audited && !a.wasLie).length,
    stalled: turns >= 60,
    log: out,
    ids,
  };
}
