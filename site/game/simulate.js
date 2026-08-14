/**
 * Play the room a thousand times and report what kind of game it is.
 * `--one --verbose` narrates a single night instead.
 */
import { playGame } from './table.js';
import { AGENTS } from './rules.js';

const args = process.argv.slice(2);
if (args.includes('--one')) {
  const seed = Number(args[args.indexOf('--seed') + 1]) || 7;
  const g = playGame({ seed, log: m => console.log(m) });
  console.log(`\ncards dealt: ${g.ids.map(i => AGENTS[i].name).join(', ')}`);
  console.log(`winner: seat ${g.winner} (${g.winnerPersonality}) in ${g.turns} turns`);
  process.exit(0);
}

const N = 1000;
let turns = 0, lies = 0, audits = 0, caught = 0, wrongAcc = 0, stalled = 0;
const wins = {};
const dist = {};
for (let s = 1; s <= N; s++) {
  const g = playGame({ seed: s });
  turns += g.turns; lies += g.lies; audits += g.audits;
  caught += g.caughtLies; wrongAcc += g.falseAccusations;
  if (g.stalled) stalled++;
  wins[g.winnerPersonality] = (wins[g.winnerPersonality] || 0) + 1;
  const b = Math.min(20, g.turns);
  dist[b] = (dist[b] || 0) + 1;
}
console.log(`games                ${N}`);
console.log(`avg turns            ${(turns / N).toFixed(1)}`);
console.log(`stalled (60 turns)   ${stalled} (${(stalled / N * 100).toFixed(1)}%)`);
console.log(`lies told / game     ${(lies / N).toFixed(2)}`);
console.log(`glasses spent / game ${(audits / N).toFixed(2)}`);
console.log(`  caught a liar      ${caught} (${audits ? (caught / audits * 100).toFixed(0) : 0}% of accusations)`);
console.log(`  accused honestly   ${wrongAcc}`);
console.log('\nwins by personality');
Object.entries(wins).sort((a, b) => b[1] - a[1])
  .forEach(([p, n]) => console.log(`  ${p.padEnd(12)} ${String(n).padStart(4)}  ${'█'.repeat(Math.round(n / N * 60))}`));
console.log('\ngame length');
Object.keys(dist).map(Number).sort((a, b) => a - b)
  .forEach(k => console.log(`  ${String(k).padStart(2)}${k === 20 ? '+' : ' '} turns  ${'█'.repeat(Math.round(dist[k] / N * 90))} ${dist[k]}`));
