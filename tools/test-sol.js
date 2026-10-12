// Rejoue la solution de chaque donne dans le moteur de l'appli : Nord-Sud doivent faire exactement l'objectif.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Error, setTimeout: () => {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'deals.js'), 'utf8') + ';this.DEALS=DEALS;', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'jeu.js'), 'utf8') + ';this.createPlay=createPlay;', ctx);
const app = { innerHTML: '', querySelectorAll: () => [] };
const P = ctx.createPlay({ app, fmt: x => x, topbar: () => '', on: () => {}, go: v => v(), getProgress: () => ({}), save: () => {}, exit: () => {} });
let ok = 0, bad = 0;
for (const d of ctx.DEALS) {
  if (!d.sol) { bad++; console.log(`donne ${d.n} : pas de solution`); continue; }
  P.start(d, 'sol'); P._solGo(52);
  const G = P._state();
  if (G.tricks.NS === d.dd && G.tricks.NS + G.tricks.EO === 13) ok++;
  else { bad++; console.log(`donne ${d.n} : solution = ${G.tricks.NS} levées, objectif ${d.dd}`); }
}
console.log(`${ok} solutions conformes à l'objectif, ${bad} anomalie(s).`);
