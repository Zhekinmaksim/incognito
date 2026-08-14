/**
 * The rules of the room, in one place.
 *
 * Both the bots and the browser client import this. Nothing here talks to a
 * chain: it is the pure logic of the game, which means a whole night at the
 * table can be simulated in milliseconds and the bots can be proven to play
 * sensibly before a single wei is spent.
 *
 * The roster constant is the same 128 bits that sit in the contract. If you
 * change one, change the other, and re-run `npm run sim`.
 */

export const SEATS = 5;
export const TRAITS = ['hat', 'glasses', 'beard', 'scar', 'earring', 'tie', 'smokes', 'gloves'];

export const HAT = 1, GLASSES = 2, BEARD = 4, SCAR = 8;
export const EARRING = 16, TIE = 32, SMOKES = 64, GLOVES = 128;

export const AGENTS = [
  { name: 'Kestrel',    mask: 0xc0 },
  { name: 'Magpie',     mask: 0xc1 },
  { name: 'Shrike',     mask: 0x32 },
  { name: 'Cormorant',  mask: 0xf3 },
  { name: 'Jackdaw',    mask: 0xc4 },
  { name: 'Plover',     mask: 0x15 },
  { name: 'Harrier',    mask: 0x66 },
  { name: 'Bittern',    mask: 0x27 },
  { name: 'Grosbeak',   mask: 0x68 },
  { name: 'Wigeon',     mask: 0xe9 },
  { name: 'Sanderling', mask: 0x5a },
  { name: 'Nightjar',   mask: 0x3b },
  { name: 'Tern',       mask: 0xac },
  { name: 'Merlin',     mask: 0x1d },
  { name: 'Rook',       mask: 0x3e },
  { name: 'Siskin',     mask: 0x0f },
];

export const ROSTER = AGENTS.length;

/** The packed constant the contract carries, rebuilt from the table above. */
export function packedRoster() {
  let packed = 0n;
  AGENTS.forEach((a, i) => { packed |= BigInt(a.mask) << BigInt(8 * i); });
  return packed;
}

/** Answer a query honestly against a mask. ALL means "all of these traits". */
export function truthfulAnswer(mask, queryMask, modeAll) {
  const hit = mask & queryMask;
  return modeAll ? hit === queryMask : hit !== 0;
}

export function traitsOf(mask) {
  return TRAITS.filter((_, b) => mask & (1 << b));
}

/**
 * Which agents remain possible, given what a seat knows.
 *
 * `seen` are the agent ids on the four other foreheads: a player can strike
 * those off immediately, which is why five distinct cards matter. `answers`
 * are the public claims; `allowLies` caps how many of them may be false.
 *
 * Returns candidate ids. With allowLies = 0 this is the honest reading of the
 * table; with 1 it is the reading that tolerates a single liar, and the moment
 * the first set empties while the second does not, somebody has lied.
 */
export function candidates(seen, answers, allowLies = 0) {
  const out = [];
  for (let id = 0; id < ROSTER; id++) {
    if (seen.includes(id)) continue;
    let contradictions = 0;
    for (const a of answers) {
      if (truthfulAnswer(AGENTS[id].mask, a.queryMask, a.modeAll) !== a.claim) {
        contradictions++;
        if (contradictions > allowLies) break;
      }
    }
    if (contradictions <= allowLies) out.push(id);
  }
  return out;
}

/**
 * Score a question by how evenly it splits the candidate set.
 * A perfect question halves it; 0 means it tells you nothing.
 */
export function splitQuality(cands, queryMask, modeAll) {
  let yes = 0;
  for (const id of cands) if (truthfulAnswer(AGENTS[id].mask, queryMask, modeAll)) yes++;
  const no = cands.length - yes;
  if (yes === 0 || no === 0) return 0;
  return Math.min(yes, no) / Math.max(yes, no);
}

