// Banc d'essai du robot d'enchères : 4 robots enchérissent chaque donne FFB ; le contrat final est marqué avec le
// nombre de levées double mort (fourni par la FFB) et comparé à la vraie salle (% comme en tournoi).
// Usage : node tools/selfplay.js [nb] [détail]   → statistiques ; « détail » liste les plus mauvaises donnes.
const R = require('../bidder.js');
const { deals } = require('./ffb-deals.json');
const SEATS = ['N', 'E', 'S', 'O'], STRAINS = ['♣', '♦', '♥', '♠', 'SA'];
const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
const DDK = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C', SA: 'NT' };
function auction(bids, d) {
  let lastBid = null, lastBy = null, dbl = 0; const first = {};
  bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d) + i) % 4]; if (rank(b) >= 0) { lastBid = b; lastBy = s; dbl = 0; const k = sideOf(s) + b.slice(1); if (!first[k]) first[k] = s; } else if (b === 'X') dbl = 1; else if (b === 'XX') dbl = 2; });
  const n = bids.length, ended = (n >= 4 && !lastBid && bids.every(b => b === 'P')) || (lastBid && n >= 4 && bids.slice(-3).every(b => b === 'P'));
  return { ended, c: lastBid ? { l: +lastBid[0], s: lastBid.slice(1), dbl, decl: first[sideOf(lastBy) + lastBid.slice(1)] } : null };
}
function score(c, tricks, vul) {
  const need = 6 + c.l, per = c.s === '♣' || c.s === '♦' ? 20 : 30;
  if (tricks >= need) {
    let base = c.s === 'SA' ? 40 + 30 * (c.l - 1) : per * c.l; base *= c.dbl === 2 ? 4 : c.dbl ? 2 : 1;
    let t = base + (base >= 100 ? (vul ? 500 : 300) : 50); if (c.l === 6) t += vul ? 750 : 500; if (c.l === 7) t += vul ? 1500 : 1000;
    if (c.dbl) t += c.dbl === 2 ? 100 : 50; const o = tricks - need; t += c.dbl ? o * (vul ? 200 : 100) * c.dbl : o * (c.s === 'SA' ? 30 : per); return t;
  }
  const u = need - tricks; if (!c.dbl) return -u * (vul ? 100 : 50);
  let p = 0; for (let k = 1; k <= u; k++) p += vul ? (k === 1 ? 200 : 300) : (k === 1 ? 100 : k <= 3 ? 200 : 300); return -p * c.dbl;
}
const pct = (d, ns) => { let b = 0, e = 0, t = 0; for (const [s, k] of d.freq) { t += k; if (s < ns) b += k; else if (s === ns) e += k; } return t ? (b + e / 2) / t * 100 : 50; };
const N = +process.argv[2] || deals.length, detail = process.argv[3], SYS = process.env.SYS || 'sef';
let illegal = 0, endless = 0, sum = 0, passedGame = 0, rows = [];
for (const d of deals.slice(0, N)) {
  const bids = [];
  for (let k = 0; k < 60; k++) {
    const seat = SEATS[(SEATS.indexOf(d.d) + bids.length) % 4];
    const r = R.bid(d[seat], bids, d.d, d.v, seat, SYS);
    bids.push(r.bid);
    if (auction(bids, d.d).ended) break;
  }
  const A = auction(bids, d.d);
  if (!A.ended) { endless++; continue; }
  let ns = 0, tricks = null;
  if (A.c) {
    tricks = d.dds[A.c.decl][DDK[A.c.s]];
    const sc = score(A.c, tricks, d.v === 'all' || d.v === sideOf(A.c.decl));
    ns = sideOf(A.c.decl) === 'NS' ? sc : -sc;
  }
  const p = pct(d, ns); sum += p;
  // passe générale alors que la salle joue une manche
  if (!A.c) { const games = d.freq.filter(([s]) => Math.abs(s) >= 400).reduce((a, [, k]) => a + k, 0), tot = d.freq.reduce((a, [, k]) => a + k, 0); if (games / tot > 0.5) passedGame++; }
  rows.push({ n: d.n, p, bids: bids.join(' '), c: A.c ? A.c.l + A.c.s + (A.c.dbl ? 'X'.repeat(A.c.dbl) : '') + ' ' + A.c.decl : 'passe', tricks, ns, d });
}
const fair = rows.map(r => Math.min(r.p, 100 - r.p));
// part des donnes où notre score fait partie des résultats courants de la salle (≥ 5 % des tables)
const usual = rows.filter(r => { const t = r.d.freq.reduce((a, [, k]) => a + k, 0); return r.d.freq.some(([s, k]) => s === r.ns && k / t >= 0.05); }).length;
console.log(`score « courant » en salle (≥ 5 % des tables) : ${(usual / rows.length * 100).toFixed(1)} %`);
console.log(`${rows.length} donnes · enchères sans fin ${endless} · moyenne NS ${(sum / rows.length).toFixed(1)} % · écart moyen à 50 % : ${(rows.reduce((s, r) => s + Math.abs(r.p - 50), 0) / rows.length).toFixed(1)} · passe générale avec manche dans la salle : ${passedGame}`);
// « qualité » : pour chaque donne, le % du camp qui a le plus mal joué (0 = catastrophe, 50 = parfait)
console.log(`qualité moyenne (pire camp) : ${(fair.reduce((a, b) => a + b, 0) / fair.length).toFixed(1)} % · donnes catastrophiques (< 10 %) : ${fair.filter(x => x < 10).length}`);
if (detail) rows.slice().sort((a, b) => Math.min(a.p, 100 - a.p) - Math.min(b.p, 100 - b.p)).slice(0, +detail || 15).forEach(r => {
  const top = r.d.freq.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, k]) => s + '×' + k).join(' ');
  console.log(`${r.n} d=${r.d.d} v=${r.d.v} ${r.c} (${r.tricks} lev.) NS ${r.ns} → ${r.p.toFixed(0)} % | ${r.bids} | salle ${top}\n   N ${r.d.N}  E ${r.d.E}  S ${r.d.S}  O ${r.d.O}`);
});
void illegal;
