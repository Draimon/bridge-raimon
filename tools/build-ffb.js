// Fabrique les fichiers servis ffb-01.js, ffb-02.js… (500 donnes chacun) à partir de tools/ffb-deals.json.
// Usage : node tools/build-ffb.js   (après tools/ffb-import.js)
const fs = require('fs'), path = require('path');
const { deals } = JSON.parse(fs.readFileSync(path.join(__dirname, 'ffb-deals.json'), 'utf8'));
const PER = 500;
let files = 0;
for (let i = 0; i < deals.length; i += PER) {
  const part = deals.slice(i, i + PER).map(d => ({ n: d.n, d: d.d, v: d.v, N: d.N, E: d.E, S: d.S, O: d.O, freq: d.freq, dds: d.dds, src: { simu: d.src.simu, date: d.src.date, num: d.src.num } }));
  const name = 'ffb-' + String(++files).padStart(2, '0') + '.js';
  fs.writeFileSync(path.join(__dirname, '..', name),
    `// Donnes de simultanés FFB (résultats publics de ffbridge.fr) — généré par tools/build-ffb.js, ne pas modifier.\nvar FFB_DEALS = (typeof FFB_DEALS !== 'undefined' ? FFB_DEALS : []).concat(${JSON.stringify(part)});\n`);
  console.log(name + ' : ' + part.length + ' donnes');
}
