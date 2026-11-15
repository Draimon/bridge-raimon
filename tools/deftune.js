// Réglage prudent des poids du contre-jeu (player.js, objet DW) sur les positions de défense :
// un changement n'est gardé que s'il améliore À LA FOIS les donnes paires et impaires (anti sur-apprentissage).
const fs = require('fs'), path = require('path'), os = require('os');
const pos = JSON.parse(fs.readFileSync(path.join(__dirname, 'defense-positions.json'), 'utf8')).filter(p => p.k > 0 && !p.st.trick.length);
const src = fs.readFileSync(path.join(__dirname, '..', 'player.js'), 'utf8');
const RCH = 'AKQJT98765432', SL = 'SHDC';
let k = 0;
function load(W) {
  const code = src.replace(/const DW = Object\.assign\(\{([^}]*)\}, \{[^}]*\}\);/, (m, d) => `const DW = Object.assign({${d}}, ${JSON.stringify(W)});`)
    .replace("require('./dds.js')", `require(${JSON.stringify(path.join(__dirname, '..', 'dds.js'))})`);
  const file = path.join(os.tmpdir(), `player-dw-${process.pid}-${k++}.js`); fs.writeFileSync(file, code);
  const m = require(file); fs.unlinkSync(file); return m;
}
function score(PL) {
  const half = [0, 0];
  pos.forEach(p => { const c = PL.choose(JSON.parse(JSON.stringify(p.st)), 0); half[+p.n.slice(1) % 2] += Math.max(...Object.values(p.dd)) - p.dd[SL[c.s] + RCH[12 - c.r]]; });
  return half;
}
const base = JSON.parse('{' + /const DW = Object\.assign\(\{([^}]*)\}/.exec(src)[1].replace(/(\w+):/g, '"$1":') + '}');
let W = { ...base }, cur = score(load(W));
console.log('départ', cur);
for (let pass = 0; pass < 2; pass++) for (const key of Object.keys(base)) for (const d of [-2, -1, 1, 2]) {
  const T = { ...W, [key]: W[key] + d }, v = score(load(T));
  if (v[0] < cur[0] && v[1] < cur[1]) { cur = v; W = T; console.log(key, W[key], v); }
}
console.log('fin', cur, JSON.stringify(W));
