// Simule des parties complètes (déclarant joué au hasard) pour vérifier le robot de défense.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Error };
const queue = [];
ctx.setTimeout = fn => queue.push(fn);
ctx.confirm = () => true;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'deals.js'), 'utf8') + ';this.DEALS=DEALS;', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'jeu.js'), 'utf8') + ';this.createPlay=createPlay;', ctx);
const app = { innerHTML: '', querySelectorAll: () => [] };
let finished = 0;
const P = ctx.createPlay({ app, fmt: x => x, topbar: () => '', on: () => {}, go: v => v(), getProgress: () => ({}), save: () => {}, exit: () => {} });
let games = 0, errors = 0, results = [];
for (const d of ctx.DEALS) {
  if (!d.c) continue;
  for (let g = 0; g < 20; g++) {
    try {
      P.start(d);
      let guard = 0;
      while (guard++ < 500) {
        const G = P._state();
        if (G.done) break;
        if (queue.length) { queue.shift()(); continue; }
        // au déclarant (main ou mort) : carte au hasard parmi les légales
        const l = P._legal(G.turn);
        P._play(G.turn, l[Math.floor(Math.random() * l.length)]);
      }
      const G = P._state();
      if (!G.done || G.tricks.NS + G.tricks.EO !== 13) throw new Error('partie inachevée');
      results.push(G.tricks.NS - d.dd);
      games++;
    } catch (e) { errors++; console.log(`donne ${d.n} : ${e.message}`); queue.length = 0; }
  }
}
console.log(`${games} parties simulées, ${errors} erreur(s). Écart moyen déclarant au hasard vs objectif : ${(results.reduce((a, b) => a + b, 0) / results.length).toFixed(1)} levées.`);
