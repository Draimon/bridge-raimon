// Réassort automatique des donnes FFB (lancé chaque lundi par GitHub Actions, ou à la main).
// Lit le compteur public stats/ffb (numéros des donnes déjà jouées au salon) ; s'il reste moins de 500 donnes
// jamais jouées, importe 500 donnes de plus (tools/ffb-import.js) et regénère les fichiers servis (tools/build-ffb.js).
// Usage : node tools/restock.js [seuil=500] [lot=500]   → écrit « RESTOCK=oui|non » pour le workflow.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const KEY = 'AIzaSyCQ9Uo2TuV-O6ZLwZ_2vIE1LX-WwcCwuf4';
const REF = { Referer: 'https://draimon.github.io/bridge-raimon/' };
const URL = 'https://firestore.googleapis.com/v1/projects/systeme-raimon/databases/(default)/documents/stats/ffb?key=' + KEY;
const SEUIL = +process.argv[2] || 500, LOT = +process.argv[3] || 500;
(async () => {
  const total = JSON.parse(fs.readFileSync(path.join(__dirname, 'ffb-deals.json'), 'utf8')).deals.length;
  const r = await fetch(URL, { headers: REF });
  if (!r.ok) { console.log('Compteur illisible : HTTP ' + r.status); process.exit(1); }
  const doc = await r.json();
  const vals = (((doc.fields || {}).joues || {}).arrayValue || {}).values || [];
  const played = new Set(vals.map(v => v.stringValue)).size;
  const left = total - played;
  console.log(`${total} donnes FFB, ${played} déjà jouées, ${left} jamais jouées (seuil ${SEUIL}).`);
  let restock = false;
  if (left < SEUIL) {
    console.log(`Réassort : +${LOT} donnes.`);
    execFileSync(process.execPath, [path.join(__dirname, 'ffb-import.js'), String(total + LOT)], { stdio: 'inherit' });
    execFileSync(process.execPath, [path.join(__dirname, 'build-ffb.js')], { stdio: 'inherit' });
    restock = true;
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `restock=${restock ? 'oui' : 'non'}\n`);
  console.log('RESTOCK=' + (restock ? 'oui' : 'non'));
})().catch(e => { console.log('Erreur : ' + e.message); process.exit(1); });
