// Génère des questions « Que dis-tu ? » à partir des donnes du robot (une décision de Sud par donne).
// Usage : node tools/gen-quiz-robot.js <premier numéro> > fichier ; les numéros sont ensuite figés dans questions.js.
const R = require('../robot.js');
const deals = require('./deals-robot.json');
const START = +process.argv[2] || 312;
const MAP = {
  'Stayman': 'texas', 'Texas': 'texas', 'Texas mineur': 'texas', 'Sur 1SA': '1sa', 'Bicolore majeur': '1sa', 'Quantitatif': '1sa', 'Chelem sur 1SA': 'chelem',
  'Puppet': 'puppet', 'Texas sur 2SA': '2sa', 'Sur 2SA': '2sa', 'Shadow fit': 'shadow', 'Oklahoma': 'okla', 'Oklahoma – chelem': 'chelem',
  'Roudy': 'roudy', 'Check-Back Stayman': 'checkback', 'Enchère d’essai': 'essai', '2 sur 1': 'reponses', 'Soutien majeur': 'reponses',
  'Mineure – majeure': 'reponses', 'Majeure – 1SA': 'reponses', '1♥ – 1♠': 'reponses', '1♣ – 1♦': 'reponses', 'Mineure – SA': 'reponses',
  'Soutien mineur': 'reponses', 'Lebelson': 'lebel', 'Truscott': 'truscott', 'Contre d’appel': 'contres', 'Copenhague': 'baba',
};
const CAP = 5, SEATS = ['N', 'E', 'S', 'O'];
const count = {}, out = [];
let n = START;
const esc = s => s.split("'").join('’');
for (const d of deals) {
  const th = MAP[d.t.replace('Robot · ', '')];
  if (!th || (count[th] || 0) >= CAP) continue;
  // décisions de Sud (hors passe), on garde la dernière (souvent la plus intéressante)
  const dec = d.a.map((x, i) => ({ x, i, seat: SEATS[(SEATS.indexOf(d.d) + i) % 4] })).filter(o => o.seat === 'S' && o.x[0] !== 'P' && o.x[1]);
  if (!dec.length) continue;
  const o = dec[dec.length - 1];
  const prefix = d.a.slice(0, o.i).map(x => x[0]).join(' ');
  const hcp = R.evalHand(d.S).hcp;
  count[th] = (count[th] || 0) + 1;
  out.push(`  { n: ${n++}, t: '${th}', k: 'm', d: '${d.d}', s: '${prefix}', h: '${d.S}', hcp: ${hcp}, a: '${o.x[0]}', e: '${esc(o.x[1])}', f: 'Règle du robot (donne n° ${d.n})' },`);
}
console.log('  // ───────── « Que dis-tu ? » tirées des donnes du robot (13/10/2026)');
console.log(out.join('\n'));
console.error(`${out.length} questions générées (n° ${START} à ${n - 1})`, count);
