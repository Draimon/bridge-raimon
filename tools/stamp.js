// Ajoute/actualise ?v=<horodatage> sur les scripts de index.html, pour que les téléphones rechargent
// les nouvelles versions après une publication. À lancer avant chaque commit de publication.
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'index.html');
const d = new Date(), p = n => String(n).padStart(2, '0');      // heure locale (Paris), affichée sur l'accueil
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/<script src="([a-z0-9-]+\.js)(\?v=\d+)?"><\/script>/g, (m, file) => `<script src="${file}?v=${v}"></script>`);
fs.writeFileSync(f, s);
console.log('version ' + v + ' : ' + (s.match(/\?v=\d+/g) || []).length + ' scripts');
