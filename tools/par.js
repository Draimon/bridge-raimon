// Meilleur contrat double mort pour Nord-Sud : levées par dénomination (fits de 7+ cartes et SA), meilleur déclarant.
// Résultat dans tools/par.json (et cache partagé dd-cache.json). Usage : node tools/par.js
const fs = require('fs'), path = require('path'), { fork } = require('child_process');
const vm = require('vm');
const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'deals.js'), 'utf8') + ';this.DEALS=DEALS', ctx);
// + les donnes du mode « Jouer à deux » (n° T001…)
const duoFile = path.join(__dirname, '..', 'deals-duo.js');
if (fs.existsSync(duoFile)) { const c2 = {}; vm.runInNewContext(fs.readFileSync(duoFile, 'utf8') + ';this.D=DUO_DEALS', c2); ctx.DEALS = ctx.DEALS.concat(c2.D); }
const PLAY = ['N', 'E', 'S', 'O'], SUITS = ['♠', '♥', '♦', '♣'], RANKS = 'AKQJT98765432';
const toMask = h => h.split('.').map(p => (p === '-' ? 0 : p.split('').reduce((m, ch) => m | (1 << (12 - RANKS.indexOf(ch))), 0)));
const len = h => h.split('.').map(p => (p === '-' ? 0 : p.length));
const cacheFile = path.join(__dirname, 'dd-cache.json');
let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { cache = {}; }

const jobs = [];
for (const d of ctx.DEALS) {
  const hands = PLAY.map(s => toMask(d.h[s]));
  const ln = len(d.h.N), ls = len(d.h.S);
  const hcp = h => h.replace(/\./g, '').split('').reduce((t, c) => t + ({ A: 4, K: 3, Q: 2, J: 1 }[c] || 0), 0);
  // SA + les fits de 8 cartes ou plus ; un seul déclarant : le plus long en atout (le plus fort à SA ou à égalité).
  const strains = [-1, ...[0, 1, 2, 3].filter(s => ln[s] + ls[s] >= 8)];
  for (const trump of strains) {
    const nFirst = trump < 0 || ln[trump] === ls[trump] ? hcp(d.h.N) >= hcp(d.h.S) : ln[trump] > ls[trump];
    const decl = nFirst ? 'N' : 'S';
    const leader = (PLAY.indexOf(decl) + 1) % 4;
    const id = JSON.stringify([hands, trump, leader]);
    jobs.push({ n: d.n, trump, decl, id, hands, leader });
  }
}
const todo = [...new Map(jobs.filter(j => cache[j.id] === undefined).map(j => [j.id, j])).values()];
console.log(`${jobs.length} calculs nécessaires, ${todo.length} à faire.`);

function report() {
  const out = {};
  for (const j of jobs) {
    const v = cache[j.id]; if (v === undefined) continue;
    const k = j.trump < 0 ? 'SA' : SUITS[j.trump];
    out[j.n] = out[j.n] || {};
    if (!out[j.n][k] || v > out[j.n][k].t) out[j.n][k] = { t: v, by: j.decl };
  }
  fs.writeFileSync(path.join(__dirname, 'par.json'), JSON.stringify(out));
  return out;
}

(async () => {
  if (todo.length) {
    const workers = Math.min(todo.length, Math.max(1, require('os').cpus().length - 1));
    let next = 0, done = 0;
    await new Promise(resolve => {
      for (let w = 0; w < workers; w++) {
        const child = fork(path.join(__dirname, 'dd-worker.js'));
        const feed = () => { if (next < todo.length) { const j = todo[next++]; child.send({ id: j.id, hands: j.hands, trump: j.trump, leader: j.leader, guess: 9 }); } else child.kill(); };
        child.on('message', ({ id, tricks }) => {
          cache[id] = tricks; done++;
          if (done % 10 === 0 || done === todo.length) { fs.writeFileSync(cacheFile, JSON.stringify(cache)); report(); console.log(`${done}/${todo.length}`); }
          if (done === todo.length) resolve();
          feed();
        });
        feed();
      }
    });
  }
  const out = report();
  console.log(`Meilleurs contrats calculés pour ${Object.keys(out).length} donnes → tools/par.json`);
})();
