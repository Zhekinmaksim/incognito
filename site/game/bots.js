/**
 * The regulars.
 *
 * Every bot shares one brain and differs only in two decisions: whether to lie
 * when asked, and when to spend a glass calling somebody a liar. That is the
 * whole of it. The asymmetry that makes them worth watching is structural, not
 * scripted: a bot reads the four faces around it perfectly and has to infer its
 * own from answers that may be false.
 */

import {
  AGENTS, ROSTER, candidates, bestQuery, truthfulAnswer, describeQuery,
} from './rules.js';

export const PERSONALITIES = ['STRAIGHT', 'MAGPIE', 'SNAKE', 'MIRROR', 'MAGISTRATE'];

export function createBot(personality, seat, rng = Math.random) {
  return {
    personality,
    seat,
    rng,
    seen: [],          // agent ids on the other four foreheads
    answers: [],       // every public claim at the table, in order
    caught: new Set(), // seats this bot has personally seen proved to lie
    glasses: 5,
    accusedIds: new Set(),

    /** Told at the deal: the four cards this seat can read, by seat. */
    observe(ids, bySeat) { this.seen = ids.slice(); this.seatCards = bySeat; },

    /** Called for every answer, whoever it was about. */
    record(entry) { this.answers.push(entry); },

    /** Answers that were about me, and so constrain who I am. */
    myAnswers() { return this.answers.filter(a => a.asker === this.seat && a.answered); },

    /** The honest reading of the table. Empty means somebody lied to me. */
    myCandidates(allowLies = 0) {
      return candidates(this.seen, this.myAnswers(), allowLies);
    },

    /** What I would ask next. */
    ask() {
      const cands = this.myCandidates(0).length ? this.myCandidates(0) : this.myCandidates(1);
      const q = bestQuery(cands, this.myAnswers());
      return { ...q, text: describeQuery(q.queryMask, q.modeAll) };
    },

    /**
     * Answer a question about somebody else's card.
     * `askerId` is their true agent, which this bot can read.
     */
    respond(askerSeat, askerId, queryMask, modeAll) {
      const honest = truthfulAnswer(AGENTS[askerId].mask, queryMask, modeAll);
      return { claim: this.wouldLie(askerSeat, askerId, queryMask, modeAll) ? !honest : honest, honest };
    },

    wouldLie(askerSeat, askerId, queryMask, modeAll) {
      switch (this.personality) {
        case 'STRAIGHT':
        case 'MAGISTRATE':
          return false;

        case 'MAGPIE':
          return this.rng() < 0.40;

        case 'SNAKE': {
          // Lies only on the answer that would have finished the asker: it
          // works out what their honest set would collapse to and steps in.
          const theirAnswers = this.answers.filter(a => a.asker === askerSeat && a.answered);
          const before = candidates(this.seenFrom(askerSeat, askerId), theirAnswers, 0);
          const honest = truthfulAnswer(AGENTS[askerId].mask, queryMask, modeAll);
          const after = before.filter(
            id => truthfulAnswer(AGENTS[id].mask, queryMask, modeAll) === honest
          );
          // Lies when the honest answer would put the asker within reach, not
          // only on the very last step — otherwise it almost never fires.
          return before > 1 && after.length <= 2;
        }

        case 'MIRROR':
          // Settles scores, and otherwise lies to whoever is closest to home.
          if (this.caught.has(askerSeat)) return true;
          return this.threatLevel(askerSeat, askerId) <= 2;

        default:
          return false;
      }
    },

    /** How near a seat is to naming themselves, in candidates left. */
    threatLevel(seat, id) {
      const theirAnswers = this.answers.filter(a => a.asker === seat && a.answered);
      return candidates(this.seenFrom(seat, id), theirAnswers, 0).length;
    },

    /**
     * What the asker can see, reconstructed from this bot's own view. It knows
     * every card except its own; the asker knows every card except theirs. So
     * swap: give them this bot's card, take away their own.
     */
    seenFrom(askerSeat, askerId) {
      const all = new Set(this.seen);
      all.delete(askerId);
      if (this.myTrueId != null) all.add(this.myTrueId);
      return [...all];
    },

    /**
     * Spend a glass, or don't.
     *
     * Only the person who was lied to may call it. Everyone else at the table
     * watches the lie land - they are reading the asker's forehead and know the
     * true answer - and can do nothing at all about it. That restriction is the
     * game: the room knows, the victim doesn't, and the victim has to decide on
     * a tell.
     *
     * Which is why the hesitation is on the record. It proves nothing. It is
     * the only thing there is.
     */
    accusation() {
      if (this.glasses < 1) return null;
      const mine = this.answers.filter(a =>
        a.answered && !a.audited && !this.accusedIds.has(a.id) && a.asker === this.seat
      );
      if (!mine.length) return null;

      // Certainty, on the rare night the table over-constrains itself: my
      // honest reading just went empty, so one of these answers is false.
      const honest = candidates(this.seen, this.myAnswers(), 0);
      if (honest.length === 0 && candidates(this.seen, this.myAnswers(), 1).length > 0) {
        const proved = this.breakingAnswer(this.myAnswers());
        if (proved && !proved.audited) return proved;
      }

      // Otherwise a hunch, priced by nerve.
      let best = null;
      for (const a of mine) {
        const sc = this.suspicion(a);
        if (!best || sc > best.sc) best = { a, sc };
      }
      return best && best.sc >= this.nerve() ? best.a : null;
    },

    /** How wrong an answer felt, roughly 0 to 1. */
    suspicion(a) {
      let sc = a.elapsed >= 5 ? 0.55
             : a.elapsed >= 4 ? 0.40
             : a.elapsed >= 3 ? 0.22
             : 0.05;
      if (this.caught.has(a.responder)) sc += 0.35;
      // The answer that would have finished me is the one worth lying about,
      // and so the one worth doubting.
      const without = this.myAnswers().filter(x => x.id !== a.id);
      const before = candidates(this.seen, without, 0).length;
      const after = candidates(this.seen, this.myAnswers(), 0).length;
      if (before > 1 && after <= 1) sc += 0.25;
      return sc;
    },

    /** How much suspicion this one needs before it parts with a glass. */
    nerve() {
      switch (this.personality) {
        case 'MAGISTRATE': return 0.38;
        case 'MIRROR':     return 0.55;
        case 'STRAIGHT':   return 0.62;
        case 'MAGPIE':     return 0.70 + this.rng() * 0.2;
        case 'SNAKE':      return 0.75;
        default:           return 0.60;
      }
    },

    /** The earliest answer whose removal makes my own card possible again. */
    breakingAnswer(mine) {
      for (let i = mine.length - 1; i >= 0; i--) {
        const without = mine.filter((_, k) => k !== i);
        if (candidates(this.seen, without, 0).length > 0) return mine[i];
      }
      return null;
    },

    /** Am I ready to name myself? */
    declaration() {
      const honest = this.myCandidates(0);
      if (honest.length === 1) return honest[0];
      const lenient = this.myCandidates(1);
      if (honest.length === 0 && lenient.length === 1) return lenient[0];
      return null;
    },

    /** Forced to name somebody, pick the least bad guess. */
    forcedDeclaration() {
      const pool = this.myCandidates(0).length ? this.myCandidates(0) : this.myCandidates(1);
      if (!pool.length) return Math.floor(this.rng() * ROSTER);
      return pool[Math.floor(this.rng() * pool.length)];
    },

    /** A verdict came back; remember who lies. */
    learnVerdict(answerId, responderSeat, wasLie) {
      this.accusedIds.add(answerId);
      if (wasLie) this.caught.add(responderSeat);
    },
  };
}
