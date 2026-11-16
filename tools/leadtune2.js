// Réglage des poids de l'entame (LW dans player.js) sur les ENTAMES D'EXPERTS (tools/lead-cache-experts.json,
// fait par CACHE=1 node tools/expertlab.js). Objectif = coût double mort − 0,2 × (même couleur que l'expert).
// Apprentissage sur les donnes paires, contrôle sur les impaires : un poids n'est gardé que s'il améliore les deux.
const fs = require('fs'), path = require('path'), os = require('os');
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'lead-cache-experts.json'), 'utf8'));
const src = fs.readFileSync(path.join(__dirname, '..', 'player.js'), 'utf8');
const SEATS = ['N', 'E', 'S', 'O'], SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 }, RCH = 'AKQJT98765432', SL = 'SHDC';
const parse = h => h.split('.').map(p => (p === '-' ? [] : p.split('').map(c => 12 - RCH.indexOf(c))));
let k = 0;
function load(W) {
  const code = src.replace(/const LW = Object\.assign\(\{([^}]*)\}, \{[^}]*\}\);/, (m, d) => `const LW = Object.assign({${d}}, ${JSON.stringify(W)});`)
    .replace("require('./dds.js')", `require(${JSON.stringify(path.join(__dirname, '..', 'dds.js'))})`);
  const file = path.join(os.tmpdir(), `player-lw2-${process.pid}-${k++}.js`); fs.writeFileSync(file, code);
  const m = require(file); fs.unlinkSync(file); return m;
}
function score(PL) {
  const r = [{ dd: 0, ag: 0, n: 0 }, { dd: 0, ag: 0, n: 0 }];
  items.forEach((it, i) => {
    const c = it.contract, trump = c.s === 'SA' ? null : SI[c.s];
    const hands = {}; SEATS.forEach(s => { hands[s] = s === it.leader ? parse(it.hand) : [[], [], [], []]; });
    const st = { me: it.leader, hands, visible: [], trick: [], played: [], trump, decl: c.decl, counts: { N: 13, E: 13, S: 13, O: 13 }, voids: { N: [], E: [], S: [], O: [] }, bids: it.bids, dealer: it.dealer };
    const card = PL.choose(st, 0), key = SL[card.s] + RCH[12 - card.r], v = it.dd[key];
    if (v === undefined) return;
    const h = r[i % 2]; h.dd += Math.max(...Object.values(it.dd)) - v; h.ag += key[0] === it.expert[0] ? 1 : 0; h.n++;
  });
  return r.map(h => ({ obj: (h.dd - 0.2 * h.ag) / h.n, dd: h.dd / h.n, ag: h.ag / h.n }));
}
const base = JSON.parse('{' + /const LW = Object\.assign\(\{([^}]*)\}/.exec(src)[1].replace(/(\w+):/g, '"$1":') + '}');
let W = { ...base }, cur = score(load(W));
const show = x => x.map(h => `coût DD ${h.dd.toFixed(3)} · même couleur ${(100 * h.ag).toFixed(1)} %`).join('  |  contrôle : ');
console.log('départ  apprentissage :', show(cur));
for (let pass = 0; pass < 2; pass++) for (const key of Object.keys(base)) for (const d of [-2, -1, 1, 2]) {
  const T = { ...W, [key]: W[key] + d }, v = score(load(T));
  if (v[0].obj < cur[0].obj - 1e-4 && v[1].obj < cur[1].obj - 1e-4) { cur = v; W = T; console.log(key, W[key], '→', show(v)); }
}
console.log('fin     apprentissage :', show(cur));
console.log(JSON.stringify(W));
