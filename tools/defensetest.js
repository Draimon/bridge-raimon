// Banc d'essai du FLANC des robots. Donnes FFB, enchères par le robot ; le déclarant joue parfaitement
// (double mort, solveur DDS via tools/dd-server.py) et les deux défenseurs sont nos robots (player.js).
// À chaque carte de défense, on compare au double mort : une carte qui coûte une levée = une « erreur »,
// enregistrée comme exercice de flanc dans tools/defense-exercises.json (entame, 2e/3e/4e main, défausse…).
// Usage : node tools/defensetest.js [nb de donnes] [début]   (SYS=raimon pour les enchères Raimon)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const B = require('../bidder.js'), PL = require(process.env.PLAYER || '../player.js');
const { deals } = require('./ffb-deals.json');
const SEATS = ['N', 'E', 'S', 'O'], STRAINS = ['♣', '♦', '♥', '♠', 'SA'], SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RCH = 'AKQJT98765432', SL = 'SHDC';
const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4], partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
const parse = h => h.split('.').map(p => (p === '-' ? [] : p.split('').map(c => 12 - RCH.indexOf(c))));
const cstr = c => SL[c.s] + RCH[12 - c.r];
const pbnHand = h => h.map(rs => rs.slice().sort((a, b) => b - a).map(r => RCH[12 - r]).join('') || '-').join('.');
const pretty = c => ['♠', '♥', '♦', '♣'][c.s] + ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'][c.r];
function auction(bids, d) {
  let lastBid = null, lastBy = null; const first = {};
  bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d) + i) % 4]; if (rank(b) >= 0) { lastBid = b; lastBy = s; const k = sideOf(s) + b.slice(1); if (!first[k]) first[k] = s; } });
  const n = bids.length, ended = (n >= 4 && !lastBid) || (lastBid && n >= 4 && bids.slice(-3).every(b => b === 'P'));
  return { ended, c: lastBid ? { l: +lastBid[0], s: lastBid.slice(1), decl: first[sideOf(lastBy) + lastBid.slice(1)] } : null };
}

// ── Client du serveur double mort
const PY = process.env.PYTHON || 'C:/Users/draimon/AppData/Local/Programs/Python/Python310/python.exe';
const srv = spawn(PY, [path.join(__dirname, 'dd-server.py')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
let buf = '', waiting = [];
srv.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); waiting.shift()(JSON.parse(line)); } });
srv.stderr.on('data', d => process.stderr.write(d));
const ask = q => new Promise(res => { waiting.push(res); srv.stdin.write(JSON.stringify(q) + '\n'); });

