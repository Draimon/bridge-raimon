// Vérifie la banque de questions : numéros uniques, mains valides, points, légalité des enchères, tour de Sud.
const fs = require('fs'), path = require('path'), vm = require('vm');
// Syntaxe de tous les scripts servis par le site (une erreur casse la page entière).
for (const f of ['questions.js', 'fiche.js', 'deals.js', 'deals-duo.js', 'jeu.js', 'dds.js', 'adeux.js']) {
  try { new vm.Script(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f }); }
  catch (e) { console.log(`ERREUR DE SYNTAXE dans ${f} : ${e.message}`); process.exit(1); }
}
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  try { new vm.Script(m[1], { filename: 'index.html' }); }
  catch (e) { console.log('ERREUR DE SYNTAXE dans index.html : ' + e.message); process.exit(1); }
}
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'questions.js'), 'utf8') + ';this.THEMES=THEMES;this.QUESTIONS=QUESTIONS;', ctx);
const { THEMES, QUESTIONS } = ctx;
const SEATS = ['O', 'N', 'E', 'S'], STRAINS = ['♣', '♦', '♥', '♠', 'SA'];
const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
const themes = new Set(THEMES.map(t => t[0]));
let errors = 0; const err = (q, m) => { errors++; console.log(`n°${q.n}: ${m}`); };
const seen = new Set();
for (const q of QUESTIONS) {
  if (seen.has(q.n)) err(q, 'numéro en double'); seen.add(q.n);
  if (!themes.has(q.t)) err(q, 'thème inconnu ' + q.t);
  if (!q.a) err(q, 'pas de réponse');
  if (q.k === 's' || q.k === 'm') {
    if (!SEATS.includes(q.d)) err(q, 'donneur invalide');
    const bids = (q.s || '').split(/\s+/).filter(Boolean);
    let last = -1;
    for (const b of bids) {
      if (b === 'P' || b === 'X' || b === 'XX') continue;
      const r = rank(b); if (r < 0) { err(q, 'enchère illisible ' + b); continue; }
      if (r <= last) err(q, 'enchère non croissante ' + b); last = r;
    }
    if (q.k === 's' && !bids.length) err(q, 'séquence vide');
    if (q.k === 'm') {
      const next = SEATS[(SEATS.indexOf(q.d) + bids.length) % 4];
      if (next !== 'S') err(q, 'ce n’est pas à Sud de parler (' + next + ')');
      if (!['P', 'X', 'XX'].includes(q.a) && rank(q.a) <= last) err(q, 'réponse insuffisante ' + q.a);
      const parts = q.h.split('.');
      if (parts.length !== 4) err(q, 'main : 4 couleurs attendues');
      const cards = parts.map(p => p === '-' ? '' : p);
      const len = cards.reduce((s, p) => s + p.length, 0);
      if (len !== 13) err(q, 'main de ' + len + ' cartes');
      cards.forEach((p, i) => { if (new Set(p).size !== p.length) err(q, 'carte en double couleur ' + i); if (/[^AKQJT98765432]/.test(p)) err(q, 'carte invalide ' + p); });
      const hcp = cards.join('').split('').reduce((s, c) => s + ({ A: 4, K: 3, Q: 2, J: 1 }[c] || 0), 0);
      if (q.hcp !== undefined && hcp !== q.hcp) err(q, `points : ${hcp} au lieu de ${q.hcp}`);
    }
  }
  if (q.k === 'c' && (!q.w || q.w.length < 3)) err(q, 'il faut 3 mauvaises réponses');
  if (q.w && q.w.includes(q.a)) err(q, 'la bonne réponse est aussi dans les mauvaises');
}
// Thèmes avec trop peu de réponses distinctes pour tirer 3 leurres
for (const [id] of THEMES) {
  const s = QUESTIONS.filter(q => q.t === id && q.k === 's' && !q.w);
  const pool = new Set(QUESTIONS.filter(q => q.t === id && q.k === 's').map(q => q.a));
  for (const q of s) if ([...pool].filter(a => a !== q.a).length < 3) err(q, 'pas assez de leurres dans le thème ' + id);
}
const nums = QUESTIONS.map(q => q.n).sort((a, b) => a - b);
console.log(`${QUESTIONS.length} questions (n°${nums[0]} à n°${nums[nums.length - 1]}), ${errors} erreur(s).`);
for (const [id, name] of THEMES) console.log(`  ${name} : ${QUESTIONS.filter(q => q.t === id).length}`);
process.exit(errors ? 1 : 0);
