const solc = require('solc'); const fs = require('fs');
require('fs').mkdirSync(require('path').join(__dirname, '..', 'build'), { recursive: true });
const src = fs.readFileSync(require('path').join(__dirname, '..', 'HeadlineDuel.sol'), 'utf8');
const input = { language: 'Solidity', sources: { 'HeadlineDuel.sol': { content: src } },
  settings: { evmVersion: 'paris', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
(out.errors||[]).forEach(e => console.log(e.severity, e.formattedMessage));
const c = out.contracts?.['HeadlineDuel.sol']?.HeadlineDuel; if (!c) process.exit(1);
fs.writeFileSync(require('path').join(__dirname, '..', 'abi.json'), JSON.stringify(c.abi, null, 2)); fs.writeFileSync(require('path').join(__dirname, '..', 'build', 'bytecode.txt'), c.evm.bytecode.object);
console.log('ok bytes', c.evm.bytecode.object.length/2);
