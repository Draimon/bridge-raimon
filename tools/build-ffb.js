// Fabrique les fichiers servis ffb-01.js, ffb-02.js… (500 donnes chacun) à partir de tools/ffb-deals.json,
// et met à jour leur liste dans index.html et tools/check.js (un nouveau paquet est donc chargé automatiquement).
// Usage : node tools/build-ffb.js   (après tools/ffb-import.js)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { deals } = JSON.parse(fs.readFileSync(path.join(__dirname, 'ffb-deals.json'), 'utf8'));
const PER = 500;
const names = [];
for (let i = 0; i < deals.length; i += PER) {
  const part = deals.slice(i, i + PER).map(d => ({ n: d.n, d: d.d, v: d.v, N: d.N, E: d.E, S: d.S, O: d.O, freq: d.freq, dds: d.dds, src: { simu: d.src.simu, date: d.src.date, num: d.src.num } }));
  const name = 'ffb-' + String(names.length + 1).padStart(2, '0') + '.js';
  names.push(name);
  fs.writeFileSync(path.join(root, name),
    `// Donnes de simultanés FFB (résultats publics de ffbridge.fr) — généré par tools/build-ffb.js, ne pas modifier.\nvar FFB_DEALS = (typeof FFB_DEALS !== 'undefined' ? FFB_DEALS : []).concat(${JSON.stringify(part)});\n`);
  console.log(name + ' : ' + part.length + ' donnes');
}
// index.html : une balise par paquet, à la place des anciennes
const idx = path.join(root, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const ver = (html.match(/<script src="ffb-01\.js\?v=(\d+)"><\/script>/) || [])[1] || '1';
html = html.replace(/(<script src="ffb-\d+\.js\?v=\d+"><\/script>\n)+/, names.map(n => `<script src="${n}?v=${ver}"></script>\n`).join(''));
fs.writeFileSync(idx, html);
// check.js : vérifier la syntaxe de chaque paquet
const chk = path.join(__dirname, 'check.js');
let c = fs.readFileSync(chk, 'utf8');
c = c.replace(/(, 'ffb-\d+\.js')+\]/, names.map(n => `, '${n}'`).join('') + ']');
fs.writeFileSync(chk, c);
console.log(`index.html et check.js : ${names.length} paquet(s)`);
