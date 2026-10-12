// Ajoute/actualise ?v=<horodatage> sur les scripts de index.html, pour que les téléphones rechargent
// les nouvelles versions après une publication. À lancer avant chaque commit de publication.
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'index.html');
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/<script src="([a-z0-9-]+\.js)(\?v=\d+)?"><\/script>/g, (m, file) => `<script src="${file}?v=${v}"></script>`);
fs.writeFileSync(f, s);
console.log('version ' + v + ' : ' + (s.match(/\?v=\d+/g) || []).length + ' scripts');
