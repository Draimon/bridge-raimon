// Solveur « double mort » : nombre maximal de levées pour le camp Nord-Sud, chacun voyant toutes les cartes.
// Alpha-bêta booléen (« peut-on faire au moins k levées ? ») + table de transposition sur rangs relatifs
// + regroupement des cartes équivalentes. Utilisé hors ligne par build-deals.js.
//
// Sièges : 0 = N, 1 = E, 2 = S, 3 = O (sens du jeu). Couleurs : 0 = ♠, 1 = ♥, 2 = ♦, 3 = ♣ ; -1 = SA.
// Main : tableau de 4 masques (bit 0 = le 2, bit 12 = l'As).

function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

// `trick` (optionnel) : cartes déjà posées dans la levée en cours, [{ p, s, r }] dans l'ordre, `leader` = qui l'a entamée.
// `want` (optionnel) : { value } = valeur double mort connue de la position ; solve renvoie alors la meilleure carte
// { s, r } du joueur à qui c'est le tour (au lieu du nombre de levées).
function solve(handsIn, trump, leader, guess, maxNodes, trick, want) {
  let picked = null;
  let nodes = 0;
  const h = handsIn.map(hand => hand.slice());
  const table = [0, 0, 0, 0];                 // cartes posées dans la levée en cours, par couleur
  const TT = new Map();
  const cur = trick || [];
  const nextSeat = (leader + cur.length) & 3;
  const total = h[nextSeat].reduce((s, m) => s + popcount(m), 0);

  function key(lead) {
    let k = String(lead);
    for (let s = 0; s < 4; s++) {
      const u = h[0][s] | h[1][s] | h[2][s] | h[3][s];
      k += '|';
      for (let r = 12; r >= 0; r--) {
        const b = 1 << r;
        if (u & b) k += (h[0][s] & b) ? 0 : (h[1][s] & b) ? 1 : (h[2][s] & b) ? 2 : 3;
      }
    }
    return k;
  }

  // Cartes jouables pour `p`, une seule par groupe de cartes équivalentes.
  function moves(p, led) {
    const out = [];
    const suits = led >= 0 && h[p][led] ? [led] : [0, 1, 2, 3];
    for (const s of suits) {
      const mine = h[p][s];
      if (!mine) continue;
      const u = h[0][s] | h[1][s] | h[2][s] | h[3][s] | table[s];
      let prevMine = false;
      for (let r = 12; r >= 0; r--) {
        const b = 1 << r;
        if (!(u & b)) continue;
        if (mine & b) { if (!prevMine) out.push([s, r]); prevMine = true; } else prevMine = false;
      }
    }
    return out;
  }

  const beats = (s, r, ws, wr) => (s === ws ? r > wr : s === trump);

  function order(list, p, led, ws, wr, winner) {
    if (led < 0) {
      // Entame : d'abord les cartes maîtresses, puis les petites.
      return list.sort((a, b) => b[1] - a[1]);
    }
    const partnerWins = winner >= 0 && (winner & 1) === (p & 1);
    return list.sort((a, b) => {
      const wa = beats(a[0], a[1], ws, wr), wb = beats(b[0], b[1], ws, wr);
      if (!partnerWins && wa !== wb) return wa ? -1 : 1;
      if (a[0] === trump && b[0] !== trump) return 1;
      if (b[0] === trump && a[0] !== trump) return -1;
      return a[1] - b[1];
    });
  }

  function trickStart(lead, ns, left, target) {
    if (ns >= target) return true;
    if (ns + left < target) return false;
    const k = key(lead);
    const need = target - ns;
    let e = TT.get(k);
    if (e) { if (e.lb >= need) return true; if (e.ub < need) return false; }
    const res = play(0, lead, -1, -1, -1, -1, lead, ns, left, target);
    if (!e) { if (TT.size > 1.5e7) TT.clear(); e = { lb: 0, ub: left }; TT.set(k, e); }
    if (res) e.lb = Math.max(e.lb, need); else e.ub = Math.min(e.ub, need - 1);
    return res;
  }

  function play(pos, p, led, ws, wr, winner, lead, ns, left, target, top) {
    if (maxNodes && ++nodes > maxNodes) throw new Error('budget');
    if (pos === 4) {
      const won = (winner & 1) === 0 ? 1 : 0;
      return trickStart(winner, ns + won, left - 1, target);
    }
    const max = (p & 1) === 0;
    const list = order(moves(p, led), p, led, ws, wr, winner);
    for (const [s, r] of list) {
      const b = 1 << r;
      h[p][s] &= ~b; table[s] |= b;
      let nws = ws, nwr = wr, nw = winner;
      if (pos === 0 || beats(s, r, ws, wr)) { nws = s; nwr = r; nw = p; }
      const res = play(pos + 1, (p + 1) & 3, pos === 0 ? s : led, nws, nwr, nw, lead, ns, left, target);
      h[p][s] |= b; table[s] &= ~b;
      if (pos === 3) { /* rien */ }
      if (max && res) { if (top) picked = { s, r }; return true; }
      if (!max && !res) { if (top) picked = { s, r }; return false; }
    }
    return !max;
  }

  // Nombre exact de levées : on part de l'estimation (le contrat) et on avance d'une levée à la fois.
  function root(target, top) {
    if (!cur.length) return top ? play(0, leader, -1, -1, -1, -1, leader, 0, total, target, true) : trickStart(leader, 0, total, target);
    let ws = cur[0].s, wr = cur[0].r, winner = cur[0].p;
    cur.forEach(c => { table[c.s] |= 1 << c.r; });
    cur.slice(1).forEach(c => { if (beats(c.s, c.r, ws, wr)) { ws = c.s; wr = c.r; winner = c.p; } });
    try { return play(cur.length, nextSeat, cur[0].s, ws, wr, winner, leader, 0, total, target, top); }
    finally { cur.forEach(c => { table[c.s] &= ~(1 << c.r); }); }
  }
  if (want) {
    const v = want.value, isMax = (nextSeat & 1) === 0;
    const any = () => { const m = moves(nextSeat, cur.length ? cur[0].s : -1); return { s: m[0][0], r: m[0][1] }; };
    if (isMax) { if (v <= 0) return any(); root(v, true); }
    else { if (v >= total) return any(); root(v + 1, true); }
    return picked || any();
  }
  let g = Math.min(total, Math.max(0, guess === undefined ? Math.ceil(total / 2) : guess));
  if (root(g)) { while (g < total && root(g + 1)) g++; return g; }
  while (g > 0 && !root(g)) g--;
  return g;
}

