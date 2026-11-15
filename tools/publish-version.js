// Prévient tous les téléphones ouverts qu'une nouvelle version est publiée (document public stats/version).
// À lancer APRÈS le push : RAIMON_CODE=<code> node tools/publish-version.js
// Les applis écoutent ce document en direct : elles vérifient le site, puis proposent ou font la mise à jour.
const fs = require('fs'), path = require('path');
const KEY = 'AIzaSyCQ9Uo2TuV-O6ZLwZ_2vIE1LX-WwcCwuf4';
const REF = { Referer: 'https://draimon.github.io/bridge-raimon/' };
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const v = (html.match(/jeu\.js\?v=(\d+)/) || [])[1];
  if (!v) { console.log('Version introuvable dans index.html'); process.exit(1); }
  const code = process.env.RAIMON_CODE; if (!code) { console.log('Variable RAIMON_CODE manquante.'); process.exit(1); }
  const login = await (await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json', ...REF }, body: JSON.stringify({ email: 'damien@systeme-raimon.app', password: 'raimon-' + code, returnSecureToken: true }) })).json();
  if (login.error) { console.log('Connexion refusée : ' + login.error.message); process.exit(1); }
  const url = 'https://firestore.googleapis.com/v1/projects/systeme-raimon/databases/(default)/documents/stats/version?key=' + KEY;
  const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.idToken, ...REF }, body: JSON.stringify({ fields: { v: { stringValue: v }, t: { integerValue: String(Date.now()) } } }) });
  console.log(r.ok ? `Version ${v} annoncée à tous les téléphones.` : 'Erreur ' + r.status + ' ' + await r.text());
})();
