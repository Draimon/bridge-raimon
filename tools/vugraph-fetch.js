// Récupère des segments Vugraph publics de BBO (archives des grandes compétitions, format LIN) dans tools/vugraph/.
// Poli : une requête toutes les 1,5 s, fichiers déjà présents sautés. Usage : node tools/vugraph-fetch.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'vugraph'); fs.mkdirSync(DIR, { recursive: true });
const EVENTS = ['Bermuda Bowl', 'Spingold', 'Vanderbilt', 'Reisinger', 'Champions Cup', 'European Team Championships', 'Cavendish', 'Rosenblum', 'Venice Cup', 'European Open'];
const UA = { 'User-Agent': 'Mozilla/5.0 (bridge study)' };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ids = new Set();
  for (const q of EVENTS) {
    const body = new URLSearchParams({ searchstring: q, command: 'search' });
    const html = await (await fetch('https://www.bridgebase.com/vugraph_archives/vugraph_archives.php?v3b=', { method: 'POST', body, headers: UA })).text();
    (html.match(/linfetch\.php\?id=\d+/g) || []).forEach(x => ids.add(x.split('=')[1]));
    console.log(q, '→', ids.size, 'segments au total'); await wait(1500);
  }
  let got = 0;
  for (const id of ids) {
    const f = path.join(DIR, id + '.lin'); if (fs.existsSync(f)) continue;
    try { const t = await (await fetch('https://www.bridgebase.com/tools/vugraph_linfetch.php?id=' + id, { headers: UA })).text(); if (t.includes('md|')) { fs.writeFileSync(f, t); got++; } } catch (e) { /* on passe */ }
    if (got % 25 === 0) console.log(got, 'téléchargés');
    await wait(1500);
  }
  console.log('fini :', got, 'nouveaux fichiers ;', fs.readdirSync(DIR).length, 'au total');
})();
