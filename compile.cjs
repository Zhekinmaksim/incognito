const solc = require('solc'), fs = require('fs'), path = require('path');
const input = {
  language: 'Solidity',
  sources: { 'contracts/Incognito.sol': { content: fs.readFileSync('contracts/Incognito.sol','utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi','evm.bytecode.object'] } } }
};
function findImport(p) {
  const tries = [p, path.join('node_modules', p), path.join('contracts', p)];
  for (const t of tries) { if (fs.existsSync(t)) return { contents: fs.readFileSync(t,'utf8') }; }
  return { error: 'not found: ' + p };
}
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errs = (out.errors||[]).filter(e => e.severity === 'error');
const warns = (out.errors||[]).filter(e => e.severity === 'warning');
errs.forEach(e => console.log('ERROR:', e.formattedMessage.split('\n').slice(0,4).join('\n')));
console.log('--- errors:', errs.length, ' warnings:', warns.length);
if (!errs.length) {
  const c = out.contracts['contracts/Incognito.sol']['Incognito'];
  console.log('bytecode size:', c.evm.bytecode.object.length/2, 'bytes');
  fs.writeFileSync('abi.json', JSON.stringify(c.abi, null, 2));
}
