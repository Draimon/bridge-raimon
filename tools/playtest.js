// Banc d'essai du robot de jeu de la carte : enchères par le robot, puis les 4 robots jouent la donne.
// On compare les levées du déclarant au double mort (FFB) : écart moyen, et le temps de réflexion par carte.
// Usage : node tools/playtest.js [nb de donnes]
const B = require('../bidder.js'), PL = require('../player.js');
const { deals } = require('./ffb-deals.json');
const SEATS = ['N', 'E', 'S', 'O'], STRAINS = ['♣', '♦', '♥', '♠', 'SA'], SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RCH = 'AKQJT98765432';
const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4], partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
const DDK = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C', SA: 'NT' };
const parse = h => h.split('.').map(p => (p === '-' ? [] : p.split('').map(c => 12 - RCH.indexOf(c))));
function auction(bids, d) {
  let lastBid = null, lastBy = null, dbl = 0; const first = {};
  bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d) + i) % 4]; if (rank(b) >= 0) { lastBid = b; lastBy = s; dbl = 0; const k = sideOf(s) + b.slice(1); if (!first[k]) first[k] = s; } else if (b === 'X') dbl = 1; else if (b === 'XX') dbl = 2; });
  const n = bids.length, ended = (n >= 4 && !lastBid) || (lastBid && n >= 4 && bids.slice(-3).every(b => b === 'P'));
  return { ended, c: lastBid ? { l: +lastBid[0], s: lastBid.slice(1), decl: first[sideOf(lastBy) + lastBid.slice(1)] } : null };
}
const N = +process.argv[2] || 100;
let tot = 0, cnt = 0, worst = 0, slow = 0, declDiff = 0, declN = 0;
for (const d of deals.slice(0, N)) {
  const bids = [];
  for (let k = 0; k < 60; k++) { const seat = SEATS[(SEATS.indexOf(d.d) + bids.length) % 4]; bids.push(B.bid(d[seat], bids, d.d, d.v, seat).bid); if (auction(bids, d.d).ended && bids.length >= 4) break; }
  const A = auction(bids, d.d); if (!A.c) continue;
  const c = A.c, trump = c.s === 'SA' ? null : SI[c.s], dummy = partner(c.decl);
  const hands = {}; SEATS.forEach(s => { hands[s] = parse(d[s]); });
  const played = [], voids = { N: [], E: [], S: [], O: [] };
  let leader = next(c.decl), trick = [], tricks = { NS: 0, EO: 0 }, pLed = {};
  // couleur nommée par chacun (pour l'entame)
  const named = {}; bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d.d) + i) % 4]; if (rank(b) >= 0 && b.slice(1) !== 'SA' && named[s] === undefined) named[s] = SI[b.slice(1)]; });
  for (let k = 0; k < 52; k++) {
    const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
    const ctrl = turn === dummy ? c.decl : turn;
    const visible = sideOf(ctrl) === sideOf(c.decl) ? [ctrl === turn ? partner(turn) : c.decl] : (played.length || trick.length ? [dummy] : []);
    const known = {}; SEATS.forEach(s => { known[s] = s === turn || visible.includes(s) ? hands[s] : [[], [], [], []]; });
    const counts = {}; SEATS.forEach(s => { counts[s] = hands[s].reduce((a, x) => a + x.length, 0); });
    const st = { me: turn, hands: known, visible, trick: trick.slice(), played: played.slice(), trump, decl: c.decl, counts, voids, partnerSuit: named[partner(turn)], partnerLed: pLed[partner(turn)], myLed: pLed[turn] };
    const t0 = Date.now();
    const card = PL.choose(st, 900);
    const dt = Date.now() - t0; if (dt > worst) worst = dt; if (dt > 1500) slow++;
    if (!hands[turn][card.s].includes(card.r)) throw new Error('carte illégale ' + JSON.stringify(card));
    if (trick.length && card.s !== trick[0].s && !voids[turn].includes(trick[0].s)) voids[turn].push(trick[0].s);
    if (!trick.length && pLed[turn] === undefined) pLed[turn] = card.s;
    hands[turn][card.s] = hands[turn][card.s].filter(r => r !== card.r);
    trick.push({ seat: turn, s: card.s, r: card.r });
    if (trick.length === 4) { const w = PL.winnerOf(trick, trump); tricks[sideOf(w.seat)]++; played.push(...trick); leader = w.seat; trick = []; }
  }
  const got = tricks[sideOf(c.decl)], dd = d.dds[c.decl][DDK[c.s]];
  tot += got - dd; cnt++;
  declDiff += got - dd; declN++;
}
console.log(`${cnt} donnes jouées · levées du déclarant − double mort : ${(tot / cnt).toFixed(2)} en moyenne · carte la plus lente ${worst} ms · cartes > 1,5 s : ${slow}`);
void declDiff; void declN;
