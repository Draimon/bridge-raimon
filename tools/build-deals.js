// Construit deals.js à partir de tools/deals-src.js : complète les mains manquantes et vérifie tout.
// Usage : node tools/build-deals.js
const fs = require('fs'), path = require('path');
const SRC = require('./deals-src.js').concat(fs.existsSync(path.join(__dirname, 'deals-robot.json')) ? require('./deals-robot.json') : []);
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
  d.a.forEach(([bid, why, alt], i) => (alt || []).forEach(x => {
    const prev = Math.max(-1, ...bids.slice(0, i).map(rank));
    if (!['P', 'X', 'XX'].includes(x) && (rank(x) < 0 || rank(x) <= prev)) err(d, `variante illégale ${x}`);
    if (SEATS[(SEATS.indexOf(d.d) + i) % 4] !== 'S') err(d, 'variante ailleurs qu’au tour de Sud');
  }));
  const tail = bids.slice(-3);
  if (bids.length < 4 || tail.some(b => b !== 'P')) err(d, 'la séquence doit finir par 3 passes');
  const lastCall = bids.reduce((k, b, i) => (b !== 'P' ? i : k), -1);
  if (lastCall >= 0 && bids.length - lastCall - 1 !== 3) err(d, `${bids.length - lastCall - 1} passes après la dernière enchère (il en faut 3)`);
  if (!bids.some((b, i) => SEATS[(SEATS.indexOf(d.d) + i) % 4] === 'S')) err(d, 'Sud ne parle jamais');
  // Contrat final : dernière enchère, déclarant = premier du camp à avoir nommé la dénomination.
  let c = null;
  const lastIdx = bids.reduce((k, b, i) => (rank(b) >= 0 ? i : k), -1);
  if (lastIdx >= 0) {
    const lb = bids[lastIdx], strain = lb.slice(1), lseat = SEATS[(SEATS.indexOf(d.d) + lastIdx) % 4];
    const side = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
    const k = bids.findIndex((b, i) => rank(b) >= 0 && b.slice(1) === strain && side(SEATS[(SEATS.indexOf(d.d) + i) % 4]) === side(lseat));
    const after = bids.slice(lastIdx + 1);
    c = { l: +lb[0], s: strain, by: SEATS[(SEATS.indexOf(d.d) + k) % 4], x: after.includes('XX') ? 2 : after.includes('X') ? 1 : 0 };
    if (side(c.by) !== 'NS') err(d, 'le contrat doit être joué par Nord-Sud');
  }
  out.push({ n: d.n, t: d.t, d: d.d, v: d.v || 'none', h: Object.fromEntries(SEATS.map(s => [s, fmt(hands[s])])), a: d.a, c });
}

