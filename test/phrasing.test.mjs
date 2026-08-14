import { describeQuery } from '../game/rules.js';
let bad = [];
for (let m = 1; m < 256; m++) for (const all of [false, true]) {
  const q = describeQuery(m, all);
  if (/\s\s/.test(q))                bad.push(['double space', q]);
  if (/,\s*(and|or)\s*,/.test(q))    bad.push(['stray comma', q]);
  if (!q.endsWith('?'))              bad.push(['no question mark', q]);
  if (!/^[A-Z]/.test(q))             bad.push(['lowercase start', q]);
  if (/\ban a\b|\ba an\b|\ba glasses\b|\ba gloves\b/.test(q)) bad.push(['article', q]);
}
console.log('510 shapes checked, problems:', bad.length);
bad.slice(0, 8).forEach(b => console.log('  ', b[0], '->', b[1]));
