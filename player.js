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
  // la plus basse carte équivalente à c dans ma main (les cartes déjà jouées entre deux comptent comme touchantes)
  function seqLow(st, s, c, extraGone) {
    const mine = new Set(st.hands[st.me][s]);
    const gone = new Set(st.played.filter(x => x.s === s).map(x => x.r).concat(st.trick.filter(x => x.s === s).map(x => x.r), extraGone || []));
    let r = c.r;
    for (let k = c.r - 1; k >= 0; k--) { if (mine.has(k)) r = k; else if (!gone.has(k)) break; }
    return { s, r };
  }
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

  // ───── Simulation (« Monte-Carlo ») avec le solveur DDS en WebAssembly (vendor/bridge-dds) : on imagine
  // plusieurs répartitions des cartes cachées compatibles avec ce qu'on sait, chacune est résolue en double mort,
  // et on joue la carte qui fait le plus de levées en moyenne. Utilisé dès que le solveur est chargé.
  const RCH2 = 'AKQJT98765432';
  const ddsw = () => (typeof root !== 'undefined' && root && root.RaimonDDSW) || (typeof globalThis !== 'undefined' && globalThis.RaimonDDSW) || null;
  function sampleHidden(st) {
    const hidden = SEATS.filter(s => s !== st.me && !(st.visible || []).includes(s));
    const need = {}; hidden.forEach(s => { need[s] = st.counts[s]; });
    const pool = outstanding(st);
    if (pool.length !== hidden.reduce((a, s) => a + need[s], 0)) return null;
    let last = null;
    for (let tries = 0; tries < 60; tries++) {
      const deck = pool.slice(); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      const H = {}; hidden.forEach(s => { H[s] = [[], [], [], []]; });
      let ok = true;
      for (const c of deck) {
        const cand = hidden.filter(s => H[s].reduce((a, x) => a + x.length, 0) < need[s] && !(st.voids[s] || []).includes(c.s));
        if (!cand.length) { ok = false; break; }
        H[cand[Math.floor(Math.random() * cand.length)]][c.s].push(c.r);
      }
      if (ok && (!st.accept || st.accept(H))) return H;
      if (ok) last = H;
    }
    return last;
  }
  const hcpOf = h => h.reduce((a, rs) => a + rs.reduce((b, r) => b + (r >= 9 ? r - 8 : 0), 0), 0);
  function auctionLimits(st) {
    if (!st.bids || !st.dealer) return null;
    const lim = { N: [0, 37], E: [0, 37], S: [0, 37], O: [0, 37] };
    const cut = (s, lo, hi) => { lim[s][0] = Math.max(lim[s][0], lo); lim[s][1] = Math.min(lim[s][1], hi); };
    let opened = false; const acted = {};
    st.bids.forEach((b, i) => {
      const seat = SEATS[(SEATS.indexOf(st.dealer) + i) % 4];
      if (!opened) {
        if (b === 'P') { if (!acted[seat]) cut(seat, 0, 11); }
        else {
          opened = true;
          if (b === '1SA') cut(seat, 15, 17); else if (b === '2SA') cut(seat, 20, 21);
          else if (/^2[♥♠♦]$/.test(b)) cut(seat, 5, 11); else if (/^[34]/.test(b)) cut(seat, 4, 11);
          else if (b === '2♣') cut(seat, 20, 37); else if (b[0] === '1') cut(seat, 11, 21);
        }
      }
      acted[seat] = true;
    });
    // la ligne du déclarant : assez de points pour son contrat
    const last = [...st.bids].reverse().find(b => /^[1-7]/.test(b)); const lvl = last ? +last[0] : 0, nt = last && last.slice(1) === 'SA';
    const minLine = lvl >= 7 ? 32 : lvl === 6 ? 29 : (lvl === 5 || lvl === 4 || (lvl === 3 && nt)) ? 22 : 0;
    const maxLine = lvl <= 2 ? 27 : 40;
    return { lim, minLine, maxLine };
  }
  function makeAccept(st) {
    const A = auctionLimits(st); if (!A) return null;
    const dummy = partner(st.decl);
    return H => {
      const hc = s => hcpOf(H[s] || st.hands[s]);
      for (const s of Object.keys(H)) { const v = hc(s); if (v < A.lim[s][0] || v > A.lim[s][1]) return false; }
      if (H[st.decl] || H[dummy]) { const line = hc(st.decl) + hc(dummy) + 0; if (line < A.minLine || line > A.maxLine) return false; }
      return true;
    };
  }
  function mcChoice(st, L, nSamples) {
    if (st.accept === undefined) st.accept = st.useAuction && st.played.length < 8 ? makeAccept(st) : null;   // contraintes d'enchères : testées sans gain (0,78 contre 0,71), désactivées par défaut
    const D = ddsw(); if (!D) return null;
    const leader = st.trick.length ? st.trick[0].seat : st.me;
    const sum = new Map(); let n = 0;
    for (let k = 0; k < nSamples; k++) {
      const H = sampleHidden(st); if (!H) break;
      const full = s => (H[s] || st.hands[s]);
      const pbn = 'N:' + SEATS.map(s => full(s).map(rs => rs.slice().sort((a, b) => b - a).map(r => RCH2[12 - r]).join('')).join('.')).join(' ');
      const deal = { trump: st.trump === null ? 4 : st.trump, first: SEATS.indexOf(leader),
        currentTrickSuit: [0, 1, 2].map(i => (st.trick[i] ? st.trick[i].s : 0)), currentTrickRank: [0, 1, 2].map(i => (st.trick[i] ? st.trick[i].r + 2 : 0)), remainCards: pbn };
      let ft; try { ft = D.SolveBoardPBN(deal, -1, 3, 1); } catch (e) { return null; }
      for (let i = 0; i < ft.cards; i++) {
        const sc = ft.score[i], su = ft.suit[i];
        const add = r => { const key = su * 13 + r; sum.set(key, (sum.get(key) || 0) + sc); };
        add(ft.rank[i] - 2);
        for (let r = 2; r <= 14; r++) if (ft.equals[i] & (1 << r)) add(r - 2);
      }
      n++;
    }
    if (!n) return null;
    let best = null, bestV = -1;
    for (const c of L) { const v = (sum.get(c.s * 13 + c.r) || 0) / n; if (v > bestV + 1e-9 || (Math.abs(v - bestV) < 1e-9 && best && c.r < best.r)) { bestV = v; best = c; } }
    return best;
  }

  // ───── Règles de jeu
  // Couleurs nommées aux enchères par chaque siège (enchères naturelles à la couleur, hors SA)
  function namedBy(st) {
    const out = { N: [], E: [], S: [], O: [] };
    if (!st.bids || !st.dealer) { if (st.partnerSuit !== null && st.partnerSuit !== undefined) out[partner(st.me)].push(st.partnerSuit); return out; }
    const SU = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
    st.bids.forEach((bd, i) => { const m = /^[1-7](♠|♥|♦|♣)$/.exec(bd); if (!m) return; const seat = SEATS[(SEATS.indexOf(st.dealer) + i) % 4]; if (!out[seat].includes(SU[m[1]])) out[seat].push(SU[m[1]]); });
    return out;
  }
  // Entame : chaque couleur reçoit des points (couleur du partenaire, sa propre couleur annoncée, séquence d'honneurs,
  // longueur à SA, pas sous un As à l'atout, pas dans une couleur des adversaires…), puis la bonne carte dans la couleur choisie.
  // Réglée sur le banc tools/leadlab.js (valeur double mort de chaque entame sur 1000 donnes FFB).
  const LW = Object.assign({ partner: 6, own: 3, opp: -4, seq: 3, seq3: 1, underAce: -3, bareHon: -2, single: 2, doubleton: 0.5, nothing: 1, ntLen: 1.5, ntHon: 0.5 }, {});
  function seqInfo(rs) {                                             // rs trié décroissant
    if (rs.length >= 2 && rs[0] >= 9 && rs[0] - rs[1] === 1) return { top: rs[0], three: rs.length >= 3 && rs[1] - rs[2] === 1 };
    if (rs.length >= 3 && rs[0] >= 9 && rs[0] - rs[1] === 2 && rs[1] - rs[2] === 1) return { top: rs[1], three: false, interior: true }; // R V 10 : le V
    return null;
  }
  function openingLead(st, L) {
    const h = st.hands[st.me], trump = st.trump, me = st.me;
    const nb = namedBy(st), mate = partner(me), decl = st.decl, dummy = partner(decl);
    const opp = new Set([...(nb[decl] || []), ...(nb[dummy] || [])]);
    const myT = trump === null ? 0 : h[trump].length;
    let best = null, bestScore = -Infinity;
    for (let s = 0; s < 4; s++) {
      const rs = h[s].slice().sort((x, y) => y - x); if (!rs.length) continue;
      if (s === trump && [0, 1, 2, 3].some(x => x !== trump && h[x].length)) continue;
      let sc = 0; const len = rs.length, sq = seqInfo(rs), hasA = rs[0] === 12, hon = rs.filter(r => r >= 9).length;
      if (nb[mate].includes(s)) sc += LW.partner;
      if (nb[me].includes(s) && len >= 5) sc += LW.own;
      if (opp.has(s) && !nb[mate].includes(s)) sc += LW.opp;
      if (sq) sc += LW.seq + (sq.three ? LW.seq3 : 0);
      if (trump !== null) {
        if (hasA && rs[1] !== 11) sc += LW.underAce;
        if (!sq && !hasA && rs[0] >= 10 && len <= 3) sc += LW.bareHon;
        if (len === 1 && rs[0] < 12 && myT >= 1 && myT <= 3) sc += LW.single;
        if (len === 2 && !sq && rs[0] < 10) sc += LW.doubleton;
        if (len >= 3 && rs[0] < 9) sc += LW.nothing;
      } else {
        if (len >= 4) sc += LW.ntLen * (len - 3);
        sc += LW.ntHon * hon;
      }
      sc += len * 0.01;                                                // à égalité : la plus longue
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    if (best === null) return low(L);
    const rs = h[best].slice().sort((x, y) => y - x), sq = seqInfo(rs);
    if (sq) return { s: best, r: sq.top };
    if (trump !== null && rs[0] === 12) return { s: best, r: 12 };     // l'As (on n'entame pas sous un As à l'atout)
    if (rs.length === 1) return { s: best, r: rs[0] };
    if (rs.length === 2) return { s: best, r: rs[0] };                   // doubleton : le haut
    if (rs[0] < 9) return { s: best, r: rs.length >= 4 && trump === null ? rs[3] : rs[0] }; // sans honneur : le haut (4e à SA)
    return { s: best, r: rs.length >= 4 ? rs[3] : rs[rs.length - 1] };   // avec un honneur : 4e meilleure, ou la petite de 3
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
      if (pos === 2 && !st.declSide && winners.length) {               // 3e main en défense : « 3e main forte »
        const fourth = next(me), dummy = partner(st.decl);
        // le partenaire tient la levée avec un honneur (10 ou mieux) et le mort a déjà fourni : on ne le surprend pas
        if (mateWins && w.r >= 8 && fourth !== dummy) return low(L);
        if ((st.visible || []).includes(fourth)) {                     // le mort joue après moi : battre juste ses cartes
          const dm = st.hands[fourth][led] || [];
          const need = Math.max(w.r, ...(dm.length ? dm : [-1]));
          const over = winners.filter(c => c.r > need);
          return over.length ? low(over) : low(L);
        }
        // déclarant après moi (caché) : la plus basse de ma séquence de tête ; les honneurs restés au mort (qui a déjà fourni) ne le gênent pas
        const atDummy = (st.visible || []).includes(dummy) && trick.some(x => x.seat === dummy) ? st.hands[dummy][led] : [];
        return seqLow(st, led, high(winners), atDummy);
      }
      if (winners.length) return low(winners);                          // 4e : gagner au plus juste
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
    return defLead(st, L);
  }
  // Contre-jeu en main (défense) : chaque couleur reçoit des points, puis la bonne carte.
  // Réglé sur le banc tools/poslab.js (positions de défense de 1000 donnes FFB, valeur double mort de chaque carte).
  const DW = Object.assign({ mate: 4, mateNT: 1, mine: 2, cash: 3, dummyLong: -5, upTenace: -3, through: -1, ruffSluff: -10, trumpVsRuff: 1, trumpElse: -2, awayHon: -2, safe: 1 }, {});
  function defLead(st, L) {
    const me = st.me, trump = st.trump, h = st.hands[me];
    const dummy = partner(st.decl), dh = (st.visible || []).includes(dummy) ? st.hands[dummy] : null;
    const dummyLHO = next(me) === dummy;                                 // le mort joue juste après moi
    const voidD = st.voids[st.decl] || [], voidM = st.voids[dummy] || [];
    const trumpsOut = trump !== null && outstanding(st).some(c => c.s === trump) || (trump !== null && dh && dh[trump].length);
    let best = null, bestSc = -Infinity;
    for (let s2 = 0; s2 < 4; s2++) {
      const rs = h[s2].slice().sort((x, y) => y - x); if (!rs.length) continue;
      let sc = 0; const len = rs.length, tl = topLeft(st, s2);
      if (st.partnerLed === s2 && s2 !== trump) sc += DW.mate + (trump === null ? DW.mateNT : 0);
      if (st.myLed === s2 && s2 !== trump) sc += DW.mine;
      if (rs[0] === tl && s2 !== trump) sc += DW.cash;
      if (dh) {
        const d = dh[s2].slice().sort((x, y) => y - x);
        if (d.length >= 4 && d[0] >= 10 && s2 !== trump) sc += DW.dummyLong;
        const tenace = d.length >= 2 && d[0] >= 10 && d[0] - d[1] === 2;   // AD, RV… au mort
        if (tenace) sc += dummyLHO ? DW.through : DW.upTenace;
        if (s2 === trump && trump !== null) sc += ([0, 1, 2, 3].some(x => x !== trump && dh[x].length <= 1 && h[x].length) ? DW.trumpVsRuff : DW.trumpElse);
      } else if (s2 === trump) sc += DW.trumpElse;
      if (trump !== null && s2 !== trump && trumpsOut && voidD.includes(s2) && (!dh ? voidM.includes(s2) : !dh[s2].length)) sc += DW.ruffSluff;
      if (rs[0] >= 9 && rs[0] !== tl && !(len >= 2 && rs[0] - rs[1] === 1) && len <= 3) sc += DW.awayHon;
      if (rs[0] < 9 && len >= 2) sc += DW.safe;
      sc += len * 0.01;
      if (sc > bestSc) { bestSc = sc; best = s2; }
    }
    if (best === null) return low(L);
    const rs = h[best].slice().sort((x, y) => y - x), tl = topLeft(st, best);
    if (rs[0] === tl) return { s: best, r: rs[0] };                          // carte maîtresse : on l'encaisse
    if (rs.length >= 2 && rs[0] >= 8 && rs[0] - rs[1] === 1) return { s: best, r: rs[0] };   // tête de séquence
    if (rs.length === 2) return { s: best, r: rs[0] };
    if (rs[0] < 9) return { s: best, r: rs[0] };                               // sans honneur : le haut
    return { s: best, r: rs[rs.length - 1] };                                  // petite d'un honneur
  }
  // Point d'entrée. st = { me, hands (connues : la mienne, et le mort si étalé), visible: [mort], trick: [{seat,s,r}],
  // played: [{seat,s,r}] (levées terminées), trump (0-3 ou null), decl, counts {seat: nb de cartes}, voids {seat: [couleurs]},
  // partnerSuit (couleur nommée par le partenaire aux enchères), partnerLed, myLed }
  function choose(st, budgetMs) {
    const L = legal(st.hands[st.me], st.trick);
    if (L.length === 1) return L[0];
    st.declSide = sideOf(st.me) === sideOf(st.decl);
    const left = st.counts[st.me];
    // défense : simulation DDS (WebAssembly) à chaque carte si le solveur est là (sauf l'entame, sauf réglage contraire)
    if (ddsw() && (st.declSide ? st.mcDecl !== false : (st.played.length || st.trick.length || st.mcLead))) { const c = mcChoice(st, L, st.mcSamples || 24); if (c) return c; }
    const ddFrom = st.declSide ? 7 : (st.ddFrom || 7);
    if (left <= ddFrom) { const c = ddChoice(st, L, budgetMs === undefined ? 900 : budgetMs); if (c) return c; }
    if (!st.trick.length) return st.played.length === 0 && !st.declSide ? openingLead(st, L) : lead(st, L);
    return follow(st, L);
  }

  const api = { choose, winnerOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RaimonPlay = api;
})(typeof window !== 'undefined' ? window : this);
