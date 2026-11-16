// Labo « robot contre experts » sur les donnes Vugraph (tools/vugraph-boards.json, voir vugraph-parse.js).
// ENTAME : carte / couleur identique à celle de l'expert + coût double mort des deux entames (serveur DDS Python).
// CONTRE-JEU (MODE=jeu) : à chaque carte d'un défenseur expert (après l'entame), la carte du robot est-elle la même
// (ou équivalente : cartes qui se touchent dans la main, compte tenu des cartes tombées) ?
// Usage : node tools/expertlab.js [nb]   ·   MODE=jeu MC=24 node tools/expertlab.js [nb]
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const PL = require(process.env.PLAYER || '../player.js');
const boards = JSON.parse(fs.readFileSync(path.join(__dirname, 'vugraph-boards.json'), 'utf8'));
const SEATS = ['N', 'E', 'S', 'O'], STRAINS = ['♣', '♦', '♥', '♠', 'SA'], SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 }, RCH = 'AKQJT98765432', SL = 'SHDC';
const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4], partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
const parse = h => h.split('.').map(p => (p === '-' ? [] : p.split('').map(c => 12 - RCH.indexOf(c))));
const toCard = s => ({ s: SL.indexOf(s[0]), r: 12 - RCH.indexOf(s[1]) });
const cs = c => SL[c.s] + RCH[12 - c.r];
function contractOf(bids, d) {
  let lastBid = null, lastBy = null; const first = {};
  bids.forEach((b, i) => { const s = SEATS[(SEATS.indexOf(d) + i) % 4]; if (rank(b) >= 0) { lastBid = b; lastBy = s; const k = sideOf(s) + b.slice(1); if (!first[k]) first[k] = s; } });
  return lastBid ? { l: +lastBid[0], s: lastBid.slice(1), decl: first[sideOf(lastBy) + lastBid.slice(1)] } : null;
}
const winnerOf = PL.winnerOf;
// deux cartes de la même couleur sont équivalentes si tout ce qui est entre elles est dans ma main ou déjà tombé
function equiv(a, b, hand, gone) {
  if (a.s !== b.s) return false; if (a.r === b.r) return true;
  const lo = Math.min(a.r, b.r), hi = Math.max(a.r, b.r);
  for (let r = lo + 1; r < hi; r++) if (!hand[a.s].includes(r) && !gone.has(a.s * 13 + r)) return false;
  return true;
}
(async () => {
  if (process.env.MC) { const { pathToFileURL } = require('url'); const { loadDds, Dds } = await import(pathToFileURL(path.join(__dirname, '..', 'vendor', 'bridge-dds', 'dds-api.js')).href); globalThis.RaimonDDSW = new Dds(await loadDds()); }
  const N = +process.argv[2] || boards.length, MODE = process.env.MODE || 'entame';
  let ask = null, srv = null;
  if (MODE === 'entame' && !process.env.NODD) {
    const PY = process.env.PYTHON || 'C:/Users/draimon/AppData/Local/Programs/Python/Python310/python.exe';
    srv = spawn(PY, [path.join(__dirname, 'dd-server.py')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let buf = ''; const waiting = [];
    srv.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiting.shift()(JSON.parse(l)); } });
    ask = q => new Promise(res => { waiting.push(res); srv.stdin.write(JSON.stringify(q) + '\n'); });
  }
  let n = 0, sameCard = 0, sameSuit = 0, ddExpert = 0, ddRobot = 0, ddN = 0, decisions = 0, agree = 0; const misses = [], cache = [];
  for (const b of boards.slice(0, N)) {
    const c = contractOf(b.bids, b.d); if (!c || !b.plays.length) continue;
    const trump = c.s === 'SA' ? null : SI[c.s], leader = next(c.decl), dummy = partner(c.decl);
    if (MODE === 'entame') {
      const hands = {}; SEATS.forEach(s => { hands[s] = s === leader ? parse(b.hands[leader]) : [[], [], [], []]; });
      const st = { me: leader, hands, visible: [], trick: [], played: [], trump, decl: c.decl, counts: { N: 13, E: 13, S: 13, O: 13 }, voids: { N: [], E: [], S: [], O: [] }, bids: b.bids, dealer: b.d, mcLead: !!process.env.MCLEAD, mcSamples: +process.env.MC || 24 };
      const rob = PL.choose(st, 0), exp = toCard(b.plays[0]);
      if (!b.hands[leader].split('.')[exp.s].includes(RCH[12 - exp.r])) continue;   // donne mal lue
      n++;
      const okS = rob.s === exp.s; if (okS) sameSuit++;
      if (equiv(rob, exp, hands[leader], new Set())) sameCard++;
      else if (misses.length < 400) misses.push(`${b.ev.split(',')[0]} ${c.l}${c.s} ${c.decl} | ${b.bids.join(' ')} | main ${b.hands[leader]} | expert ${b.plays[0]} robot ${cs(rob)}`);
      if (ask) {
        const dd = (await ask({ hands: b.hands, trump: c.s === 'SA' ? 'NT' : SL[SI[c.s]], first: leader, trick: [] })).cards;
        const best = Math.max(...Object.values(dd)), ve = dd[b.plays[0]], vr = dd[cs(rob)];
        if (ve !== undefined && vr !== undefined) { ddExpert += best - ve; ddRobot += best - vr; ddN++; }
        if (process.env.CACHE) cache.push({ hand: b.hands[leader], leader, contract: c, bids: b.bids, dealer: b.d, expert: b.plays[0], dd });
      }
    } else {
      // rejoue la donne et compare chaque carte des défenseurs (à partir de la 2e carte)
      const hands = {}; SEATS.forEach(s => { hands[s] = parse(b.hands[s]); });
      const played = [], voids = { N: [], E: [], S: [], O: [] }, gone = new Set(); let lead = leader, trick = [], pLed = {};
      for (let k = 0; k < b.plays.length; k++) {
        const turn = trick.length ? SEATS[(SEATS.indexOf(lead) + trick.length) % 4] : lead;
        const card = toCard(b.plays[k]);
        if (!hands[turn][card.s] || !hands[turn][card.s].includes(card.r)) break;   // donne mal lue
        const DS = MODE === 'decl';
        if (k > 0 && (DS ? sideOf(turn) === sideOf(c.decl) : sideOf(turn) !== sideOf(c.decl))) {
          const vis = DS ? partner(turn) : dummy;
          const known = {}; SEATS.forEach(s => { known[s] = s === turn || s === vis ? hands[s] : [[], [], [], []]; });
          const counts = {}; SEATS.forEach(s => { counts[s] = hands[s].reduce((a, x) => a + x.length, 0); });
          const st = { me: turn, hands: JSON.parse(JSON.stringify(known)), visible: [vis], trick: trick.slice(), played: played.slice(), trump, decl: c.decl, counts, voids: JSON.parse(JSON.stringify(voids)), partnerLed: pLed[partner(turn)], myLed: pLed[turn], bids: b.bids, dealer: b.d, mcSamples: +process.env.MC || 24 };
          const legalN = (trick.length && hands[turn][trick[0].s].length ? hands[turn][trick[0].s].length : hands[turn].reduce((a, x) => a + x.length, 0));
          if (legalN > 1) {
            const rob = PL.choose(st, 0); decisions++;
            if (equiv(rob, card, hands[turn], gone)) agree++;
          }
        }
        if (trick.length && card.s !== trick[0].s && !voids[turn].includes(trick[0].s)) voids[turn].push(trick[0].s);
        if (!trick.length && pLed[turn] === undefined) pLed[turn] = card.s;
        hands[turn][card.s] = hands[turn][card.s].filter(r => r !== card.r); gone.add(card.s * 13 + card.r);
        trick.push({ seat: turn, s: card.s, r: card.r });
        if (trick.length === 4) { const w = winnerOf(trick, trump); played.push(...trick); lead = w.seat; trick = []; }
      }
      n++;
    }
  }
  if (srv) srv.stdin.end();
  if (process.env.CACHE) fs.writeFileSync(path.join(__dirname, 'lead-cache-experts.json'), JSON.stringify(cache));
  if (MODE === 'entame') {
    console.log(`${n} entames d'experts · robot = expert : même carte ${(100 * sameCard / n).toFixed(1)} % · même couleur ${(100 * sameSuit / n).toFixed(1)} %`);
    if (ddN) console.log(`coût double mort (levées par entame) : experts ${(ddExpert / ddN).toFixed(3)} · robot ${(ddRobot / ddN).toFixed(3)}`);
    if (process.env.SHOW) misses.slice(0, +process.env.SHOW).forEach(x => console.log(x));
  } else console.log(`${n} donnes · ${decisions} décisions ${MODE === 'decl' ? 'de déclarants' : 'de défenseurs'} experts · robot d'accord ${(100 * agree / decisions).toFixed(1)} %`);
})();
