// Vérifie la « solution » (meilleure carte à chaque coup) contre le minimax brut sur de petites fins de donne :
// en jouant la ligne proposée jusqu'au bout, Nord-Sud doivent faire exactement la valeur double mort.
const { solve, brute } = require('./dds.js');
let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let bad = 0;
for (let t = 0; t < 300; t++) {
  const n = 2 + (t % 4);
  const deck = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push([s, r]);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = [0, 1, 2, 3].map(p => { const m = [0, 0, 0, 0]; deck.slice(p * n, p * n + n).forEach(([s, r]) => { m[s] |= 1 << r; }); return m; });
  const trump = Math.floor(rnd() * 5) - 1; let leader = Math.floor(rnd() * 4);
  const value = brute(hands, trump, leader);
  const h = hands.map(x => x.slice()); let trick = [], ns = 0;
  for (let k = 0; k < 4 * n; k++) {
    const p = (leader + trick.length) & 3;
    const v = value - ns;   // valeur restante (invariante le long d'une ligne optimale)
    const c = solve(h, trump, leader, undefined, 0, trick, { value: v });
    if (!(h[p][c.s] & (1 << c.r))) { bad++; console.log('carte absente'); break; }
    h[p][c.s] &= ~(1 << c.r); trick.push({ p, s: c.s, r: c.r });
    if (trick.length === 4) {
      let w = trick[0]; trick.slice(1).forEach(x => { if (x.s === w.s ? x.r > w.r : x.s === trump) w = x; });
      if ((w.p & 1) === 0) ns++;
      leader = w.p; trick = [];
    }
  }
  if (ns !== value) { bad++; if (bad < 4) console.log('ÉCART', JSON.stringify({ hands, trump, value, ns })); }
}
console.log(bad ? `${bad} ligne(s) fausse(s) sur 300` : '300 fins de donne : la solution réalise exactement la valeur double mort.');
