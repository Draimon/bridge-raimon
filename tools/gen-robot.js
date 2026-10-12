// Génère des donnes enchéries par le robot → tools/deals-robot.json.
// Usage : node tools/gen-robot.js [nombre total visé]
// Les donnes déjà générées gardent leur numéro : on recalcule leurs enchères avec les règles actuelles
// (une donne sortie des règles est retirée, son numéro n'est jamais réutilisé) et on complète à la suite.
const fs = require('fs'), path = require('path');
const R = require('../robot.js');
const FILE = path.join(__dirname, 'deals-robot.json');
const TOTAL = +process.argv[2] || 70;
const RANKS = 'AKQJT98765432', SUITS = ['♠', '♥', '♦', '♣'];
const QUOTA = { 'Stayman': 14, 'Texas': 16, 'Texas mineur': 3, 'Bicolore majeur': 4, 'Quantitatif': 3, 'Sur 1SA': 8, 'Puppet': 14, 'Texas sur 2SA': 5, 'Sur 2SA': 3, 'Chelem sur 1SA': 8, 'Oklahoma – chelem': 8,
  // tranche 2 : ouvertures d'1 à la couleur
  'Soutien majeur': 6, 'Shadow fit': 8, 'Oklahoma': 6, '1♥ – 1♠': 5, 'Majeure – 1SA': 5, 'Ouverture majeure': 1, 'Mineure – majeure': 8,
  'Roudy': 6, 'Check-Back Stayman': 5, '1♣ – 1♦': 4, 'Mineure – SA': 4, 'Soutien mineur': 3, 'Ouverture mineure': 1 };
const MAX_SAME = 3;

const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];
const out = [], count = {}, same = {}, seen = new Set();
let dropped = 0, changed = 0;
for (const d of old) {
  seen.add(d.N + d.S);
  const a = R.auction(d.N, d.S);
  if (!a) { dropped++; continue; }
  if (JSON.stringify(a) !== JSON.stringify(d.a)) changed++;
  const t = R.theme(a), key = a.filter(x => x[0] !== 'P').map(x => x[0]).join(' ');
  count[t] = (count[t] || 0) + 1; same[key] = (same[key] || 0) + 1;
  out.push({ ...d, t: 'Robot · ' + t, a });
}
let nextN = Math.max(100, ...old.map(d => d.n)) + 1;

let seed = 20261012 + old.length * 7919;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const deck = []; SUITS.forEach((s, i) => RANKS.split('').forEach(r => deck.push([i, r])));
const handStr = cards => SUITS.map((_, i) => cards.filter(c => c[0] === i).map(c => c[1]).sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)).join('') || '-').join('.');

let tries = 0, added = 0;
while (out.length < TOTAL && tries < 3e6) {
  tries++;
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const H = { N: handStr(d.slice(0, 13)), E: handStr(d.slice(13, 26)), S: handStr(d.slice(26, 39)), O: handStr(d.slice(39)) };
  const e = R.evalHand(H.E), o = R.evalHand(H.O);
  if (e.hcp > 11 || o.hcp > 11 || Math.max(...e.len) > 5 || Math.max(...o.len) > 5) continue;   // adversaires muets
  if (seen.has(H.N + H.S)) continue;
  const a = R.auction(H.N, H.S);
  if (!a) continue;
  const t = R.theme(a);
  if ((count[t] || 0) >= (QUOTA[t] || 0)) continue;
  const key = a.filter(x => x[0] !== 'P').map(x => x[0]).join(' ');
  if ((same[key] || 0) >= MAX_SAME || ((key === '1SA' || key === '2SA') && same[key])) continue;
  seen.add(H.N + H.S);
  count[t] = (count[t] || 0) + 1; same[key] = (same[key] || 0) + 1;
  out.push({ n: nextN++, t: 'Robot · ' + t, d: 'N', ...H, a });
  added++;
}
fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
console.log(`${out.length} donnes robot : ${old.length - dropped} conservées (${changed} aux enchères modifiées), ${dropped} retirées, ${added} ajoutées.`, count);
