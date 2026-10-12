// Vérifie le solveur depuis une levée commencée (1 à 3 cartes posées) contre un minimax brut.
const { solve } = require('./dds.js');
let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function bruteFrom(h, trump, trick, nextSeat) {
  // trick : [{p,s,r}] déjà posées ; minimax brut jusqu'à la fin.
  function rec(pos, p, led, ws, wr, winner) {
    if (pos === 4) { const won = (winner & 1) === 0 ? 1 : 0; if (h[0].every(m => !m) && h[1].every(m => !m)) return won; return won + rec(0, winner, -1, -1, -1, -1); }
    const max = (p & 1) === 0; let best = max ? -1 : 99;
    const suits = led >= 0 && h[p][led] ? [led] : [0, 1, 2, 3];
    for (const s of suits) for (let r = 0; r < 13; r++) {
      const b = 1 << r; if (!(h[p][s] & b)) continue;
      h[p][s] &= ~b;
      let nws = ws, nwr = wr, nw = winner;
      if (pos === 0 || (s === ws ? r > wr : s === trump)) { nws = s; nwr = r; nw = p; }
      const v = rec(pos + 1, (p + 1) & 3, pos === 0 ? s : led, nws, nwr, nw);
      h[p][s] |= b;
      best = max ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  let ws = trick[0].s, wr = trick[0].r, w = trick[0].p;
  trick.slice(1).forEach(c => { if (c.s === ws ? c.r > wr : c.s === trump) { ws = c.s; wr = c.r; w = c.p; } });
  return rec(trick.length, nextSeat, trick[0].s, ws, wr, w);
}
let bad = 0, n = 0;
for (let t = 0; t < 400; t++) {
  const k = 2 + (t % 3);
  const deck = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push([s, r]);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = [0, 1, 2, 3].map(p => { const m = [0, 0, 0, 0]; deck.slice(p * k, p * k + k).forEach(([s, r]) => { m[s] |= 1 << r; }); return m; });
  const trump = Math.floor(rnd() * 5) - 1, leader = Math.floor(rnd() * 4), played = 1 + (t % 3);
  // jouer `played` cartes légales au hasard
  const trick = []; let p = leader;
  for (let i = 0; i < played; i++) {
    const led = trick.length ? trick[0].s : -1;
    const opts = []; const suits = led >= 0 && hands[p][led] ? [led] : [0, 1, 2, 3];
    suits.forEach(s => { for (let r = 0; r < 13; r++) if (hands[p][s] & (1 << r)) opts.push([s, r]); });
    const [s, r] = opts[Math.floor(rnd() * opts.length)];
    hands[p][s] &= ~(1 << r); trick.push({ p, s, r }); p = (p + 1) & 3;
  }
  const a = solve(hands.map(x => x.slice()), trump, leader, undefined, 0, trick);
  const b = bruteFrom(hands.map(x => x.slice()), trump, trick, p);
  n++; if (a !== b) { bad++; if (bad < 5) console.log('ÉCART', JSON.stringify({ hands, trump, leader, trick, a, b })); }
}
console.log(bad ? `${bad} écart(s) sur ${n}` : `${n} levées commencées : solveur = minimax brut.`);