const nums = out.map(d => d.n);
if (new Set(nums).size !== nums.length) { errors++; console.log('numéro de donne en double'); }
if (errors) { console.log(`${errors} erreur(s) : deals.js non écrit.`); process.exit(1); }
main();
async function main() {
  // Objectif double mort de chaque contrat, calculé en parallèle et mis en cache.
  const cacheFile = path.join(__dirname, 'dd-cache.json');
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { cache = {}; }
  const PLAY = ['N', 'E', 'S', 'O'];
  const toMask = h => h.split('.').map(p => (p === '-' ? 0 : p.split('').reduce((m, ch) => m | (1 << (12 - RANKS.indexOf(ch))), 0)));
  const jobs = out.filter(d => d.c).map(d => {
    const trump = d.c.s === 'SA' ? -1 : SUITS.indexOf(d.c.s);
    const leader = (PLAY.indexOf(d.c.by) + 1) % 4;
    const hands = PLAY.map(s => toMask(d.h[s]));
    const id = JSON.stringify([hands, trump, leader]);
    return { d, id, hands, trump, leader, guess: d.c.l + 6 };
  });
  const todo = jobs.filter(j => cache[j.id] === undefined);
  if (todo.length) {
    const { fork } = require('child_process');
    const workers = Math.min(todo.length, Math.max(1, require('os').cpus().length - 1));
    console.log(`Calcul double mort de ${todo.length} donne(s) sur ${workers} processus…`);
    let next = 0, done = 0;
    await new Promise(resolve => {
      for (let w = 0; w < workers; w++) {
        const child = fork(path.join(__dirname, 'dd-worker.js'));
        const feed = () => { if (next < todo.length) { const j = todo[next++]; child.send({ id: j.id, hands: j.hands, trump: j.trump, leader: j.leader, guess: j.guess }); } else child.kill(); };
        child.on('message', ({ id, tricks }) => {
          cache[id] = tricks; done++;
          fs.writeFileSync(cacheFile, JSON.stringify(cache));
          process.stdout.write(`  ${done}/${todo.length}
`);
          if (done === todo.length) resolve();
          feed();
        });
        feed();
      }
    });
  }
  for (const j of jobs) j.d.dd = cache[j.id];

  // Solution : la ligne de jeu double mort complète (52 cartes), codée « joueur couleur rang » (ex. 02m).
  const solFile = path.join(__dirname, 'sol-cache.json');
  let sol = {}; try { sol = JSON.parse(fs.readFileSync(solFile, 'utf8')); } catch (e) { sol = {}; }
  const solTodo = jobs.filter(j => j.d.dd !== undefined && sol[j.id] === undefined);
  if (solTodo.length) {
    const { fork } = require('child_process');
    const workers = Math.min(solTodo.length, Math.max(1, require('os').cpus().length - 1));
    console.log(`Solutions à calculer : ${solTodo.length} donne(s) sur ${workers} processus…`);
    let next = 0, done = 0;
    await new Promise(resolve => {
      for (let w = 0; w < workers; w++) {
        const child = fork(path.join(__dirname, 'sol-worker.js'));
        const feed = () => { if (next < solTodo.length) { const j = solTodo[next++]; child.send({ id: j.id, hands: j.hands, trump: j.trump, leader: j.leader, value: j.d.dd }); } else child.kill(); };
        child.on('message', ({ id, line, error }) => {
          if (error) console.log('Solution impossible : ' + error); else sol[id] = line.map(([p, s, r]) => '' + p + s + String.fromCharCode(97 + r)).join('');
          done++;
          if (done % 10 === 0 || done === solTodo.length) fs.writeFileSync(solFile, JSON.stringify(sol));
          if (done === solTodo.length) resolve();
          feed();
        });
        feed();
      }
    });
  }
  for (const j of jobs) if (sol[j.id]) j.d.sol = sol[j.id];

  // Meilleur contrat Nord-Sud (double mort, non vulnérable), d'après tools/par.json (node tools/par.js).
  let par = {}; try { par = JSON.parse(fs.readFileSync(path.join(__dirname, 'par.json'), 'utf8')); } catch (e) { par = {}; }
  const VAL = { '♣': 20, '♦': 20, '♥': 30, '♠': 30, SA: 30 };
  const score = (l, s, t) => {
    if (t < l + 6) return -50 * (l + 6 - t);
    const base = l * VAL[s] + (s === 'SA' ? 10 : 0);
    return base + (base >= 100 ? 300 : 50) + (l === 6 ? 500 : l === 7 ? 1000 : 0) + (t - l - 6) * VAL[s];
  };
  const review = [];
  for (const d of out) {
    const p = par[d.n];
    if (!p || !d.c || d.dd === undefined) continue;
    let best = null;
    for (const [s, { t, by }] of Object.entries(p)) {
      if (t < 7) continue;
      const game = s === 'SA' ? 3 : s === '♥' || s === '♠' ? 4 : 5;
      const l = t >= 13 ? 7 : t >= 12 ? 6 : t >= game + 6 ? game : t - 6;
      const sc = score(l, s, t);
      if (!best || sc > best.sc) best = { l, s, by, t, sc };
    }
    if (!best) continue;
    const mine = score(d.c.l, d.c.s, d.dd);
    // À moins de 50 points du meilleur (ex. 4♥ = 420 contre 3SA = 430), le contrat joué compte comme le meilleur.
    d.best = best.sc - mine < 50 ? { c: d.c.l + d.c.s, by: d.c.by, t: d.dd } : { c: best.l + best.s, by: best.by, t: best.t };
    if (d.n >= 100 && best.sc - mine >= 200) review.push(`n°${d.n} ${d.t} : ${d.c.l}${d.c.s} (${mine > 0 ? '+' : ''}${mine}) alors que ${d.best.c} par ${best.by} rapporte +${best.sc} — ${d.a.filter(x => x[0] !== 'P' || x[1]).map(x => x[0]).join(' ')}`);
  }
  fs.writeFileSync(path.join(__dirname, 'robot-review.txt'), review.join('\n') + '\n');
  if (Object.keys(par).length) console.log(`Meilleur contrat connu pour ${out.filter(d => d.best).length} donnes ; ${review.length} donne(s) robot nettement sous le meilleur contrat → tools/robot-review.txt`);

  const body = `// GÉNÉRÉ par tools/build-deals.js à partir de tools/deals-src.js — ne pas éditer à la main.\nconst DEALS = ${JSON.stringify(out, null, 0).replace(/\},\{"n"/g, '},\n{"n"')};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'deals.js'), body);
console.log(`${out.length} donnes écrites dans deals.js.`);
for (const d of out) console.log(`  n°${d.n} ${d.t} : ${d.c.l}${d.c.s} par ${d.c.by}, objectif ${d.dd} levées (${d.dd - d.c.l - 6 >= 0 ? 'fait' : 'chute ' + (d.c.l + 6 - d.dd)}) · ` + SEATS.map(s => `${s} ${hcpOf(parse(d.h[s]))}H`).join(', '));
}
