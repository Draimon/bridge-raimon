// Rejoue le robot sur les donnes existantes (après une modification de robot.js) sans changer leurs numéros ni leurs mains.
// Usage : node tools/reauction.js   → met à jour tools/deals-robot.json et tools/deals-duo.json, liste les séquences changées.
// Une donne que le robot ne sait plus enchérir garde son ancienne séquence (signalée), pour ne casser ni les parties ni la progression.
const fs = require('fs'), path = require('path');
const R = require('../robot.js');
for (const f of ['deals-robot.json', 'deals-duo.json']) {
  const file = path.join(__dirname, f), D = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0, kept = 0;
  for (const d of D) {
    const c = d.comp ? R.compAuction({ N: d.N, E: d.E, S: d.S, O: d.O }, d.v) : null;
    const a = d.comp ? c && c.d === d.d && c.a : R.auction(d.N, d.S);
    if (!a) { kept++; console.log(`  ${f} n°${d.n} : le robot ne sait plus l'enchérir, ancienne séquence gardée`); continue; }
    const before = d.a.map(x => x[0]).join(' '), after = a.map(x => x[0]).join(' ');
    if (before !== after) { changed++; console.log(`  ${f} n°${d.n} ${d.t} : ${before}  →  ${after}`); }
    d.a = a; d.t = (f === 'deals-robot.json' ? 'Robot · ' : '') + (d.comp ? c.theme : R.theme(a));
  }
  fs.writeFileSync(file, JSON.stringify(D, null, 1));
  console.log(`${f} : ${D.length} donnes, ${changed} séquence(s) changée(s), ${kept} gardée(s) telle(s) quelle(s).`);
}
