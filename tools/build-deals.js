// Construit deals.js à partir de tools/deals-src.js : complète les mains manquantes et vérifie tout.
// Usage : node tools/build-deals.js
const fs = require('fs'), path = require('path');
const SRC = require('./deals-src.js');
const SEATS = ['O', 'N', 'E', 'S'];          // ordre du jeu
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = 'AKQJT98765432';
const STRAINS = ['♣', '♦', '♥', '♠', 'SA'];
const HCP = { A: 4, K: 3, Q: 2, J: 1 };

const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const parse = h => h.split('.').map(p => (p === '-' ? '' : p));
const hcpOf = parts => parts.join('').split('').reduce((s, c) => s + (HCP[c] || 0), 0);
const fmt = parts => parts.map(p => p || '-').join('.');
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let errors = 0;
const err = (d, m) => { errors++; console.log(`Donne ${d.n} : ${m}`); };
const out = [];

for (const d of SRC) {
  const hands = {};
  const used = new Set();
  for (const s of SEATS) {
    if (!d[s]) continue;
    const parts = parse(d[s]);
    if (parts.length !== 4) { err(d, `main ${s} : 4 couleurs attendues`); continue; }
    let n = 0;
    parts.forEach((p, i) => p.split('').forEach(c => {
      if (!RANKS.includes(c)) err(d, `main ${s} : carte invalide ${c}`);
      const k = SUITS[i] + c;
      if (used.has(k)) err(d, `carte ${k} en double (${s})`);
      used.add(k); n++;
    }));
    if (n !== 13) err(d, `main ${s} : ${n} cartes`);
    hands[s] = parts;
  }
  // Mains manquantes : au hasard, avec des adversaires qui ont de quoi passer.
  const missing = SEATS.filter(s => !hands[s]);
  const rest = []; SUITS.forEach(su => RANKS.split('').forEach(c => { if (!used.has(su + c)) rest.push(su + c); }));
  const r = rng(d.n * 7919);
  let ok = false, limit = 11, tries = 0;
  while (!ok) {
    tries++;
    if (tries === 20000) limit = 13;
    if (tries === 40000) limit = 40;
    const deck = rest.slice();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const cand = {};
    missing.forEach((s, k) => {
      const cards = deck.slice(k * 13, k * 13 + 13);
      cand[s] = SUITS.map(su => cards.filter(c => c[0] === su).map(c => c[1]).sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)).join(''));
    });
    ok = missing.every(s => !['E', 'O'].includes(s) || (hcpOf(cand[s]) <= limit && Math.max(...cand[s].map(p => p.length)) <= 5));
    if (ok) Object.assign(hands, cand);
  }
  if (limit > 11) console.log(`Donne ${d.n} : adversaires jusqu'à ${limit}H (pas mieux possible)`);

  // Séquence
  const bids = d.a.map(x => x[0]);
  let last = -1, lastBidder = null, dbl = 0;
  bids.forEach((b, i) => {
    const seat = SEATS[(SEATS.indexOf(d.d) + i) % 4];
    const side = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
    if (b === 'P') return;
    if (b === 'X') { if (!lastBidder || side(lastBidder) === side(seat) || dbl) err(d, `contre illégal (tour ${i + 1})`); dbl = 1; return; }
    if (b === 'XX') { if (dbl !== 1) err(d, `surcontre illégal (tour ${i + 1})`); dbl = 2; return; }
    const rk = rank(b);
    if (rk < 0) err(d, `enchère illisible ${b}`);
    if (rk <= last) err(d, `enchère insuffisante ${b}`);
    last = rk; lastBidder = seat; dbl = 0;
  });
  const tail = bids.slice(-3);
  if (bids.length < 4 || tail.some(b => b !== 'P')) err(d, 'la séquence doit finir par 3 passes');
  if (!bids.some((b, i) => SEATS[(SEATS.indexOf(d.d) + i) % 4] === 'S')) err(d, 'Sud ne parle jamais');
  out.push({ n: d.n, t: d.t, d: d.d, h: Object.fromEntries(SEATS.map(s => [s, fmt(hands[s])])), a: d.a });
}

const nums = out.map(d => d.n);
if (new Set(nums).size !== nums.length) { errors++; console.log('numéro de donne en double'); }
if (errors) { console.log(`${errors} erreur(s) : deals.js non écrit.`); process.exit(1); }
const body = `// GÉNÉRÉ par tools/build-deals.js à partir de tools/deals-src.js — ne pas éditer à la main.\nconst DEALS = ${JSON.stringify(out, null, 0).replace(/\},\{"n"/g, '},\n{"n"')};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'deals.js'), body);
console.log(`${out.length} donnes écrites dans deals.js.`);
for (const d of out) console.log(`  n°${d.n} ${d.t} : ` + SEATS.map(s => `${s} ${hcpOf(parse(d.h[s]))}H`).join(', '));
