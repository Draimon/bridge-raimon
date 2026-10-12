// Calcule la ligne de jeu optimale (double mort) d'une donne : 52 cartes, chaque camp jouant au mieux.
// Message reçu : { id, hands (masques N,E,S,O), trump, leader, value } ; renvoie { id, line: [[p, s, r], …] }.
const { solve } = require('./dds.js');
function line({ hands, trump, leader, value }) {
  const h = hands.map(x => x.slice()); let trick = [], ns = 0, lead = leader; const out = [];
  for (let k = 0; k < 52; k++) {
    const p = (lead + trick.length) & 3;
    const c = solve(h, trump, lead, undefined, 0, trick, { value: value - ns });
    h[p][c.s] &= ~(1 << c.r); trick.push({ p, s: c.s, r: c.r }); out.push([p, c.s, c.r]);
    if (trick.length === 4) {
      let w = trick[0]; trick.slice(1).forEach(x => { if (x.s === w.s ? x.r > w.r : x.s === trump) w = x; });
      if ((w.p & 1) === 0) ns++;
      lead = w.p; trick = [];
    }
  }
  if (ns !== value) throw new Error(`ligne incohérente : ${ns} levées au lieu de ${value}`);
  return out;
}
if (!process.send) {
  // Test de durée : node tools/sol-worker.js <n° de donne>
  const fs = require('fs'), vm = require('vm'), path = require('path');
  const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'deals.js'), 'utf8') + ';this.D=DEALS', ctx);
  const d = ctx.D.find(x => x.n === +process.argv[2]);
  const RANKS = 'AKQJT98765432', PLAY = ['N', 'E', 'S', 'O'];
  const toMask = h => h.split('.').map(p => (p === '-' ? 0 : p.split('').reduce((m, ch) => m | (1 << (12 - RANKS.indexOf(ch))), 0)));
  const t0 = Date.now();
  const l = line({ hands: PLAY.map(s => toMask(d.h[s])), trump: d.c.s === 'SA' ? -1 : ['♠', '♥', '♦', '♣'].indexOf(d.c.s), leader: (PLAY.indexOf(d.c.by) + 1) % 4, value: d.dd });
  console.log(`donne ${d.n} : ligne de ${l.length} cartes en ${(Date.now() - t0) / 1000}s`);
} else {
  process.on('message', m => { try { process.send({ id: m.id, line: line(m) }); } catch (e) { process.send({ id: m.id, error: e.message }); } });
}
