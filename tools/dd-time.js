const { solve } = require('./dds.js');
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.runInNewContext(fs.readFileSync(__dirname + '/../deals.js', 'utf8') + ';this.DEALS=DEALS', ctx);
const SEATS = ['N', 'E', 'S', 'O'], RANKS = '23456789TJQKA';
const toMask = h => h.split('.').map(p => p === '-' ? 0 : p.split('').reduce((m, c) => m | (1 << RANKS.indexOf(c)), 0));
for (const n of process.argv.slice(2).map(Number)) {
  const d = ctx.DEALS.find(x => x.n === n);
  const hands = SEATS.map(s => toMask(d.h[s]));
  const t0 = Date.now();
  // Contrat 4♠ par Nord => entame Est ; atout ♠ = 0
  const r = solve(hands, +process.env.TRUMP || 0, +process.env.LEAD || 1);
  console.log(`donne ${n} : ${r} levées NS en ${(Date.now() - t0) / 1000}s`);
}