(async () => {
  if (process.env.MC) { const { pathToFileURL } = require('url'); const { loadDds, Dds } = await import(pathToFileURL(path.join(__dirname, '..', 'vendor', 'bridge-dds', 'dds-api.js')).href); globalThis.RaimonDDSW = new Dds(await loadDds()); }
  const N = +process.argv[2] || 100, START = +process.argv[3] || 0, SYS = process.env.SYS || 'sef';
  let nDeals = 0, lost = 0, defDD = 0, defGot = 0; const exercises = [], byKind = {}, positions = [];
  const t0 = Date.now();
  for (const d of deals.slice(START, START + N)) {
    const bids = [];
    for (let k = 0; k < 60; k++) { const seat = SEATS[(SEATS.indexOf(d.d) + bids.length) % 4]; bids.push(B.bid(d[seat], bids, d.d, d.v, seat, SYS).bid); if (auction(bids, d.d).ended && bids.length >= 4) break; }
    const A = auction(bids, d.d); if (!A.c) continue;
    const c = A.c, trump = c.s === 'SA' ? null : SI[c.s], dummy = partner(c.decl), TL = c.s === 'SA' ? 'NT' : SL[SI[c.s]];
    const hands = {}; SEATS.forEach(s => { hands[s] = parse(d[s]); });
    const played = [], voids = { N: [], E: [], S: [], O: [] };
    let leader = next(c.decl), trick = [], tricks = { NS: 0, EO: 0 }, pLed = {}, startHands = null, ddStart = null;
    const named = {}; bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d.d) + i) % 4]; if (rank(b) >= 0 && b.slice(1) !== 'SA' && named[s] === undefined) named[s] = SI[b.slice(1)]; });
    for (let k = 0; k < 52; k++) {
      if (!trick.length) { startHands = {}; SEATS.forEach(s => { startHands[s] = pbnHand(hands[s]); }); }
      const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
      const dd = (await ask({ hands: startHands, trump: TL, first: leader, trick: trick.map(cstr) })).cards;
      if (!dd) throw new Error('serveur DD');
      const best = Math.max(...Object.values(dd));
      if (k === 0) ddStart = best;                                         // levées de la défense en double mort
      let card;
      const DECL = !!process.env.DECL;                                    // DECL=1 : le robot joue le déclarant, la défense est parfaite
      if (DECL ? sideOf(turn) !== sideOf(c.decl) : sideOf(turn) === sideOf(c.decl)) {   // camp parfait : meilleure carte, la plus petite
        const opts = Object.entries(dd).filter(([, v]) => v === best).map(([k2]) => ({ s: SL.indexOf(k2[0]), r: 12 - RCH.indexOf(k2[1]) }));
        card = opts.sort((a, b) => a.r - b.r || a.s - b.s)[0];
      } else {
        const visible = DECL ? [partner(turn)] : played.length || trick.length ? [dummy] : [];
        const known = {}; SEATS.forEach(s => { known[s] = s === turn || visible.includes(s) ? hands[s] : [[], [], [], []]; });
        const counts = {}; SEATS.forEach(s => { counts[s] = hands[s].reduce((a, x) => a + x.length, 0); });
        const st = { me: turn, hands: known, visible, trick: trick.slice(), played: played.slice(), trump, decl: c.decl, counts, voids, partnerSuit: named[partner(turn)], partnerLed: pLed[partner(turn)], myLed: pLed[turn], bids, dealer: d.d, mcSamples: +process.env.MC || 24, mcLead: !!process.env.MCLEAD, ...(process.env.NOCONS ? { accept: null } : {}) };
        card = PL.choose(st, 900);
        if (process.env.CACHE_POS && hands[turn].reduce((x, y) => x + y.length, 0) > 7) positions.push({ st: JSON.parse(JSON.stringify(st)), dd, n: d.n, k });
        const v = dd[cstr(card)];
        if (v === undefined) throw new Error('carte inconnue du DD ' + cstr(card));
        if (v < best) {
          const pos = trick.length, follows = !trick.length || card.s === trick[0].s;
          const kind = k === 0 ? 'entame' : pos === 0 ? 'attaque (en main)' : !follows ? (trump !== null && card.s === trump ? 'coupe' : 'défausse') : ['', '2e main', '3e main', '4e main'][pos];
          byKind[kind] = (byKind[kind] || 0) + (best - v);
          exercises.push({ n: d.n, contrat: c.l + c.s, decl: c.decl, seat: turn, levee: Math.floor(k / 4) + 1, kind, perte: best - v,
            robot: pretty(card), bonnes: Object.entries(dd).filter(([, x]) => x === best).map(([k2]) => pretty({ s: SL.indexOf(k2[0]), r: 12 - RCH.indexOf(k2[1]) })),
            main: pbnHand(hands[turn]), mort: visible.length ? pbnHand(hands[dummy]) : null, pli: trick.map(x => x.seat + ':' + pretty(x)), encheres: bids.join(' ') });
        }
      }
      if (!hands[turn][card.s].includes(card.r)) throw new Error('carte illégale');
      if (trick.length && card.s !== trick[0].s && !voids[turn].includes(trick[0].s)) voids[turn].push(trick[0].s);
      if (!trick.length && pLed[turn] === undefined) pLed[turn] = card.s;
      hands[turn][card.s] = hands[turn][card.s].filter(r => r !== card.r);
      trick.push({ seat: turn, s: card.s, r: card.r });
      if (trick.length === 4) { const w = PL.winnerOf(trick, trump); tricks[sideOf(w.seat)]++; played.push(...trick); leader = w.seat; trick = []; }
    }
    const DECLM = !!process.env.DECL;
    const got = DECLM ? tricks[sideOf(c.decl)] : tricks[sideOf(c.decl) === 'NS' ? 'EO' : 'NS'], ddv = DECLM ? 13 - ddStart : ddStart;
    nDeals++; defDD += ddv; defGot += got; lost += ddv - got;
    if (nDeals % 25 === 0) process.stderr.write(`${nDeals} donnes · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  }
  srv.stdin.end();
  const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
  console.log(`${nDeals} donnes (${SYS}) · ${process.env.DECL ? 'DÉCLARANT' : 'défense'} : ${defGot} levées sur ${defDD} possibles en double mort · perdues ${lost} (${(lost / nDeals).toFixed(2)} par donne)`);
  console.log('Levées perdues par type : ' + kinds);
  if (process.env.CACHE_POS) fs.writeFileSync(path.join(__dirname, 'defense-positions.json'), JSON.stringify(positions));
  fs.writeFileSync(path.join(__dirname, 'defense-exercises.json'), JSON.stringify({ sys: SYS, deals: nDeals, lost, byKind, exercises }, null, 1));
})();
