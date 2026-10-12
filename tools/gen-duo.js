// Génère les donnes du mode « Jouer à deux » (distinctes de celles du mode « Jouer au bridge ») → tools/deals-duo.json.
// Usage : node tools/gen-duo.js [nombre total]   — numéros T001, T002… (indépendants des donnes du mode solo), stables (les donnes existantes sont gardées).
const fs = require('fs'), path = require('path');
const R = require('../robot.js');
const FILE = path.join(__dirname, 'deals-duo.json');
const TOTAL = +process.argv[2] || 120;
const RANKS = 'AKQJT98765432', SUITS = ['♠', '♥', '♦', '♣'];
// Même variété que les donnes du robot, en proportion pour ~120 donnes.
const QUOTA = {
  'Stayman': 9, 'Texas': 10, 'Texas mineur': 2, 'Bicolore majeur': 2, 'Quantitatif': 2, 'Sur 1SA': 4, 'Puppet': 6, 'Texas sur 2SA': 3, 'Sur 2SA': 2,
  'Chelem sur 1SA': 4, 'Oklahoma – chelem': 4, 'Enchère d’essai': 7, '2 sur 1': 8,
  'Lebelson': 5, 'Truscott': 4, 'Contre d’appel': 5, 'Copenhague': 4,
  'Soutien majeur': 4, 'Shadow fit': 5, 'Oklahoma': 4, '1♥ – 1♠': 4, 'Majeure – 1SA': 4, 'Mineure – majeure': 6,
  'Roudy': 4, 'Check-Back Stayman': 3, '1♣ – 1♦': 3, 'Mineure – SA': 3, 'Soutien mineur': 2,
};
const MAX_SAME = 2 + Math.floor(TOTAL / 150);
for (const k in QUOTA) QUOTA[k] = Math.ceil(QUOTA[k] * TOTAL / 120);

// On exclut toutes les mains déjà utilisées par le mode « Jouer au bridge ».
const solo = new Set(require('./deals-robot.json').map(d => d.N + d.S));
const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];
const out = [], count = {}, same = {}, seen = new Set(solo);
for (const d of old) {
  seen.add(d.N + d.S);
  const c = d.comp ? R.compAuction(d, d.v) : null;
  const a = d.comp ? c && c.a : R.auction(d.N, d.S);
  if (!a) continue;
  const t = d.comp ? c.theme : R.theme(a), key = a.filter(x => x[0] !== 'P').map(x => x[0]).join(' ');
  count[t] = (count[t] || 0) + 1; same[key] = (same[key] || 0) + 1;
  out.push({ ...d, t, a });
}
let nextN = Math.max(0, ...old.map(d => +d.n.slice(1))) + 1;
let seed = 77777 + old.length * 104729;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const deck = []; SUITS.forEach((s, i) => RANKS.split('').forEach(r => deck.push([i, r])));
const handStr = cards => SUITS.map((_, i) => cards.filter(c => c[0] === i).map(c => c[1]).sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)).join('') || '-').join('.');
let tries = 0;
while (out.length < TOTAL && tries < 5e6) {
  tries++;
  const dk = deck.slice();
  for (let i = dk.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [dk[i], dk[j]] = [dk[j], dk[i]]; }
  const H = { N: handStr(dk.slice(0, 13)), E: handStr(dk.slice(13, 26)), S: handStr(dk.slice(26, 39)), O: handStr(dk.slice(39)) };
  const v = ['none', 'NS', 'EO', 'all'][Math.floor(rnd() * 4)];
  if (seen.has(H.N + H.S)) continue;
  const e = R.evalHand(H.E), o = R.evalHand(H.O);
  let a = null, t, dealer = 'N', comp = false;
  if (e.hcp <= 11 && o.hcp <= 11 && Math.max(...e.len) <= 5 && Math.max(...o.len) <= 5) { a = R.auction(H.N, H.S); if (a) t = R.theme(a); }
  if (!a) { const c = R.compAuction(H, v); if (c) { a = c.a; t = c.theme; dealer = c.d; comp = true; } }
  if (!a || (count[t] || 0) >= (QUOTA[t] || 0)) continue;
  // à deux, chacun doit avoir au moins une décision : Nord et Sud doivent chacun annoncer autre chose que passe
  const calls = a.map((x, i) => ({ b: x[0], s: ['N', 'E', 'S', 'O'][(['N', 'E', 'S', 'O'].indexOf(dealer) + i) % 4] }));
  if (!calls.some(c => c.s === 'N' && c.b !== 'P') || !calls.some(c => c.s === 'S' && c.b !== 'P')) continue;
  const key = a.filter(x => x[0] !== 'P').map(x => x[0]).join(' ');
  if ((same[key] || 0) >= MAX_SAME) continue;
  seen.add(H.N + H.S); count[t] = (count[t] || 0) + 1; same[key] = (same[key] || 0) + 1;
  out.push({ n: 'T' + String(nextN++).padStart(3, '0'), t, d: dealer, v, ...(comp ? { comp: true } : {}), ...H, a });
}
fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
console.log(`${out.length} donnes « à deux » (${tries} distributions essayées)`, count);
