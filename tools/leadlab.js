// Labo d'entame : pour chaque donne FFB (enchères du robot), la valeur double mort de CHAQUE entame possible
// (calculée une fois, gardée dans tools/lead-cache.json), puis on mesure une règle d'entame :
// levées perdues par rapport à la meilleure entame. Usage : node tools/leadlab.js [SYS]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const B = require('../bidder.js'), PL = require('../player.js');
const { deals } = require('./ffb-deals.json');
const SEATS = ['N', 'E', 'S', 'O'], STRAINS = ['♣', '♦', '♥', '♠', 'SA'], SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RCH = 'AKQJT98765432', SL = 'SHDC';
const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4], partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
const parse = h => h.split('.').map(p => (p === '-' ? [] : p.split('').map(c => 12 - RCH.indexOf(c))));
function auction(bids, d) {
  let lastBid = null, lastBy = null; const first = {};
  bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d) + i) % 4]; if (rank(b) >= 0) { lastBid = b; lastBy = s; const k = sideOf(s) + b.slice(1); if (!first[k]) first[k] = s; } });
  const n = bids.length, ended = (n >= 4 && !lastBid) || (lastBid && n >= 4 && bids.slice(-3).every(b => b === 'P'));
  return { ended, c: lastBid ? { l: +lastBid[0], s: lastBid.slice(1), decl: first[sideOf(lastBy) + lastBid.slice(1)] } : null };
}
const SYS = process.argv[2] || 'sef';
const CACHE = path.join(__dirname, 'lead-cache-' + SYS + '.json');

async function build() {
  const PY = process.env.PYTHON || 'C:/Users/draimon/AppData/Local/Programs/Python/Python310/python.exe';
  const srv = spawn(PY, [path.join(__dirname, 'dd-server.py')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  let buf = ''; const waiting = [];
  srv.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiting.shift()(JSON.parse(l)); } });
  const ask = q => new Promise(res => { waiting.push(res); srv.stdin.write(JSON.stringify(q) + '\n'); });
  const out = [];
  for (const d of deals) {
    const bids = [];
    for (let k = 0; k < 60; k++) { const seat = SEATS[(SEATS.indexOf(d.d) + bids.length) % 4]; bids.push(B.bid(d[seat], bids, d.d, d.v, seat, SYS).bid); if (auction(bids, d.d).ended && bids.length >= 4) break; }
    const A = auction(bids, d.d); if (!A.c) continue;
    const c = A.c, TL = c.s === 'SA' ? 'NT' : SL[SI[c.s]], leader = next(c.decl);
    const r = await ask({ hands: { N: d.N, E: d.E, S: d.S, O: d.O }, trump: TL, first: leader, trick: [] });
    out.push({ n: d.n, bids, dealer: d.d, contract: c, leader, hand: d[leader], dd: r.cards });
  }
  srv.stdin.end();
  fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

// Mesure de la règle d'entame actuelle de player.js
function evaluate(items, leadFn) {
  let lost = 0, perfect = 0; const bad = [];
  for (const it of items) {
    const c = it.contract, trump = c.s === 'SA' ? null : SI[c.s];
    const named = {}; it.bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(it.dealer) + i) % 4]; if (rank(b) >= 0 && b.slice(1) !== 'SA' && named[s] === undefined) named[s] = SI[b.slice(1)]; });
    const hands = {}; SEATS.forEach(s => { hands[s] = s === it.leader ? parse(it.hand) : [[], [], [], []]; });
    const counts = {}; SEATS.forEach(s => { counts[s] = 13; });
    const st = { me: it.leader, hands, visible: [], trick: [], played: [], trump, decl: c.decl, counts, voids: { N: [], E: [], S: [], O: [] }, partnerSuit: named[partner(it.leader)], bids: it.bids, dealer: it.dealer };
    const card = leadFn(st);
    const v = it.dd[SL[card.s] + RCH[12 - card.r]], best = Math.max(...Object.values(it.dd));
    lost += best - v; if (best === v) perfect++;
    if (best > v) bad.push({ n: it.n, c: c.l + c.s, hand: it.hand, lead: SL[card.s] + RCH[12 - card.r], best: Object.entries(it.dd).filter(([, x]) => x === best).map(([k]) => k).join(' '), bids: it.bids.join(' ') });
  }
  return { lost, perfect, n: items.length, bad };
}

(async () => {
  const items = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : await build();
  const r = evaluate(items, st => PL.choose(st, 0));
  console.log(`${r.n} entames · levées perdues ${r.lost} (${(r.lost / r.n).toFixed(3)} par donne) · entame parfaite ${(100 * r.perfect / r.n).toFixed(1)} %`);
  if (process.env.SHOW) r.bad.slice(0, +process.env.SHOW).forEach(b => console.log(b.n, b.c, b.hand, 'entame', b.lead, 'mieux', b.best, '|', b.bids));
})();
module.exports = { evaluate };
