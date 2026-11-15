// Réglage des poids de l'entame (player.js, objet LW) sur le labo d'entame : descente coordonnée,
// apprise sur les donnes paires, vérifiée sur les impaires (pour ne pas sur-apprendre).
// Usage : node tools/leadtune.js [SYS]   → affiche les meilleurs poids
const fs = require('fs'), path = require('path');
const SYS = process.argv[2] || 'sef';
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'lead-cache-' + SYS + '.json'), 'utf8'));
const src = fs.readFileSync(path.join(__dirname, '..', 'player.js'), 'utf8');
const SEATS = ['N', 'E', 'S', 'O'], SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 }, RCH = 'AKQJT98765432', SL = 'SHDC';
const partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
const parse = h => h.split('.').map(p => (p === '-' ? [] : p.split('').map(c => 12 - RCH.indexOf(c))));
let k = 0;
function load(W) {
  const code = src.replace(/const LW = Object\.assign\(\{([^}]*)\}, \{[^}]*\}\);/, (m, d) => `const LW = Object.assign({${d}}, ${JSON.stringify(W)});`);
  const file = path.join(require('os').tmpdir(), `player-tune-${process.pid}-${k++}.js`);
  fs.writeFileSync(file, code.replace("require('./dds.js')", `require(${JSON.stringify(path.join(__dirname, '..', 'dds.js'))})`));
  const m = require(file); fs.unlinkSync(file); return m;
}
function score(PL, part) {
  let lost = 0;
  items.forEach((it, i) => {
    if (part !== undefined && i % 2 !== part) return;
    const c = it.contract, trump = c.s === 'SA' ? null : SI[c.s];
    const hands = {}; SEATS.forEach(s => { hands[s] = s === it.leader ? parse(it.hand) : [[], [], [], []]; });
    const counts = { N: 13, E: 13, S: 13, O: 13 };
    const st = { me: it.leader, hands, visible: [], trick: [], played: [], trump, decl: c.decl, counts, voids: { N: [], E: [], S: [], O: [] }, bids: it.bids, dealer: it.dealer };
    const card = PL.choose(st, 0);
    lost += Math.max(...Object.values(it.dd)) - it.dd[SL[card.s] + RCH[12 - card.r]];
  });
  return lost;
}
const KEYS = ['partner', 'own', 'opp', 'seq', 'seq3', 'underAce', 'bareHon', 'single', 'doubleton', 'nothing', 'ntLen', 'ntHon'];
const base = { partner: 6, own: 3, opp: -4, seq: 3, seq3: 1, underAce: -3, bareHon: -2, single: 2, doubleton: 0.5, nothing: 1, ntLen: 1.5, ntHon: 0.5 };
let W = { ...base }, cur = score(load(W), 0);
console.log('départ : apprentissage', cur, '· contrôle', score(load(W), 1));
for (let pass = 0; pass < 3; pass++) {
  for (const key of KEYS) for (const d of [-2, -1, -0.5, 0.5, 1, 2]) {
    const T = { ...W, [key]: W[key] + d }; const v = score(load(T), 0);
    if (v < cur) { cur = v; W = T; }
  }
}
console.log('réglé : apprentissage', cur, '· contrôle', score(load(W), 1), '· tout', score(load(W)));
console.log(JSON.stringify(W));
