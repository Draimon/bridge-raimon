// Remet les questions « Que dis-tu ? » tirées du robot (« Règle du robot (donne n° X) ») en accord avec le robot actuel.
// Mêmes numéros et même donne ; si la séquence a changé, on interroge sur la dernière décision de Sud.
// Usage : node tools/sync-quiz.js   (après node tools/reauction.js)
const fs = require('fs'), path = require('path'), vm = require('vm');
const F = path.join(__dirname, '..', 'questions.js');
let src = fs.readFileSync(F, 'utf8');
const c = {}; vm.runInNewContext(src + ';this.Q=QUESTIONS', c);
const D = require('./deals-robot.json');
const S = ['N', 'E', 'S', 'O'], esc = s => s.split("'").join('’');
let n = 0;
for (const q of c.Q.filter(q => /donne n° (\d+)/.test(q.f || ''))) {
  const num = +/donne n° (\d+)/.exec(q.f)[1], d = D.find(x => x.n === num); if (!d) continue;
  const pre = q.s.split(' ').filter(Boolean);
  const ok = pre.every((b, i) => d.a[i] && d.a[i][0] === b), nx = d.a[pre.length];
  if (ok && nx && nx[0] === q.a) continue;
  const dec = d.a.map((x, i) => ({ x, i, seat: S[(S.indexOf(d.d) + i) % 4] })).filter(o => o.seat === 'S' && o.x[0] !== 'P' && o.x[1]);
  const o = ok && nx && S[(S.indexOf(d.d) + pre.length) % 4] === 'S' && nx[1] ? { x: nx, i: pre.length } : dec[dec.length - 1];
  const s = d.a.slice(0, o.i).map(x => x[0]).join(' ');
  const re = new RegExp(`(\\{ n: ${q.n}, [^\\n]*?s: ')[^']*(', h: '[^']*', hcp: \\d+, a: ')[^']*(', e: ')[^']*(')`);
  if (!re.test(src)) throw new Error('ligne introuvable ' + q.n);
  src = src.replace(re, `$1${s}$2${o.x[0]}$3${esc(o.x[1])}$4`);
  n++;
  console.log(`n°${q.n} (donne ${num}) : ${q.s} → ${q.a}   devient   ${s} → ${o.x[0]} (${o.x[1]})`);
}
fs.writeFileSync(F, src);
console.log(n + ' question(s) mise(s) à jour.');
