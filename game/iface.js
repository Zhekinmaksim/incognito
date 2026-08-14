/**
 * What the screen is allowed to know about a table.
 *
 * `session.js` runs the game in the tab; `chain.js` runs it against a deployed
 * contract. The screen must not be able to tell which one it has, so both
 * implement exactly this and nothing more. Anything a chain cannot do
 * synchronously is async here too — including the parts local play could have
 * answered instantly — because a screen written against the fast one will
 * break the moment it meets the slow one.
 *
 * Every method returns `{ ok, why? }` rather than throwing. A wallet rejection
 * is an ordinary outcome, not an exception.
 */

export const MODE = {
  LOCAL: 'local',     // bots in the tab, no wallet, no chain
  WATCH: 'watch',     // the house table, read only, no wallet
  PLAY: 'play',       // a seat of your own, wallet required
};

export const PHASE = {
  IDLE: 'idle',
  DEALING: 'dealing',
  ASK: 'ask',
  WAITING: 'waiting',
  RESPOND: 'respond',
  BOTS: 'bots',
  OVER: 'over',
};

/**
 * @typedef {Object} Answer
 * @property {number}  id
 * @property {number}  asker
 * @property {number}  responder
 * @property {number}  queryMask
 * @property {boolean} modeAll
 * @property {string}  text       what it sounds like out loud
 * @property {boolean} answered
 * @property {boolean} claim      what they said
 * @property {number}  elapsed    seconds they held it — public, and the only tell
 * @property {boolean} audited
 * @property {boolean} [wasLie]   only once a glass has been spent on it
 */

/**
 * @typedef {Object} TableView
 * @property {string}   phase
 * @property {number}   you            your seat, or -1 when only watching
 * @property {number}   turn
 * @property {boolean[]} alive
 * @property {number}   glasses
 * @property {Answer[]} ledger
 * @property {(number|null)[]} cards   agent id per seat; null where you may not look
 * @property {number|null} winner
 * @property {string}   [notice]       something the screen should say out loud
 */

/**
 * Every session exposes these. Names match `session.js` so the existing screen
 * keeps working unchanged.
 *
 *   view()                 -> TableView
 *   yourCandidates(lies)   -> number[]        who you might still be
 *   yourAnswers()          -> Answer[]        answers given to you
 *   pendingForYou()        -> { entry, asker, askerAgent, honest } | null
 *   ask(mask, all)         -> Promise<{ok, why?}>
 *   respond(claim, held)   -> Promise<{ok, why?}>
 *   accuse(answerId)       -> Promise<{ok, wasLie?, why?}>
 *   declare(agentId)       -> Promise<{ok, right?, why?}>
 *   refresh()              -> Promise<void>   pull the latest from wherever it lives
 *   destroy()              -> void
 *
 * and emit through the `onEvent` callback given at construction:
 *   dealt, asked, answered, verdict, eliminated, declared, over, notice
 */

/** Both implementations wrap failures the same way. */
export function fail(why) { return { ok: false, why }; }
export function done(extra = {}) { return { ok: true, ...extra }; }

/**
 * A wallet rejection is the user changing their mind, not a fault. Anything
 * else is worth showing them in full.
 */
export function readableError(err) {
  const m = (err?.shortMessage || err?.message || String(err)).toLowerCase();
  if (err?.code === 4001 || m.includes('user rejected') || m.includes('user denied'))
    return 'You waved it off.';
  if (m.includes('insufficient funds')) return 'That seat has no gas left.';
  if (m.includes('nonce')) return 'Your wallet and the chain disagree on order — try again.';
  if (m.includes('not your turn')) return 'It is not your turn.';
  if (m.includes('no glasses')) return 'You have nothing left to spend.';
  if (m.includes('wrong phase')) return 'The table has moved on.';
  return err?.shortMessage || err?.message || 'Something went wrong.';
}
