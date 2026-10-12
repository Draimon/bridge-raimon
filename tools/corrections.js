// Lit les corrections envoyées depuis l'appli (Firestore, collection « corrections »).
// Usage : node tools/corrections.js            → liste les nouvelles
//         node tools/corrections.js tout       → liste tout
//         node tools/corrections.js traite <id> → marque une correction comme traitée
const BASE = 'https://firestore.googleapis.com/v1/projects/systeme-raimon/databases/(default)/documents/corrections';
const KEY = 'AIzaSyCntK9XEN1dCGrboXDl9lUx1tU-fnXoVXM';
(async () => {
  const [cmd, id] = process.argv.slice(2);
  if (cmd === 'traite') {
    const doc = await (await fetch(`${BASE}/${id}?key=${KEY}`)).json();
    const data = { ...JSON.parse(doc.fields.data.stringValue), statut: 'traité', traiteLe: Date.now() };
    const r = await fetch(`${BASE}/${id}?key=${KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(data) } } }) });
    console.log(r.ok ? `Correction ${id} marquée comme traitée.` : `Erreur ${r.status}`); return;
  }
  const r = await (await fetch(`${BASE}?pageSize=300&key=${KEY}`)).json();
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