/**
 * Pick the sharpest question available.
 *
 * Single traits first, because they are the ones a human reads instantly, and
 * only fall to trait pairs when no single trait splits the set well. Bots that
 * ask incomprehensible eight-bit questions are correct and boring to watch.
 */
export function bestQuery(cands, asked = []) {
  let best = null;
  const seenBefore = new Set(asked.map(a => `${a.queryMask}:${a.modeAll}`));

  const consider = (queryMask, modeAll) => {
    if (seenBefore.has(`${queryMask}:${modeAll}`)) return;
    const q = splitQuality(cands, queryMask, modeAll);
    if (q > 0 && (!best || q > best.quality)) best = { queryMask, modeAll, quality: q };
  };

  for (let b = 0; b < 8; b++) consider(1 << b, false);
  if (!best || best.quality < 0.55) {
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        consider((1 << i) | (1 << j), false);
        consider((1 << i) | (1 << j), true);
      }
  }
  // Every sensible question is exhausted; ask anything legal rather than stall.
  return best || { queryMask: HAT, modeAll: false, quality: 0 };
}

/**
 * Traits fall into three grammars, and mixing them is what makes a generated
 * question read like a form rather than a person: some things you wear, some
 * you simply have, and smoking is a habit. Group by verb, then join.
 */
const GRAMMAR = {
  hat:     { verb: 'wear', word: 'a hat',      chip: 'hat' },
  glasses: { verb: 'wear', word: 'glasses',    chip: 'glasses' },
  earring: { verb: 'wear', word: 'an earring', chip: 'earring' },
  tie:     { verb: 'wear', word: 'a tie',      chip: 'tie' },
  gloves:  { verb: 'wear', word: 'gloves',     chip: 'gloves' },
  beard:   { verb: 'have', word: 'a beard',    chip: 'beard' },
  scar:    { verb: 'have', word: 'a scar',     chip: 'scar' },
  smokes:  { verb: 'smoke', word: null,        chip: 'smokes' },
};

export const CHIP = Object.fromEntries(TRAITS.map(t => [t, GRAMMAR[t].chip]));

function joinWords(list, sep) {
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${sep} ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} ${sep} ${list[list.length - 1]}`;
}

/**
 * Turn a mask into something somebody would actually say out loud.
 *
 * "Am I wearing a hat?"
 * "Do I have a beard, and am I wearing glasses?"        (all)
 * "Am I wearing a hat or gloves, or do I smoke?"        (any)
 */
export function describeQuery(queryMask, modeAll) {
  const ts = traitsOf(queryMask);
  if (!ts.length) return 'Am I anybody at all?';

  const worn   = ts.filter(t => GRAMMAR[t].verb === 'wear').map(t => GRAMMAR[t].word);
  const borne  = ts.filter(t => GRAMMAR[t].verb === 'have').map(t => GRAMMAR[t].word);
  const smokes = ts.includes('smokes');

  const sep = modeAll ? 'and' : 'or';
  const clauses = [];
  if (worn.length)  clauses.push(`am I wearing ${joinWords(worn, sep)}`);
  if (borne.length) clauses.push(`do I have ${joinWords(borne, sep)}`);
  if (smokes)       clauses.push('do I smoke');

  // One clause is a plain question; several need the conjunction between them
  // too, or "all of these" quietly turns into "any of these".
  const joined = clauses.length === 1
    ? clauses[0]
    : clauses.length === 2
      ? `${clauses[0]}, ${sep} ${clauses[1]}`
      : `${clauses.slice(0, -1).join(', ')}, ${sep} ${clauses[clauses.length - 1]}`;

  // "both" removes the last ambiguity when two things are demanded at once.
  const emphasised = modeAll && ts.length === 2 && clauses.length === 1
    ? joined.replace(/(wearing|have) /, '$1 both ')
    : joined;

  return emphasised.charAt(0).toUpperCase() + emphasised.slice(1) + '?';
}
