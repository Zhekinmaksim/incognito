import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const page = readFileSync(resolve(root, 'site/play.html'), 'utf8');
const keeper = readFileSync(resolve(root, 'keeper/keeper.js'), 'utf8');

const checks = [
  ['wallet mode discovers the current table on chain', page.includes('await contract.nextTable()')],
  ['wallet mode no longer hardcodes sit on table zero', !page.includes('contract.sit(CHAIN.houseTable)')],
  ['wallet ask reaches the chain session', page.includes('await chain.ask(picked, modeAll)')],
  ['wallet response reaches the chain session', page.includes('await chain.respond(claim, held)')],
  ['wallet declaration reaches the chain session', page.includes('await chain.declare(Number(c.dataset.id))')],
  ['card decrypt requires an explicit wallet click', page.includes("$('connect').textContent = 'reveal the four cards'") && page.includes('await chain.decryptCards()')],
  ['local accusation handler is disabled outside local mode', page.includes("if (mode !== 'local') return;")],
  ['keeper leaves the fifth chair open', keeper.includes('const BOT_SEATS = 4;') && keeper.includes('s < BOT_SEATS')],
  ['keeper migrates away from the legacy five-bot table', keeper.includes('leaving legacy all-bot table')],
  ['keeper refills empty bot seats before a new ante', keeper.includes("await this.send(seat, 'refill', [])")],
  ['keeper ABI can recover the table id from Seated', keeper.includes("event Seated(uint256 indexed tableId")],
  ['keeper waits when the visitor must act', keeper.includes("if (!bot) return;                                // the visitor's turn")],
];

let failed = 0;
for (const [name, passed] of checks) {
  if (!passed) {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

console.log(`${checks.length - failed} wallet checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