// Minimax brut, pour vérifier le solveur sur de petites fins de donne.
function brute(handsIn, trump, leader) {
  const h = handsIn.map(x => x.slice());
  function rec(pos, p, led, ws, wr, winner) {
    if (pos === 4) {
      const won = (winner & 1) === 0 ? 1 : 0;
      if (h[0].every(m => !m)) return won;
      return won + rec(0, winner, -1, -1, -1, -1);
    }
    const max = (p & 1) === 0;
    let best = max ? -1 : 99;
    const suits = led >= 0 && h[p][led] ? [led] : [0, 1, 2, 3];
    for (const s of suits) for (let r = 0; r < 13; r++) {
      const b = 1 << r;
      if (!(h[p][s] & b)) continue;
      h[p][s] &= ~b;
      let nws = ws, nwr = wr, nw = winner;
      if (pos === 0 || (s === ws ? r > wr : s === trump)) { nws = s; nwr = r; nw = p; }
      const v = rec(pos + 1, (p + 1) & 3, pos === 0 ? s : led, nws, nwr, nw);
      h[p][s] |= b;
      best = max ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  return rec(0, leader, -1, -1, -1, -1);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { solve, brute };
else window.RaimonDDS = { solve };

// Auto-test : `node tools/dds.js`
if (typeof require !== 'undefined' && require.main === module) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let bad = 0;
  for (let t = 0; t < 300; t++) {
    const n = 1 + (t % 4);                     // 1 à 4 cartes par main
    const deck = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push([s, r]);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const hands = [0, 1, 2, 3].map(p => { const m = [0, 0, 0, 0]; deck.slice(p * n, p * n + n).forEach(([s, r]) => { m[s] |= 1 << r; }); return m; });
    const trump = Math.floor(rnd() * 5) - 1, leader = Math.floor(rnd() * 4);
    const a = solve(hands, trump, leader), b = brute(hands, trump, leader);
    if (a !== b) { bad++; console.log('ÉCART', JSON.stringify({ hands, trump, leader, a, b })); }
  }
  console.log(bad ? `${bad} écart(s) !` : '300 fins de donne : solveur = minimax brut.');
}
