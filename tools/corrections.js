// Lit les corrections envoyées depuis l'appli (Firestore, collection « corrections »).
// Usage : node tools/corrections.js            → liste les nouvelles
//         node tools/corrections.js tout       → liste tout
//         node tools/corrections.js traite <id> → marque une correction comme traitée
const BASE = 'https://firestore.googleapis.com/v1/projects/systeme-raimon/databases/(default)/documents/corrections';
const KEY = 'AIzaSyCQ9Uo2TuV-O6ZLwZ_2vIE1LX-WwcCwuf4';
// La clé n'accepte que les requêtes venant du site de l'appli (restriction Google Cloud) : on s'annonce comme tel.
const REF = { Referer: 'https://draimon.github.io/bridge-raimon/' };
(async () => {
  const [cmd, id] = process.argv.slice(2);
  if (cmd === 'traite') {
    const doc = await (await fetch(`${BASE}/${id}?key=${KEY}`, { headers: REF })).json();
    const data = { ...JSON.parse(doc.fields.data.stringValue), statut: 'traité', traiteLe: Date.now() };
    const r = await fetch(`${BASE}/${id}?key=${KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...REF }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(data) } } }) });
    console.log(r.ok ? `Correction ${id} marquée comme traitée.` : `Erreur ${r.status}`); return;
  }
  const r = await (await fetch(`${BASE}?pageSize=300&key=${KEY}`, { headers: REF })).json();
  if (r.error) { console.log('Erreur :', r.error.message); return; }
  const all = (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...JSON.parse(d.fields.data.stringValue) })).sort((a, b) => a.date - b.date);
  const list = cmd === 'tout' ? all : all.filter(c => c.statut !== 'traité');
  if (!list.length) { console.log('Aucune correction ' + (cmd === 'tout' ? '' : 'nouvelle') + '.'); return; }
  for (const c of list) {
    console.log(`\n[${c.id}] ${new Date(c.date).toLocaleString('fr-FR')} · ${c.auteur} · ${c.type}${c.donne ? ' n° ' + c.donne : ''}${c.question ? ' n° ' + c.question : ''} · ${c.statut}`);
    console.log('  Remarque : ' + c.texte);
    console.log('  Contexte : ' + (c.rapport || '').replace(/\n/g, '\n            '));
  }
})();
