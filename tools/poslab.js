// Labo des positions de défense (en cours de donne, plus de 7 cartes en main) : rejoue la décision du robot
// sur chaque position enregistrée par defensetest.js (CACHE_POS=1) et mesure la perte double mort locale.
// Usage : node tools/poslab.js [SHOW=nb] [KIND=attaque|2e|3e|defausse]
const fs = require('fs'), path = require('path');
const PL = require('../player.js');
const pos = JSON.parse(fs.readFileSync(path.join(__dirname, 'defense-positions.json'), 'utf8'));
const RCH = 'AKQJT98765432', SL = 'SHDC';
const pretty = c => ['♠', '♥', '♦', '♣'][c.s] + ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'][c.r];
const kindOf = (p, card) => { const t = p.st.trick; if (p.k === 0) return 'entame'; if (!t.length) return 'attaque'; if (card.s !== t[0].s) return card.s === p.st.trump ? 'coupe' : 'defausse'; return ['', '2e', '3e', '4e'][t.length]; };
const by = {}, show = [];
let lost = 0;
for (const p of pos) {
  const card = PL.choose(JSON.parse(JSON.stringify(p.st)), 0);
  const v = p.dd[SL[card.s] + RCH[12 - card.r]], best = Math.max(...Object.values(p.dd));
  const kind = kindOf(p, card);
  by[kind] = (by[kind] || 0) + (best - v); lost += best - v;
  if (best > v && (!process.env.KIND || kind === process.env.KIND)) show.push(`${p.n} L${Math.floor(p.k / 4) + 1} ${p.st.me} atout ${p.st.trump === null ? 'SA' : '♠♥♦♣'[p.st.trump]} décl ${p.st.decl} | main ${p.st.hands[p.st.me].map(x => x.map(r => RCH[12 - r]).join('') || '-').join('.')} | mort ${p.st.visible.length ? p.st.hands[p.st.visible[0]].map(x => x.map(r => RCH[12 - r]).join('') || '-').join('.') : '?'} | pli ${p.st.trick.map(x => x.seat + pretty(x)).join(' ')} | robot ${pretty(card)} → mieux ${Object.entries(p.dd).filter(([, x]) => x === best).map(([k]) => k).join(' ')}`);
}
console.log(`${pos.length} positions · perte ${lost} · ` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
if (process.env.SHOW) show.slice(0, +process.env.SHOW).forEach(x => console.log(x));
