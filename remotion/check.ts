import {ACTS, DURATION} from './src/theme.ts';

const ranges = Object.entries(ACTS).map(([name, [from, to]]) => ({name, from, to}));
let cursor = 0;
for (const range of ranges) {
  if (range.from !== cursor || range.to <= range.from) throw new Error(`Timeline gap/overlap at ${range.name}`);
  cursor = range.to;
}
if (cursor !== DURATION) throw new Error(`Timeline ends at ${cursor}, expected ${DURATION}`);
console.log(`${ranges.length} acts cover ${DURATION} frames without gaps`);
