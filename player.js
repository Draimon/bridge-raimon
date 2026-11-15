// Système Raimon — robot de jeu de la carte du salon. Il ne voit que ce qu'un joueur voit : sa main, le mort
// (une fois étalé), les cartes jouées. Début de donne : règles classiques (entame, 2e bas, 3e haut, impasse,
// purge des atouts). Fin de donne : il imagine plusieurs répartitions des cartes cachées compatibles avec ce qui
// s'est passé, calcule chacune en double mort et joue la carte qui gagne le plus souvent.
// Cartes : { s, r } avec s = 0 ♠ 1 ♥ 2 ♦ 3 ♣ et r = 0 (le 2) … 12 (l'As). Sièges 'N','E','S','O'.
(function (root) {
  'use strict';
  const SEATS = ['N', 'E', 'S', 'O'];
  const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4];
  const partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
  const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
  const dds = typeof module !== 'undefined' && module.exports ? require('./dds.js') : root.RaimonDDS;

  function winnerOf(trick, trump) {
    return trick.reduce((w, x) => {
      const wt = w.s === trump, xt = x.s === trump;
      if (xt && !wt) return x; if (wt && !xt) return w;
      if (x.s === w.s && x.r > w.r) return x; return w;
    });
  }
  // Cartes encore dehors (ni dans ma main, ni au mort visible, ni jouées)
  function outstanding(st) {
    const seen = new Set();
    const add = c => seen.add(c.s * 13 + c.r);
    st.played.forEach(add); st.trick.forEach(add);
    st.hands[st.me].forEach((rs, s) => rs.forEach(r => add({ s, r })));
    if (st.visible) st.visible.forEach(v => st.hands[v].forEach((rs, s) => rs.forEach(r => add({ s, r }))));
    const out = [];
    for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) if (!seen.has(s * 13 + r)) out.push({ s, r });
    return out;
  }
  // La plus haute carte encore en jeu dans une couleur (toutes mains confondues)
  function topLeft(st, s) {
    const gone = new Set(st.played.filter(c => c.s === s).map(c => c.r).concat(st.trick.filter(c => c.s === s).map(c => c.r)));
    for (let r = 12; r >= 0; r--) if (!gone.has(r)) return r;
    return -1;
  }
  const legal = (hand, trick) => {
    const all = []; hand.forEach((rs, s) => rs.forEach(r => all.push({ s, r })));
    if (!trick.length) return all;
    const led = trick[0].s;
    return hand[led].length ? all.filter(c => c.s === led) : all;
  };
  const low = arr => arr.reduce((a, b) => (b.r < a.r ? b : a));
  const high = arr => arr.reduce((a, b) => (b.r > a.r ? b : a));

  // ───── Fin de donne : échantillons + double mort
  function ddChoice(st, L, budgetMs) {
    const t0 = Date.now();
    const hidden = SEATS.filter(s => s !== st.me && !(st.visible || []).includes(s));
    const need = {}; hidden.forEach(s => { need[s] = st.counts[s]; });
    const pool = outstanding(st);
    if (pool.length !== hidden.reduce((a, s) => a + need[s], 0)) return null;
    const votes = new Map(); let samples = 0;
    const leader = st.trick.length ? st.trick[0].seat : st.me;
    const curTrick = st.trick.map(c => ({ p: SEATS.indexOf(c.seat), s: c.s, r: c.r }));
    for (let k = 0; k < 40 && Date.now() - t0 < budgetMs && samples < 12; k++) {
      // tirage au hasard respectant les chicanes déjà montrées
      const deck = pool.slice().sort(() => Math.random() - 0.5);
      const H = {}; hidden.forEach(s => { H[s] = [[], [], [], []]; });
      let ok = true;
      for (const c of deck) {
        const cand = hidden.filter(s => H[s].reduce((a, x) => a + x.length, 0) < need[s] && !(st.voids[s] || []).includes(c.s));
        if (!cand.length) { ok = false; break; }
        H[cand[Math.floor(Math.random() * cand.length)]][c.s].push(c.r);
      }
      if (!ok) continue;
      const full = s => (H[s] || st.hands[s]);
      const masks = SEATS.map(s => full(s).map(rs => rs.reduce((m, r) => m | (1 << r), 0)));
      try {
        const v = dds.solve(masks, st.trump === null ? -1 : st.trump, SEATS.indexOf(leader), undefined, 2e5, curTrick);
        const c = dds.solve(masks, st.trump === null ? -1 : st.trump, SEATS.indexOf(leader), undefined, 2e5, curTrick, { value: v });
        if (!c) continue;
        // une carte « équivalente » : on vote pour la carte jouée, ramenée à la plus basse de sa séquence dans ma main
        const key = c.s * 13 + c.r;
        if (!L.some(x => x.s === c.s && x.r === c.r)) continue;
        votes.set(key, (votes.get(key) || 0) + 1); samples++;
      } catch (e) { return null; }                                      // trop de calcul : on garde les règles
    }
    if (!samples) return null;
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { s: Math.floor(best / 13), r: best % 13 };
  }

  // ───── Règles de jeu
  function openingLead(st, L) {
    const h = st.hands[st.me], trump = st.trump;
    // couleur nommée par le partenaire
    const ps = st.partnerSuit;
    if (ps !== null && ps !== undefined && h[ps].length) { const rs = h[ps].slice().sort((a, b) => b - a); return { s: ps, r: rs.length === 2 || rs[0] - rs[1] === 1 ? rs[0] : rs.length >= 3 && rs[0] >= 9 ? rs[rs.length - 1] : rs[0] }; }
    const suits = [0, 1, 2, 3].filter(s => h[s].length && s !== trump);
    const seqTop = s => { const rs = h[s].slice().sort((a, b) => b - a); return rs.length >= 2 && rs[0] >= 9 && rs[0] - rs[1] === 1 && (rs.length < 3 || rs[1] - rs[2] <= 2 || rs[0] === 12) ? rs[0] : null; };
    // séquence d'honneurs (AR, RD, DV, V10…)
    const seq = suits.filter(s => seqTop(s) !== null).sort((a, b) => h[b].length - h[a].length)[0];
    if (seq !== undefined) return { s: seq, r: seqTop(seq) };
    if (trump === null) {                                              // SA : 4e meilleure de la plus longue
      const s = suits.sort((a, b) => h[b].length - h[a].length || b - a)[0];
      const rs = h[s].slice().sort((a, b) => b - a);
      return { s, r: rs.length >= 4 ? rs[3] : rs[0] };
    }
    // à l'atout : singleton si on a des atouts, sinon couleur sans As, en haut d'une courte / 4e meilleure d'une longue
    const single = suits.find(s => h[s].length === 1 && h[s][0] < 12 && h[trump].length >= 2 && h[trump].length <= 3);
    if (single !== undefined) return { s: single, r: h[single][0] };
    const noAce = suits.filter(s => !h[s].includes(12));
    const pick = (noAce.length ? noAce : suits).sort((a, b) => {
      const hon = s => h[s].filter(r => r >= 10).length; return hon(a) - hon(b) || h[b].length - h[a].length;
    })[0];
    if (pick === undefined) return low(L);
    const rs = h[pick].slice().sort((a, b) => b - a);
    return { s: pick, r: rs.length <= 3 && rs[0] < 10 ? rs[0] : rs.length >= 4 ? rs[3] : rs[rs.length - 1] };
  }
  function follow(st, L) {
    const trick = st.trick, trump = st.trump, me = st.me, pos = trick.length;
    const w = winnerOf(trick, trump);
    const mateWins = sideOf(w.seat) === sideOf(me);
    const beats = c => winnerOf([...trick, { ...c, seat: me }], trump).seat === me;
    const winners = L.filter(beats);
    const led = trick[0].s, followSuit = L.every(c => c.s === led);
    if (followSuit) {
      if (pos === 1) {                                                 // 2e : bas, sauf couvrir un honneur
        const top = trick[0];
        if (top.r >= 9 && top.r <= 11) { const cover = L.filter(c => c.r > top.r && c.r <= 12).sort((a, b) => a.r - b.r)[0]; if (cover && !st.declSide) return cover; }
        if (st.declSide && winners.length && topLeft(st, led) === Math.max(...winners.map(c => c.r)) && st.wantCash) return low(winners);
        return low(L);
      }
      if (mateWins && (pos === 3 || w.r >= topLeft(st, led))) return low(L);
      if (winners.length) return low(winners);                          // 3e/4e : gagner au plus juste
      return low(L);
    }
    // défausse ou coupe
    if (!mateWins && trump !== null && winners.length) return low(winners);
    const nonTrump = L.filter(c => c.s !== trump);
    const pool = nonTrump.length ? nonTrump : L;
    // défausser dans la couleur la plus faible (sans honneur), la plus longue
    const bySuit = [0, 1, 2, 3].map(s => pool.filter(c => c.s === s)).filter(x => x.length);
    bySuit.sort((a, b) => Math.max(...a.map(c => c.r)) - Math.max(...b.map(c => c.r)) || b.length - a.length);
    return low(bySuit[0]);
  }
  function lead(st, L) {
    const me = st.me, trump = st.trump, h = st.hands[me];
    if (st.declSide) {
      const mate = partner(me), mh = st.hands[mate];
      // atouts dehors : on purge avec un atout maître
      if (trump !== null) {
        const outT = outstanding(st).filter(c => c.s === trump).length;
        const ourT = h[trump].length + mh[trump].length;
        if (outT > 0 && ourT > outT) {
          const t = L.filter(c => c.s === trump);
          if (t.length && Math.max(...t.map(c => c.r)) === topLeft(st, trump)) return high(t);
          if (t.length && mh[trump].includes(topLeft(st, trump))) return low(t);
        }
      }
      // couleur maîtresse : on encaisse (côté court d'abord)
      for (const s of [0, 1, 2, 3].filter(x => x !== trump)) {
        const tl = topLeft(st, s);
        if (h[s].includes(tl) && (h[s].length <= mh[s].length || !mh[s].length)) return { s, r: tl };
      }
      // impasse : jouer petit vers l'honneur fourchetté (AD, RV) du partenaire
      for (const s of [0, 1, 2, 3].filter(x => x !== trump)) {
        if (h[s].length && mh[s].length) {
          const m = mh[s].slice().sort((a, b) => b - a);
          if (m.length >= 2 && m[0] === topLeft(st, s) && m[1] === m[0] - 2) return { s, r: Math.min(...h[s]) };
          if (m[0] === topLeft(st, s) - 1 && m.length >= 2) return { s, r: Math.min(...h[s]) };
        }
      }
      // sinon : la plus longue couleur, petite carte
      const s = [0, 1, 2, 3].filter(x => h[x].length && x !== trump).sort((a, b) => (h[b].length + mh[b].length) - (h[a].length + mh[a].length))[0];
      return s === undefined ? low(L) : { s, r: Math.min(...h[s]) };
    }
    // défense : rejouer la couleur d'entame du partenaire, sinon continuer sa couleur, sinon sortir sans danger
    const ps = st.partnerLed;
    if (ps !== null && ps !== undefined && h[ps].length && ps !== trump) { const rs = h[ps].slice().sort((a, b) => b - a); return { s: ps, r: rs[0] === topLeft(st, ps) ? rs[0] : rs.length === 2 ? rs[0] : rs[rs.length - 1] }; }
    for (const s of [0, 1, 2, 3].filter(x => x !== trump && h[x].length)) if (h[s].includes(topLeft(st, s)) && st.myLed === s) return { s, r: topLeft(st, s) };
    const safe = [0, 1, 2, 3].filter(x => h[x].length && x !== trump && !h[x].some(r => r >= 10));
    if (safe.length) { const s = safe.sort((a, b) => h[b].length - h[a].length)[0]; return { s, r: Math.max(...h[s]) }; }
    return low(L);
  }

  // Point d'entrée. st = { me, hands (connues : la mienne, et le mort si étalé), visible: [mort], trick: [{seat,s,r}],
  // played: [{seat,s,r}] (levées terminées), trump (0-3 ou null), decl, counts {seat: nb de cartes}, voids {seat: [couleurs]},
  // partnerSuit (couleur nommée par le partenaire aux enchères), partnerLed, myLed }
  function choose(st, budgetMs) {
    const L = legal(st.hands[st.me], st.trick);
    if (L.length === 1) return L[0];
    st.declSide = sideOf(st.me) === sideOf(st.decl);
    const left = st.counts[st.me];
    if (left <= 7) { const c = ddChoice(st, L, budgetMs === undefined ? 900 : budgetMs); if (c) return c; }
    if (!st.trick.length) return st.played.length === 0 && !st.declSide ? openingLead(st, L) : lead(st, L);
    return follow(st, L);
  }

  const api = { choose, winnerOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RaimonPlay = api;
})(typeof window !== 'undefined' ? window : this);
