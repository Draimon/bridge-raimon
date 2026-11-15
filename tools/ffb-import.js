// Importe des donnes réelles des simultanés FFB (résultats publics de ffbridge.fr) pour le salon de bridge.
// Pour chaque donne : les 4 mains, le donneur et la vulnérabilité (selon le numéro), la feuille de fréquences
// (scores de toutes les tables → classement en %) et le double mort. AUCUN nom de joueur n'est conservé.
// Usage : node tools/ffb-import.js [objectif=1000]   → complète tools/ffb-deals.json jusqu'à l'objectif
// Les numéros F0001… sont fixes : on ajoute toujours à la suite, on ne renumérote jamais.
const fs = require('fs'), path = require('path');
const API = 'https://www.ffbridge.fr/api';
const FILE = path.join(__dirname, 'ffb-deals.json');
const target = +process.argv[2] || 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + u, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      if (r.ok) return r.json();
      if (r.status === 404) return null;
    } catch (e) { /* réseau : on réessaie */ }
    await sleep(2000 * (i + 1));
  }
  throw new Error('échec ' + u);
}
// Donneur et vulnérabilité standard selon le numéro de donne
const DEALER = ['N', 'E', 'S', 'O'];
const VUL = ['-', 'NS', 'EO', 'T', 'NS', 'EO', 'T', '-', 'EO', 'T', '-', 'NS', 'T', '-', 'NS', 'EO'];
const SEAT = { N: 'N', E: 'E', S: 'S', W: 'O' };
function parseDeal(pbn) {                 // "N:AK4..76542.86532 987.AJ8543.83.QJ …" (ordre N E S O)
  const [first, rest] = pbn.split(':');
  const order = ['N', 'E', 'S', 'W'], start = order.indexOf(first), hands = rest.trim().split(/\s+/), out = {};
  hands.forEach((h, i) => { out[SEAT[order[(start + i) % 4]]] = h; });
  return out;
}

(async () => {
  const db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { sessions: [], deals: [] };
  const seenBoards = new Set(db.deals.map(d => d.src.board));
  const doneSessions = new Set(db.sessions);
  let next = db.deals.reduce((m, d) => Math.max(m, +d.n.slice(1)), 0) + 1;
  // Simultanés de club de la saison en cours et des précédentes (Roy René, Simultanet, Octopus…)
  const simus = [];
  for (const season of [38, 37]) {
    const r = await get(`/results/search/?competitionType=clubSimultaneous&season=${season}&currentPage=1&maxPerPage=80`);
    for (const s of (r && r.items) || []) if (!simus.some(x => x.id === s.id)) simus.push({ id: s.id, code: s.code, label: s.label });
  }
  console.log(simus.length + ' simultanés trouvés');
  // Séances de tous les simultanés, les plus récentes d'abord (variété des sources)
  const sessions = [];
  for (const s of simus) {
    const r = await get(`/competitions/simultaneous/${s.id}/sessions`);
    for (const x of (r && r.items) || []) if (x.resultImportDate) sessions.push({ id: x.id, date: x.date.slice(0, 10), simu: s.code || s.label });
    await sleep(200);
  }
  sessions.sort((a, b) => b.date.localeCompare(a.date));
  console.log(sessions.length + ' séances avec résultats');
  for (const ses of sessions) {
    if (db.deals.length >= target) break;
    if (doneSessions.has(ses.id)) continue;
    try {
      const rk = await get(`/results/sessions/${ses.id}/ranking?paginate=true`);
      const teams = ((rk && rk.items) || []).map(t => t.team && t.team.id).filter(Boolean);
      const boards = new Map();
      // une paire ne joue pas toutes les donnes : on prend quelques paires jusqu'à tout couvrir
      for (const tid of teams.slice(0, 6)) {
        const sc = await get(`/results/teams/${tid}/session/${ses.id}/scores`);
        for (const x of sc || []) if (x.board && x.board.deal && !boards.has(x.board.id)) boards.set(x.board.id, x.board);
        await sleep(300);
        if (boards.size >= 24 && teams.length) break;
      }
      let added = 0;
      for (const b of [...boards.values()].sort((p, q) => p.boardNumber - q.boardNumber)) {
        if (seenBoards.has(b.id) || db.deals.length >= target) continue;
        const freq = (b.frequencies || []).map(f => [f.nsScore ? +f.nsScore : -(+f.ewScore || 0), f.count]).filter(f => f[1] > 0);
        const tables = freq.reduce((s, f) => s + f[1], 0);
        if (tables < 8) continue;                                          // trop peu de tables pour un vrai %
        const i = (b.boardNumber - 1) % 16;
        db.deals.push({
          n: 'F' + String(next++).padStart(4, '0'),
          d: DEALER[(b.boardNumber - 1) % 4], v: VUL[i],
          ...parseDeal(b.deal),
          freq,                                                            // [score NS, nombre de tables]
          dds: b.dds,
          src: { simu: ses.simu, date: ses.date, session: ses.id, board: b.id, num: b.boardNumber },
        });
        seenBoards.add(b.id); added++;
      }
      db.sessions.push(ses.id);
      fs.writeFileSync(FILE, JSON.stringify(db));
      console.log(`${ses.simu} ${ses.date} : +${added} donnes (total ${db.deals.length})`);
    } catch (e) { console.log(`${ses.simu} ${ses.date} : ${e.message}`); }
    await sleep(500);
  }
  console.log(`Terminé : ${db.deals.length} donnes dans tools/ffb-deals.json`);
})();
