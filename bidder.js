// Système Raimon — robot d'enchères du salon : choisit l'enchère d'UN joueur, à n'importe quel moment d'une séquence
// (il ne voit que sa main et les enchères). Système « SEF standard » : majeure 5e, 1SA 15-17, 2SA 20-21,
// 2♣ fort indéterminé, 2♦ forcing de manche, deux faibles en majeure, barrages à 3, Stayman, Texas, Blackwood 41-30,
// interventions, contre d'appel, contre Spoutnik (négatif), Landy sur 1SA.
// Renvoie { bid, expl, alert } : expl = explication montrée aux joueurs, alert = enchère conventionnelle.
// Utilisable dans le navigateur (window.RaimonBid) et dans Node (tests d'auto-jeu sur les donnes FFB).

(function (root) {
  'use strict';
  const HCP = { A: 4, K: 3, Q: 2, J: 1 };
  const SEATS = ['N', 'E', 'S', 'O'];
  const STRAINS = ['♣', '♦', '♥', '♠', 'SA'];
  const SI = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };            // couleur d'enchère → indice dans la main (♠ ♥ ♦ ♣)
  const SYM = ['♠', '♥', '♦', '♣'];
  const NAME = ['pique', 'cœur', 'carreau', 'trèfle'];
  const partnerOf = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
  const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
  const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
  const lvl = b => +b[0], str = b => b.slice(1);
  const isMajor = i => i === 0 || i === 1;

  function evalHand(h) {
    const parts = h.split('.').map(p => (p === '-' ? '' : p));
    const len = parts.map(p => p.length);
    const hcp = parts.join('').split('').reduce((s, c) => s + (HCP[c] || 0), 0);
    const sorted = len.slice().sort((a, b) => b - a);
    const bal = (sorted[3] >= 2 && sorted[2] >= 3) || sorted.join('') === '5332';
    const aces = parts.join('').split('').filter(c => c === 'A').length;
    return { parts, len, hcp, bal, aces, semibal: sorted[3] >= 2 && sorted[0] <= 6 };
  }
  // Points avec la longueur (sans fit) ; avec fit : courtes (chicane 5 / singleton 3 / doubleton 1) pour le soutien
  const lenPts = e => e.hcp + e.len.reduce((s, l) => s + Math.max(0, l - 4), 0);
  const supPts = (e, fit) => e.hcp + e.len.reduce((s, l, i) => s + (i === fit ? 0 : l === 0 ? 5 : l === 1 ? 3 : l === 2 ? 1 : 0), 0);
  const stopper = (e, i) => { const p = e.parts[i]; return p.includes('A') || (p.includes('K') && p.length >= 2) || (p.includes('Q') && p.length >= 3) || (p.includes('J') && p.length >= 4); };
  const keyCards = (e, t) => e.aces + (e.parts[t].includes('K') ? 1 : 0);
  const longest = (e, from) => (from || [0, 1, 2, 3]).slice().sort((a, b) => e.len[b] - e.len[a] || a - b)[0];

  // ───── Lecture de la séquence
  function context(bids, dealer, seat) {
    const hist = bids.map((b, i) => ({ b, seat: SEATS[(SEATS.indexOf(dealer) + i) % 4], i }));
    let last = -1, lastBid = null, lastBy = null, dbl = 0, lastAct = null, lastActBy = null;
    hist.forEach(x => {
      if (rank(x.b) >= 0) { last = rank(x.b); lastBid = x.b; lastBy = x.seat; dbl = 0; }
      else if (x.b === 'X') dbl = 1; else if (x.b === 'XX') dbl = 2;
      if (x.b !== 'P') { lastAct = x.b; lastActBy = x.seat; }
    });
    const opp = s => s && sideOf(s) !== sideOf(seat);
    const acts = hist.filter(x => x.b !== 'P');
    const p = partnerOf(seat);
    return {
      hist, acts, last, lastBid, lastBy, dbl, seat, partner: p, lastAct, lastActBy,
      canX: !!lastBid && dbl === 0 && opp(lastBy) && lastAct === lastBid,
      canXX: !!lastBid && dbl === 1 && lastAct === 'X' && opp(lastActBy),
      mine: hist.filter(x => x.seat === seat && x.b !== 'P'),
      his: hist.filter(x => x.seat === p && x.b !== 'P'),
      them: hist.filter(x => sideOf(x.seat) !== sideOf(seat) && x.b !== 'P'),
      opener: acts.length ? acts[0] : null,
      myPrevAll: hist.filter(x => x.seat === seat),
    };
  }

  // Ce que le partenaire a montré (approximatif) : points mini/maxi, longueurs mini par couleur, main régulière
  function partnerInfo(C) {
    const info = { min: 0, max: 37, len: [0, 0, 0, 0], bal: false, forcing: false, passedOut: false };
    const pHist = C.hist.filter(x => x.seat === C.partner);
    if (pHist.length && pHist[0].b === 'P' && !C.hist.slice(0, pHist[0].i).some(x => x.b !== 'P')) info.max = 11; // a passé d'entrée
    C.his.forEach((x, k) => {
      const b = x.b, before = C.hist.slice(0, x.i), anyBefore = before.some(y => y.b !== 'P');
      const ourBefore = before.filter(y => sideOf(y.seat) === sideOf(C.seat) && y.b !== 'P');
      const theirBefore = before.filter(y => sideOf(y.seat) !== sideOf(C.seat) && y.b !== 'P');
      if (b === 'X') {
        if (!ourBefore.length && theirBefore.length) { info.min = Math.max(info.min, 12); info.forcing = true; return; }
        // contre Spoutnik : nous avons ouvert, ils sont intervenus en couleur → majeure(s) 4e non nommée(s), 8H et plus
        const tb = theirBefore[theirBefore.length - 1];
        if (ourBefore.length === 1 && ourBefore[0].seat === C.seat && tb && rank(tb.b) >= 0 && str(tb.b) !== 'SA' && lvl(tb.b) <= 3) {
          info.min = Math.max(info.min, 8); info.forcing = true;
          [0, 1].filter(i => i !== SI[str(tb.b)] && str(ourBefore[0].b) !== SYM[i]).forEach(i => { info.len[i] = Math.max(info.len[i], 4); });
        }
        return;
      }
      if (b === 'XX' || rank(b) < 0) return;
      const s = str(b), L = lvl(b);
      // cue-bid (couleur naturelle de l'adversaire) : fit dans notre couleur, 11H et plus, forcing
      if (s !== 'SA' && theirBefore.some(y => rank(y.b) >= 0 && str(y.b) === s) && anyBefore) {
        const mySuit = C.mine.filter(y => y.i < x.i && rank(y.b) >= 0 && str(y.b) !== 'SA').pop();
        if (mySuit) info.len[SI[str(mySuit.b)]] = Math.max(info.len[SI[str(mySuit.b)]], 3);
        info.min = Math.max(info.min, 11); info.forcing = true; return;
      }
      // réponses aux ouvertures fortes
      const ourOpen = ourBefore.length === 1 && ourBefore[0].seat === C.seat ? ourBefore[0].b : null;
      if (k === 0 && ourOpen === '2♦') { if (b === '2♥') { info.max = 7; return; } info.min = Math.max(info.min, 8); }
      if (k === 0 && ourOpen === '2♣' && b === '2♦') return;
      if (k === 0 && (ourOpen === '1SA' || ourOpen === '2SA') && !theirBefore.length) {
        const n = ourOpen === '1SA' ? 2 : 3;
        if (b === sb(n, 3)) { info.min = Math.max(info.min, n === 2 ? 8 : 4); return; }                // Stayman
        if (b === sb(n, 2)) { info.len[1] = 5; return; } if (b === sb(n, 1)) { info.len[0] = 5; return; } // Texas
      }
      if (!anyBefore) {                                               // ouverture
        if (b === '1SA') Object.assign(info, { min: 15, max: 17, bal: true });
        else if (b === '2SA') Object.assign(info, { min: 20, max: 21, bal: true });
        else if (C.sys === 'raimon' && b === '2♣') { info.min = 24; info.forcing = true; }
        else if (C.sys === 'raimon' && (b === '2♦' || b === '2♥' || b === '2♠')) { info.min = 0; info.max = 23; }
        else if (b === '2♣') { info.min = 20; info.forcing = true; }
        else if (b === '2♦') { info.min = 24; info.forcing = true; }
        else if (L === 2) { Object.assign(info, { min: 6, max: 10 }); info.len[SI[s]] = 6; }
        else if (L >= 3) { Object.assign(info, { min: 5, max: 10 }); info.len[SI[s]] = 7; }
        else { info.min = 12; info.max = Math.min(info.max, 21); info.len[SI[s]] = s === '♣' ? 3 : s === '♦' ? 4 : 5; }
        return;
      }
      if (s === 'SA') {
        if (theirBefore.length && !ourBefore.length) Object.assign(info, { min: 16, max: 18, bal: true });
        else if (k === 0 && ourOpen && lvl(ourOpen) === 1) {                // 1re réponse à notre ouverture
          if (L === 1) { info.min = Math.max(info.min, 6); info.max = Math.min(info.max, 10); }
          else if (L === 2) { info.min = Math.max(info.min, 11); info.max = Math.min(info.max, 12); }
          else if (L === 3) info.min = Math.max(info.min, 13);
          info.bal = true;
        } else if (k === 1 && ourBefore[0] && ourBefore[0].seat === C.partner && L === 1) { info.max = Math.min(info.max, 14); info.bal = true; }
        else if (k === 1 && ourBefore[0] && ourBefore[0].seat === C.partner && L === 2) {
          const myResp = C.mine.find(y => y.i < x.i);
          if (myResp && lvl(myResp.b) === 1) info.min = Math.max(info.min, 18); else if (C.sys === 'raimon') { info.min = Math.max(info.min, 15); info.max = Math.min(info.max, 17); } else { info.min = Math.max(info.min, 12); info.max = Math.min(info.max, 14); }
          info.bal = true;
        }
        return;
      }
      const i = SI[s];
      if (!ourBefore.length && theirBefore.length) {
        const ch = (() => { for (let l = 1; l <= 7; l++) { const t = sb(l, i); if (rank(t) > Math.max(...theirBefore.map(y => rank(y.b)))) return l; } return L; })();
        if (L > ch) { info.min = 5; info.max = 10; info.len[i] = 6; info.preempt = true; return; }   // saut : barrage
        info.min = Math.max(info.min, 8); info.max = Math.min(info.max, 17); info.len[i] = Math.max(info.len[i], 5); return;
      }
      // couleur déjà nommée par moi : soutien
      if (C.mine.some(y => y.i < x.i && rank(y.b) >= 0 && str(y.b) === s)) { info.len[i] = Math.max(info.len[i], s === '♣' || s === '♦' ? 4 : 3); info.min = Math.max(info.min, 6); return; }
      info.len[i] = Math.max(info.len[i], k === 0 ? 4 : info.len[i] ? 5 : 4);
      if (k === 0 && L === 1) { info.min = Math.max(info.min, 6); info.forcing = true; }
      if (k === 0 && L === 2 && !theirBefore.length) { info.min = Math.max(info.min, 11); info.forcing = true; }
      if (k > 0 && pHist.some(y => y.i < x.i && rank(y.b) >= 0 && str(y.b) === s)) info.len[i] = Math.max(info.len[i], 6);
    });
    // forcing seulement si c'est sa DERNIÈRE enchère qui l'est (et qu'aucun adversaire n'a parlé depuis)
    const lastP = C.his[C.his.length - 1];
    if (lastP) {
      const after = C.hist.slice(lastP.i + 1);
      const fresh = lastP === C.his[0] || !C.mine.length || C.mine[C.mine.length - 1].i < lastP.i;
      info.forcing = info.forcing && fresh && !after.some(y => sideOf(y.seat) !== sideOf(C.seat) && y.b !== 'P') && (lastP.b === 'X' || str(lastP.b) !== 'SA');
      if (lastP.b === '4SA') info.forcing = true;
    }
    return info;
  }

  // ───── Construction d'une réponse
  const R = (bid, expl, alert) => ({ bid, expl: expl || '', alert: !!alert });
  const P = expl => R('P', expl || 'Passe');
  const sb = (l, i) => l + SYM[i];                                   // « 2♥ »
  function cheapest(C, i) { for (let l = 1; l <= 7; l++) { const b = i === 4 ? l + 'SA' : sb(l, i); if (rank(b) > C.last) return b; } return null; }

  // ───── Ouverture
  function opening(e, C, vul) {
    const h = e.hcp, L = e.len;
    if (h >= 24) return R('2♦', `Forcing de manche : ${h}H`, true);
    if (h >= 22 && e.bal) return R('2♣', `Fort indéterminé (22-23 régulier, 2SA ensuite)`, true);
    if (h >= 22) return R('2♣', `Fort indéterminé : ${h}H`, true);
    if (h >= 20 && h <= 21 && e.bal) return R('2SA', '20-21H régulier');
    if (h >= 15 && h <= 17 && e.bal && L[0] < 5 && L[1] < 5) return R('1SA', '15-17H régulier');
    const two = L.slice().sort((a, b) => b - a);
    if (h >= 12 || (h >= 10 && h + two[0] + two[1] >= 20)) {
      if (L[0] >= 5 || L[1] >= 5) { const m = L[0] >= L[1] ? 0 : 1; return R(sb(1, m), `Ouverture, ${L[m]} cartes à ${SYM[m]}, ${h}H`); }
      if (L[2] >= 4 && L[2] >= L[3]) return R('1♦', `Ouverture, ${L[2]} cartes à ♦, ${h}H`);
      if (L[3] >= 4) return R('1♣', `Ouverture, ${L[3]} cartes à ♣, ${h}H`);
      if (L[2] === 3 && L[3] === 3) return R('1♣', `Ouverture, mineures 3-3 : 1♣, ${h}H`);
      return R(L[2] > L[3] ? '1♦' : '1♣', `Ouverture en mineure, ${h}H`);
    }
    if (h >= 5 && h <= 10) {
      for (const i of [0, 1]) if (L[i] === 6 && good(e, i)) return R(sb(2, i), `Deux faible : 6 cartes à ${SYM[i]}, 6-10H`, true);
      for (const i of [0, 1, 2, 3]) if (L[i] >= 7 && good(e, i)) return R(sb(3, i), `Barrage : 7 cartes à ${SYM[i]}, moins de 11H`);
    }
    return P(`Pas d'ouverture (${h}H)`);
    void vul;
  }
  const good = (e, i) => (e.parts[i].match(/[AKQJ]/g) || []).length >= 2 || e.parts[i].includes('T') && /[AKQ]/.test(e.parts[i]);

  // ───── Réponses à l'ouverture du partenaire (sans intervention)
  function respond(e, C) {
    const ob = C.his[0].b, h = e.hcp, L = e.len;
    if (ob === '1SA') return overNT(e, C, 1);
    if (ob === '2SA') return overNT(e, C, 2);
    if (ob === '2♣') return R('2♦', 'Relais (réponse d’attente)', true);
    if (ob === '2♦') {
      if (h < 8) return R('2♥', 'Réponse négative (moins de 8H)', true);
      const s = longest(e); if (L[s] >= 5 && s !== 2) return R(s === 1 ? '3♥' : sb(s === 3 ? 3 : 2, s), `Positive : ${L[s]} cartes à ${SYM[s]}`);
      return R('2SA', 'Positive, régulière');
    }
    const s = SI[str(ob)], level = lvl(ob);
    if (level === 2 && (s === 0 || s === 1)) {                         // deux faible
      if (L[s] >= 3 && h >= 16) return R(sb(4, s), 'Fit et 16H ou plus : la manche');
      if (L[s] >= 4) return R(sb(3, s), 'Fit 4 cartes : barrage');
      if (h >= 16) return R('2SA', 'Relais : demande de précision (16H ou plus)', true);
      return P('Pas de fit ni de manche en vue');
    }
    if (level >= 3) { if (h >= 16 && L[s] >= 2) return R(s <= 1 ? sb(4, s) : '3SA', 'Manche en face du barrage'); return P(); }
    // 1 à la couleur
    if (h < 6) return P(`Moins de 6H (${h}H)`);
    if (isMajor(s)) {
      const fit = L[s] >= 3, sp = supPts(e, s);
      if (fit) {
        if (L[s] >= 5 && h < 10 && e.len.some(l => l <= 1)) return R(sb(4, s), `Fit 5 cartes, main distribuée et faible : barrage à la manche`);
        if (sp <= 10 && h <= 10) return R(sb(2, s), `Soutien simple : fit ${SYM[s]}, 6-10 points`);
        if (sp <= 12 && h <= 12) return R(sb(3, s), `Soutien limite : fit ${SYM[s]}, 11-12 points`);
        // 13+ : changement de couleur d'abord, le fit ensuite
        const x = [3, 2, 1, 0].filter(i => i !== s && rank(sb(2, i)) > rank(ob) - 5 && L[i] >= 3).sort((a, b) => L[b] - L[a] || b - a)[0];
        if (x !== undefined && rank(sb(x === 0 && s === 1 ? 1 : 2, x)) > C.last) return R(sb(x === 0 && s === 1 ? 1 : 2, x), `Changement de couleur (11H et plus), le fit ${SYM[s]} viendra ensuite`);
        return R(sb(4, s), 'Fit et la manche');
      }
      if (s === 1 && L[0] >= 4) return R('1♠', `4 cartes ou plus à ♠, 6H et plus`);
      if (h >= 11) {
        const x = [3, 2, 1].filter(i => i !== s && L[i] >= (i === 1 ? 5 : 4)).sort((a, b) => L[b] - L[a] || b - a)[0];
        if (x !== undefined) return R(sb(2, x), `2 sur 1 : ${L[x]} cartes à ${SYM[x]}, 11H et plus, forcing un tour`);
        if (e.bal && h <= 12) return R('2SA', '11-12H régulier, sans fit');
        if (e.bal && h <= 15) return R('3SA', '13-15H régulier, sans fit');
        return R(sb(2, 3), `2 sur 1 (couleur d'attente), 11H et plus`);
      }
      return R('1SA', `6-10H sans fit ni couleur au palier de 1`);
    }
    // ouverture mineure
    for (const i of [1, 0]) if (L[i] >= 4 && (L[i] >= L[i === 1 ? 0 : 1] || i === 1)) {
      const other = i === 1 ? 0 : 1;
      const pick = L[other] > L[i] ? other : i;
      if (rank(sb(1, pick)) > C.last) return R(sb(1, pick), `4 cartes ou plus à ${SYM[pick]}, 6H et plus`);
    }
    if (s === 3 && L[2] >= 4 && h >= 6) return R('1♦', '4 cartes ou plus à ♦, 6H et plus');
    if (L[s] >= (s === 3 ? 5 : 4)) {
      if (h <= 10) return R(sb(2, s), `Soutien ${SYM[s]}, 6-10H`);
      if (h <= 12) return R(sb(3, s), `Soutien ${SYM[s]}, 11-12H`);
    }
    if (h >= 13 && e.bal) return R('3SA', '13-15H régulier');
    if (h >= 11 && e.bal) return R('2SA', '11-12H régulier');
    if (h >= 11) { const x = longest(e, [3, 2].filter(i => i !== s)); if (rank(sb(2, x)) > C.last) return R(sb(2, x), `Nouvelle couleur, 11H et plus, forcing`); }
    if (h <= 10 && h >= 8) return R('1SA', '8-10H régulier');
    return h >= 6 && L[s] >= 4 ? R(sb(2, s), `Soutien ${SYM[s]}`) : P(`Faible (${h}H)`);
  }
  // Sur 1SA (n = 1) ou 2SA (n = 2) du partenaire
  function overNT(e, C, n) {
    const h = e.hcp, L = e.len, base = n === 1 ? 2 : 3;
    const inv = n === 1 ? [8, 9] : [4, 4], game = n === 1 ? 10 : 5;
    if (L[1] >= 5 || L[0] >= 5) { const m = L[0] > L[1] ? 0 : L[1] > L[0] ? 1 : (h >= game ? 0 : 1); return R(sb(base, m === 0 ? 1 : 2), `Texas : 5 cartes ou plus à ${SYM[m]}`, true); }
    if ((L[0] === 4 || L[1] === 4) && h >= inv[0]) return R(sb(base, 3), 'Stayman : une majeure 4e', true);
    if (n === 1) {
      if (h <= 7) return P(`Moins de 8H (${h}H)`);
      if (h <= 9) return R('2SA', '8-9H, proposition de manche');
      if (h <= 15) return R('3SA', `10-15H : la manche`);
      if (h <= 17) return R('4SA', 'Quantitatif : 16-17H', true);
      return R('6SA', '18H et plus : petit chelem');
    }
    if (h <= 3) return P(`Moins de 4H`);
    if (h <= 10) return R('3SA', 'La manche');
    if (h <= 12) return R('4SA', 'Quantitatif', true);
    return R('6SA', 'Petit chelem');
  }

  // ───── Interventions (l'adversaire a ouvert, mon camp n'a encore rien dit)
  function overcall(e, C, vul) {
    const h = e.hcp, L = e.len, them = C.them, opBid = them[0].b, os = str(opBid);
    const lastThem = them[them.length - 1].b;
    if (lastThem === '1SA' || os === 'SA') {
      if (opBid === '1SA' && L[0] >= 4 && L[1] >= 4 && L[0] + L[1] >= 9 && h >= 8 && rank('2♣') > C.last) return R('2♣', 'Landy : les deux majeures (5-4 au moins)', true);
      if (C.canX && h >= 16) return R('X', 'Contre punitif : 16H et plus');
      const s = longest(e); if (L[s] >= 6 && h >= 8 && cheapest(C, s) && lvl(cheapest(C, s)) <= 2) return R(cheapest(C, s), `Intervention : ${L[s]} cartes à ${SYM[s]}`);
      return P();
    }
    const o = SI[os];
    const minH = vul ? 10 : 8;
    if (h >= 16 && h <= 18 && e.bal && stopper(e, o) && rank('1SA') > C.last) return R('1SA', `16-18H régulier avec l'arrêt ${SYM[o]}`);
    const cands = [0, 1, 2, 3].filter(i => i !== o && L[i] >= 5).sort((a, b) => L[b] - L[a] || a - b);
    for (const i of cands) {
      const b = cheapest(C, i); if (!b) continue;
      if (lvl(b) === 1 && h >= minH && h <= 16) return R(b, `Intervention : ${L[i]} cartes à ${SYM[i]}, ${minH}-16H`);
      if (lvl(b) === 2 && h >= minH + 2 && h <= 16 && good(e, i)) return R(b, `Intervention au palier de 2 : ${L[i]} belles cartes à ${SYM[i]}`);
    }
    const others = [0, 1, 2, 3].filter(i => i !== o);
    if (C.canX && ((h >= 12 && L[o] <= 2 && others.every(i => L[i] >= 3)) || h >= 17)) return R('X', h >= 17 ? 'Contre : 17H et plus (main forte)' : `Contre d'appel : 12H et plus, court à ${SYM[o]}`, true);
    for (const i of cands) { const b = cheapest(C, i); if (b && L[i] >= 6 && h >= 5 && h <= 10 && lvl(b) <= 3) { const j = lvl(b) + 1; const jb = sb(j, i); if (j <= 3 && rank(jb) > C.last) return R(jb, `Saut : barrage, 6 cartes à ${SYM[i]}`); } }
    return P();
  }
  // Réponse à l'intervention / au contre du partenaire
  function advance(e, C) {
    const h = e.hcp, L = e.len, pb = C.his[0].b, o = C.them.length && rank(C.them[0].b) >= 0 && str(C.them[0].b) !== 'SA' ? SI[str(C.them[0].b)] : null;
    if (pb === 'X') {                                                 // contre d'appel : réponse par paliers
      if (C.lastAct === 'XX') { const u = [0, 1, 2, 3].filter(i => i !== o).sort((a, b) => L[b] - L[a] || (isMajor(b) - isMajor(a)))[0]; const c0 = cheapest(C, u); if (c0 && lvl(c0) <= 2) return R(c0, `Après le surcontre : ${L[u]} cartes à ${SYM[u]}`); }
      else if (C.lastAct !== 'X' && C.lastActBy !== C.partner && h <= 5) return P('Faible, l’adversaire a reparlé');
      const unbid = [0, 1, 2, 3].filter(i => i !== o).sort((a, b) => (isMajor(b) - isMajor(a)) || L[b] - L[a]);
      const s = unbid.sort((a, b) => L[b] - L[a] || (isMajor(b) - isMajor(a)))[0];
      if (o !== null && e.bal && h >= 8 && h <= 10 && stopper(e, o) && rank('1SA') > C.last) return R('1SA', `8-10H avec l'arrêt ${SYM[o]}`);
      const c = cheapest(C, s);
      if (h >= 12 && isMajor(s) && L[s] >= 4) return R(sb(4, s), `Réponse au contre : manche à ${SYM[s]} (12H et plus)`);
      if (h >= 9 && c && lvl(c) < 4) { const j = sb(lvl(c) + 1, s); if (rank(j) > C.last) return R(j, `Réponse au contre avec saut : 9-11H, ${L[s]} cartes à ${SYM[s]}`); }
      return c ? R(c, `Réponse au contre : ${L[s]} cartes à ${SYM[s]}, 0-8H`) : P();
    }
    if (rank(pb) < 0) return P();
    if (partnerInfo(C).preempt) { const ps = SI[str(pb)]; if (L[ps] >= 3 && h >= 16 && isMajor(ps)) return R(sb(4, ps), 'Fit et la manche face au barrage'); if (L[ps] >= 3 && h >= 16 && e.bal && o !== null && stopper(e, o)) return R('3SA', 'La manche à SA'); return P('Le partenaire a fait un barrage'); }
    if (str(pb) === 'SA') { if (h >= 9) return R('3SA', 'Manche face au 1SA d’intervention'); if (h >= 7) return R('2SA', 'Proposition'); return P(); }
    if (pb === '2♣' && C.them[0].b === '1SA') {                     // Landy du partenaire
      const m = L[1] > L[0] ? 1 : 0;
      if (h >= 12) return R(sb(4, m), 'Manche dans la majeure préférée');
      if (h >= 10) return R(sb(3, m), 'Proposition dans la majeure préférée');
      return R(cheapest(C, m), 'Choix de la majeure');
    }
    const s = SI[str(pb)];
    if (L[s] >= 3) {
      const sp = supPts(e, s);
      if (sp >= 13 && isMajor(s)) return R(sb(4, s), `Fit ${SYM[s]} et la manche`);
      if (sp >= 11 && o !== null) { const cb = cheapest(C, o); if (cb && lvl(cb) <= 3) return R(cb, `Cue-bid : fit ${SYM[s]} et 11H ou plus`, true); }
      if (sp >= 7) { const b = cheapest(C, s); if (b && lvl(b) <= 3) return R(b, `Soutien ${SYM[s]}`); }
      return P();
    }
    const x = longest(e, [0, 1, 2, 3].filter(i => i !== s && i !== o));
    if (L[x] >= 6 && h >= 8) { const b = cheapest(C, x); if (b && lvl(b) <= 3) return R(b, `${L[x]} cartes à ${SYM[x]}`); }
    if (o !== null && e.bal && h >= 9 && stopper(e, o)) { const b = h >= 12 ? '3SA' : cheapest(C, 4); if (b && rank(b) > C.last) return R(b, `${h}H avec l'arrêt ${SYM[o]}`); }
    return P();
  }
  // Le partenaire a ouvert et l'adversaire est intervenu : première réponse
  function respondOverInterference(e, C) {
    const h = e.hcp, L = e.len, ob = C.his[0].b, s = rank(ob) >= 0 && str(ob) !== 'SA' ? SI[str(ob)] : null;
    const tb = C.them[C.them.length - 1].b;
    if (tb === 'X') {                                                 // l'ouverture a été contrée
      if (h >= 10) return R('XX', 'Surcontre : 10H et plus');
      if (s !== null && L[s] >= 4 && h >= 4 && h <= 9) { const b = sb(Math.min(3, lvl(ob) + 2), s); if (rank(b) > C.last) return R(b, 'Saut : barrage avec le fit'); }
      return respond(e, C);
    }
    if (rank(tb) < 0) return respond(e, C);
    const o = str(tb) === 'SA' ? null : SI[str(tb)];
    if (C.his[0].b === '1SA') { if (h >= 10 && C.canX) return R('X', 'Contre punitif'); const m = longest(e); if (L[m] >= 5 && h >= 6) { const b = cheapest(C, m); if (b && lvl(b) <= 3) return R(b, `${L[m]} cartes à ${SYM[m]}`); } return P(); }
    if (s !== null && L[s] >= (isMajor(s) ? 3 : 5)) {
      const sp = supPts(e, s);
      if (sp >= 11 && o !== null) { const cb = cheapest(C, o); if (cb && lvl(cb) <= 3) return R(cb, `Cue-bid : fit ${SYM[s]} et 11 points ou plus`, true); }
      if (sp >= 6) { const b = cheapest(C, s); if (b && lvl(b) <= 3) return R(b, `Soutien ${SYM[s]}`); }
    }
    if (C.canX && o !== null && h >= 8) {
      const unbidM = [0, 1].filter(i => i !== o && i !== s);
      if (unbidM.length && unbidM.every(i => L[i] >= 4)) return R('X', `Contre Spoutnik : 4 cartes à ${unbidM.map(i => SYM[i]).join(' et ')}, 8H et plus`, true);
      if (unbidM.length === 1 && L[unbidM[0]] === 4) return R('X', `Contre Spoutnik : 4 cartes à ${SYM[unbidM[0]]}, 8H et plus`, true);
    }
    const x = longest(e, [0, 1, 2, 3].filter(i => i !== s && i !== o));
    const bx = cheapest(C, x);
    if (bx && L[x] >= 5 && ((lvl(bx) === 1 && h >= 6) || (lvl(bx) === 2 && h >= 11))) return R(bx, `${L[x]} cartes à ${SYM[x]}`);
    if (o !== null && e.bal && stopper(e, o)) {
      if (h >= 13) return R('3SA', `13H et plus avec l'arrêt ${SYM[o]}`);
      if (h >= 8) { const b = cheapest(C, 4); if (b && lvl(b) <= 2) return R(b, `${h}H avec l'arrêt ${SYM[o]}`); }
    }
    return P();
  }

  // ───── Conventions qui demandent une réponse précise
  function conventions(e, C, pi) {
    const h = e.hcp, L = e.len, his = C.his, mine = C.mine;
    const lastP = his[his.length - 1];
    const uncontested = !C.them.length;
    // Blackwood 41-30
    if (lastP && lastP.b === '4SA' && mine.length) {
      const t = agreedSuit(C, e, pi);
      if (t !== null) {
        const k = keyCards(e, t), q = e.parts[t].includes('Q');
        const b = k === 1 || k === 4 ? '5♣' : k === 0 || k === 3 ? '5♦' : q ? '5♠' : '5♥';
        if (rank(b) > C.last) return R(b, k === 1 || k === 4 ? '1 ou 4 clés' : k === 0 || k === 3 ? '0 ou 3 clés' : `2 clés ${q ? 'avec' : 'sans'} la Dame d'atout`, true);
      } else {                                                       // 4SA quantitatif
        const top = pi.bal || mine.some(x => str(x.b) === 'SA');
        if (top && h >= (mine[0].b === '1SA' ? 17 : 21)) return R('6SA', 'Maximum : petit chelem');
        if (top) return P('Minimum : on reste à 4SA');
      }
    }
    // Réponses à mes 4SA (Blackwood)
    const myLast = mine[mine.length - 1];
    if (myLast && myLast.b === '4SA' && lastP && lastP.i > myLast.i && /^5[♣♦♥♠]$/.test(lastP.b)) {
      const t = agreedSuit(C, e, pi); if (t === null) return P();
      const mk = keyCards(e, t), tot = pi.min + e.hcp;
      const his_k = lastP.b === '5♣' ? [1, 4] : lastP.b === '5♦' ? [0, 3] : [2];
      const k = his_k.length === 1 ? 2 : (mk + his_k[1] <= 5 && tot >= 30 ? his_k[1] : his_k[0]);
      const total = mk + k;
      if (total <= 3) { const b = cheapest(C, t); return lvl(b) === 5 ? R(b, `Il manque 2 cartes clés : on s'arrête`) : P('Il manque 2 cartes clés'); }
      if (total === 5 && tot >= 36) return R(sb(7, t), 'Toutes les cartes clés : grand chelem');
      return R(sb(6, t), 'Il ne manque qu’une carte clé au plus : petit chelem');
    }
    if (!uncontested && !C.them.every(x => x.b === 'X')) return null;   // Stayman / Texas restent valables après un contre
    // J'ai ouvert 1SA / 2SA : réponses au Stayman et au Texas
    if (mine.length === 1 && (mine[0].b === '1SA' || mine[0].b === '2SA') && his.length === 1 && C.hist[C.hist.length - 1].seat !== C.seat) {
      const n = mine[0].b === '1SA' ? 2 : 3, pb = his[0].b;
      if (pb === sb(n, 3)) return L[1] >= 4 ? R(sb(n, 1), '4 cartes à ♥ (réponse au Stayman)') : L[0] >= 4 ? R(sb(n, 0), '4 cartes à ♠ (réponse au Stayman)') : R(sb(n, 2), 'Pas de majeure 4e (réponse au Stayman)', true);
      if (pb === sb(n, 2)) return R(sb(n, 1), 'Texas accepté : 5 cartes à ♥ en face');
      if (pb === sb(n, 1)) return R(sb(n, 0), 'Texas accepté : 5 cartes à ♠ en face');
    }
    // J'ai fait Stayman ou Texas : suite
    if (mine.length === 1 && his.length === 2 && (his[0].b === '1SA' || his[0].b === '2SA')) {
      const n = his[0].b === '1SA' ? 2 : 3, my = mine[0].b, ans = his[1].b, gameH = n === 2 ? 10 : 5;
      if (my === sb(n, 3)) {
        const fit = ans === sb(n, 1) ? 1 : ans === sb(n, 0) ? 0 : null;
        if (fit !== null && L[fit] >= 4) return h >= gameH ? R(sb(4, fit), 'Fit et la manche') : R(sb(3, fit), 'Fit, proposition de manche');
        if (ans === sb(n, 1) && L[0] >= 4) return h >= gameH ? R('3SA', 'Pas de fit ♥ : 3SA (l’ouvreur corrige à 4♠ avec 4 cartes)') : R('2SA', 'Proposition');
        return h >= gameH ? R('3SA', 'Pas de fit : la manche à SA') : (n === 2 ? R('2SA', 'Pas de fit, proposition de manche') : P());
      }
      if (my === sb(n, 2) || my === sb(n, 1)) {
        const m = my === sb(n, 2) ? 1 : 0;
        if (h < (n === 2 ? 8 : 4)) return P(`Faible : on joue ${ans}`);
        if (L[m] >= 6) return h >= gameH ? R(sb(4, m), `6 cartes à ${SYM[m]} et la manche`) : R(sb(3, m), `6 cartes à ${SYM[m]}, proposition`);
        return h >= gameH ? R('3SA', `5 cartes à ${SYM[m]} : choix entre 3SA et 4${SYM[m]}`) : R('2SA', `5 cartes à ${SYM[m]}, proposition`);
      }
    }
    // Ouvreur 1SA après Stayman/Texas + suite du partenaire
    if (mine.length === 2 && (mine[0].b === '1SA' || mine[0].b === '2SA') && his.length === 2) {
      const pb = his[1].b, first = his[0].b, n = mine[0].b === '1SA' ? 2 : 3;
      const tx = first === sb(n, 2) ? 1 : first === sb(n, 1) ? 0 : null;
      if (tx !== null) {
        if (pb === '3SA') return L[tx] >= 3 ? R(sb(4, tx), `3 cartes à ${SYM[tx]} : la manche en majeure`) : P('Doubleton : on joue 3SA');
        if (pb === '2SA') return L[tx] >= 3 ? (h >= 16 ? R(sb(4, tx), 'Fit et maximum') : R(sb(3, tx), 'Fit, minimum')) : (h >= 16 ? R('3SA', 'Maximum sans fit') : P('Minimum'));
        if (pb === sb(3, tx)) return h >= 16 ? R(sb(4, tx), 'Maximum : la manche') : P('Minimum');
      }
      if (first === sb(n, 3)) {
        if (pb === '3SA' && L[0] >= 4 && mine[1].b === sb(n, 1)) return R('4♠', '4 cartes à ♠ aussi : la manche à ♠');
        if (pb === '2SA') return mine[1].b === sb(n, 1) && L[0] >= 4 ? R(h >= 16 ? '4♠' : '3♠', '4 cartes à ♠ aussi') : h >= 16 ? R('3SA', 'Maximum') : P('Minimum');
        if (/^3[♥♠]$/.test(pb)) return h >= 16 ? R(sb(4, SI[str(pb)]), 'Maximum : la manche') : P('Minimum');
      }
    }
    // J'ai ouvert 2♣ : redemande
    if (mine.length === 1 && mine[0].b === '2♣' && his.length === 1 && his[0].b === '2♦') {
      if (e.bal && h <= 23) return R('2SA', '22-23H régulier');
      const s = longest(e); return R(s === 2 ? '3♦' : s === 3 ? '3♣' : sb(2, s), `${L[s]} cartes à ${SYM[s]}, forcing`);
    }
    if (mine.length === 1 && mine[0].b === '2♦' && his.length === 1) {
      if (e.bal) return R(cheapest(C, 4), `Régulier, ${h}H`);
      const s = longest(e); return R(cheapest(C, s), `${L[s]} cartes à ${SYM[s]}`);
    }
    // Deux faible : relais 2SA
    if (mine.length === 1 && /^2[♥♠]$/.test(mine[0].b) && his.length === 1 && his[0].b === '2SA') return h >= 9 ? R('3SA', 'Maximum (9-10H)') : R(sb(3, SI[str(mine[0].b)]), 'Minimum');
    return null;
  }
  // Atout convenu : dernière couleur nommée par les deux
  function agreedSuit(C, e, pi) {
    if (e && pi) { const f = [0, 1, 2, 3].filter(i => e.len[i] + pi.len[i] >= 8).sort((a, b) => (isMajor(b) - isMajor(a)) || (e.len[b] + pi.len[b]) - (e.len[a] + pi.len[a]))[0]; if (f !== undefined) return f; }
    const bw = C.hist.findIndex(x => x.b === '4SA');
    const texas = x => { const o = C.hist.filter(y => y.i < x.i && y.b !== 'P'); const prev = o[o.length - 1]; return prev && (prev.b === '1SA' || prev.b === '2SA') && prev.seat === partnerOf(x.seat) && (x.b === sb(lvl(prev.b) + 1, 2) || x.b === sb(lvl(prev.b) + 1, 1)) ? (x.b.endsWith('♦') ? '♥' : '♠') : null; };
    const ours = C.hist.filter(x => sideOf(x.seat) === sideOf(C.seat) && rank(x.b) >= 0 && str(x.b) !== 'SA' && (bw < 0 || x.i < bw)).map(x => ({ ...x, b: texas(x) ? lvl(x.b) + texas(x) : x.b }));
    for (let k = ours.length - 1; k >= 0; k--) {
      const s = str(ours[k].b);
      if (ours.some(y => y.seat !== ours[k].seat && str(y.b) === s)) return SI[s];
    }
    const last = ours[ours.length - 1]; return last ? SI[str(last.b)] : null;
  }

  // ───── Redemande de l'ouvreur (sans intervention)
  function openerRebid(e, C) {
    const h = e.hcp, L = e.len, ob = C.mine[0].b, pb = C.his[0].b;
    if (rank(ob) < 0 || str(ob) === 'SA' || lvl(ob) !== 1) return null;
    const o = SI[str(ob)];
    if (pb === 'P' || rank(pb) < 0) return null;
    const ps = str(pb), pl = lvl(pb);
    if (ps === str(ob)) {                                             // soutien
      const tp = supPts(e, o) - (L[o] >= 5 ? 0 : 0);
      if (pl === 2) { if (tp >= 18) return R(sb(4, o), `Maximum (${tp} points) : la manche`); if (tp >= 15 && isMajor(o)) return R(sb(3, o), `${tp} points : proposition de manche`); return P(`Minimum (${tp} points)`); }
      if (pl === 3) { if (isMajor(o)) return tp >= 13 ? R(sb(4, o), 'Accepte la proposition') : P('Minimum : refuse'); return tp >= 14 && e.bal ? R('3SA', 'Accepte, en SA') : P(); }
      return P();
    }
    if (ps === 'SA') {
      if (pb === '1SA') {
        if (e.bal && h <= 14) return P('Régulier minimum');
        if (h >= 18 && e.bal) return R('2SA', '18-19H régulier');
        if (L[o] >= 6) return R(h >= 16 ? sb(3, o) : sb(2, o), `${L[o]} cartes à ${SYM[o]}`);
        const x = [3, 2, 1, 0].find(i => i !== o && L[i] >= 4 && rank(sb(2, i)) < rank(sb(2, o)) + 0 && rank(sb(2, i)) > C.last);
        if (x !== undefined) return R(sb(2, x), `4 cartes à ${SYM[x]}`);
        if (h >= 15 && e.bal) return R('2SA', `${h}H, proposition`);
        return L[o] >= 5 && !e.bal ? R(sb(2, o), `${L[o]} cartes à ${SYM[o]}`) : P();
      }
      if (pb === '2SA') return h >= 14 ? R('3SA', 'Accepte la manche') : (L[o] >= 6 ? R(sb(3, o), 'Minimum, couleur 6e') : P('Minimum'));
      return P();
    }
    const s = SI[ps];
    const sup = isMajor(s) ? L[s] >= 4 : L[s] >= 4;
    if (pl === 1) {
      if (sup && isMajor(s)) { const tp = supPts(e, s); return tp >= 19 ? R(sb(4, s), `Fit ${SYM[s]} et ${tp} points`) : tp >= 16 ? R(sb(3, s), `Fit ${SYM[s]}, 16-18 points`) : R(sb(2, s), `Fit ${SYM[s]}, minimum`); }
      if (s === 1 && L[0] >= 4 && o !== 0) return R('1♠', '4 cartes à ♠');
      if (e.bal && h <= 14) return R('1SA', '12-14H régulier');
      if (e.bal && h >= 18 && h <= 19) return R('2SA', '18-19H régulier');
      if (L[o] >= 6) return R(h >= 16 ? sb(3, o) : sb(2, o), `${L[o]} cartes à ${SYM[o]}, ${h >= 16 ? '16-18' : '12-15'}H`);
      if (sup) return R(h >= 16 ? sb(3, s) : sb(2, s), `Soutien ${SYM[s]}`);
      const x = [3, 2, 1, 0].filter(i => i !== o && i !== s && L[i] >= 4).sort((a, b) => L[b] - L[a])[0];
      if (x !== undefined) { const b = cheapest(C, x); if (b && (lvl(b) === 1 || rank(b) < rank(sb(2, o)) || h >= 17)) return R(b, `${L[x]} cartes à ${SYM[x]}${lvl(b) === 2 && rank(b) > rank(sb(2, o)) ? ', bicolore cher (17H et plus)' : ''}`); }
      return R(cheapest(C, o), `${L[o]} cartes à ${SYM[o]}`);
    }
    // 2 sur 1
    if (sup) return R(cheapest(C, s), `Fit ${SYM[s]}`);
    if (L[o] >= 6) return R(cheapest(C, o), `${L[o]} cartes à ${SYM[o]}`);
    if (e.bal && C.sys === 'raimon') return h >= 18 ? R('3SA', '18H et plus régulier') : h >= 15 ? R('2SA', '15-17H régulier') : R(cheapest(C, o), 'Minimum');
    if (e.bal) return R(h >= 15 ? '3SA' : '2SA', h >= 15 ? '15H et plus régulier' : '12-14H régulier');
    const x = [3, 2, 1, 0].filter(i => i !== o && i !== s && L[i] >= 4).sort((a, b) => L[b] - L[a])[0];
    if (x !== undefined) { const b = cheapest(C, x); if (b && lvl(b) <= 3) return R(b, `${L[x]} cartes à ${SYM[x]}`); }
    return R(cheapest(C, o), `${L[o]} cartes à ${SYM[o]}`);
  }

  // ───── Moteur général : fit, points de la ligne, palier visé
  function general(e, C, pi) {
    const h = e.hcp, L = e.len;
    const ourContract = C.lastBy && sideOf(C.lastBy) === sideOf(C.seat);
    const fits = [0, 1, 2, 3].map(i => L[i] + pi.len[i]);
    let fit = [0, 1, 2, 3].filter(i => fits[i] >= 8).sort((a, b) => (isMajor(b) - isMajor(a)) || fits[b] - fits[a])[0];
    if (fit === undefined) fit = null;
    const tp = (fit !== null ? supPts(e, fit) : lenPts(e)) + pi.min;
    const forced = pi.forcing;
    const ntOk = pi.bal || e.bal || (C.them.length ? C.them.every(x => rank(x.b) < 0 || str(x.b) === 'SA' || stopper(e, SI[str(x.b)])) : true);
    // objectif
    let target = null;
    if (fit !== null && tp >= 33) {
      if (!C.hist.some(x => x.b === '4SA') && rank('4SA') > C.last) return R('4SA', `Blackwood 41-30 : fit ${SYM[fit]}, zone de chelem`, true);
      target = sb(tp >= 37 ? 7 : 6, fit);
    } else if (fit === null && tp >= 33 && ntOk) target = tp >= 37 ? '7SA' : '6SA';
    else if (tp >= 25) {
      const own = [0, 1].find(i => L[i] >= 6 && good(e, i));
      target = fit !== null && isMajor(fit) ? sb(4, fit) : own !== undefined ? sb(4, own) : ntOk ? '3SA' : fit !== null ? sb(5, fit) : '3SA';
    }
    else if (tp >= 23 && fit !== null && isMajor(fit)) target = sb(3, fit);
    else if (tp >= 23 && ntOk && !fit) target = '2SA';
    // compétition : loi des levées totales
    if (!ourContract && C.lastBid && fit !== null) {
      const allowed = Math.max(2, fits[fit] - 6);
      const b = cheapest(C, fit);
      if (b && lvl(b) <= allowed && (!target || rank(b) <= rank(target))) return R(target && rank(target) > rank(b) && lvl(target) >= 4 ? target : b, `Fit ${SYM[fit]} (${fits[fit]} cartes) : on dispute le contrat`);
    }
    if (target && rank(target) > C.last) {
      // on ne saute pas au-delà de la manche par erreur, sauf chelem voulu
      return R(target, target.endsWith('SA') ? `${tp} points dans la ligne : ${target}` : `Fit ${SYM[fit]} et ${tp} points dans la ligne : ${target}`);
    }
    if (!ourContract && C.lastBid && C.canX && lvl(C.lastBid) >= 2 && tp >= 25 && fit === null) {
      const ts = str(C.lastBid), t = ts === 'SA' ? null : SI[ts];
      if (t !== null && L[t] >= 4 && (e.parts[t].match(/[AKQ]/g) || []).length >= 2) return R('X', 'Contre punitif : ils ne gagneront pas');
    }
    if (forced) {
      // enchère la moins chère et naturelle
      if (fit !== null) { const b = cheapest(C, fit); if (b && lvl(b) <= 4) return R(b, `Fit ${SYM[fit]}`); }
      const own = longest(e);
      if (L[own] >= 5) { const b = cheapest(C, own); if (b && lvl(b) <= 3) return R(b, `${L[own]} cartes à ${SYM[own]}`); }
      const b = cheapest(C, 4); if (b && lvl(b) <= 3 && ntOk) return R(b, `Régulier, ${h}H`);
      const any = [3, 2, 1, 0].map(i => cheapest(C, i)).filter(x => x && lvl(x) <= 3).sort((a, z) => rank(a) - rank(z))[0];
      if (any) return R(any, 'Enchère d’attente (forcing en face)');
    }
    // correction d'une couleur sans fit vers sa couleur 6e
    if (ourContract && C.lastBy === C.partner && fit === null && rank(C.lastBid) >= 0) {
      const own = longest(e); if (L[own] >= 6 && str(C.lastBid) !== SYM[own] && C.mine.filter(x => str(x.b) === SYM[own]).length < 2) { const b = cheapest(C, own); if (b && lvl(b) <= 2) return R(b, `${L[own]} cartes à ${SYM[own]} : je préfère ma couleur`); }
    }
    return P();
  }

  // ═════ Variante « Système Raimon » (fiche de Damien et Michèle) : ouvertures dès 11H, 2♣ Albaran, 2♦ Multi,
  // 2♥/2♠ fort ou bicolore faible, Shadow fit, Oklahoma, Blackwood Lefèvre, Copenhague. Le reste = SEF ci-dessus.
  const twoTop = (e, i) => { const p = e.parts[i]; return ['A', 'K', 'Q'].filter(c => p.includes(c)).length >= 2 || (p.includes('J') && p.includes('T')); };
  function raimonOpening(e) {
    const h = e.hcp, L = e.len;
    if (h >= 24) return R('2♣', `Albaran : forcing de manche (${h}H)`, true);
    if (h >= 22 && e.bal) return R('2♦', 'Multi : 22-23H régulier (2SA ensuite)', true);
    if (h >= 20 && e.bal) return R('2SA', '20-21H régulier');
    if (h >= 20) { const m = [0, 1].find(i => L[i] >= 6); if (m !== undefined) return R(sb(2, m), `Fort, 6 cartes à ${SYM[m]} (${h}H)`, true); }   // sinon : ouverture au palier de 1 (bicolore cher ou saut ensuite)
    if (h >= 15 && h <= 17 && e.bal && L[0] < 5 && L[1] < 5) return R('1SA', '15-17H régulier');
    if (h >= 11) {
      if (L[0] >= 5 || L[1] >= 5) { const m = L[0] >= L[1] ? 0 : 1; return R(sb(1, m), `Ouverture, ${L[m]} cartes à ${SYM[m]}, ${h}H`); }
      if (L[2] >= 4 && L[2] >= L[3]) return R('1♦', `Ouverture, ${L[2]} cartes à ♦, ${h}H`);
      if (L[0] === 4 && L[1] === 4 && L[2] === 3) return R('1♦', `Ouverture 4-4-3-2 : 1♦, ${h}H`);
      return R('1♣', `Ouverture en mineure, ${h}H`);
    }
    if (h >= 5) {
      const honor = i => /[AKQ]/.test(e.parts[i]);
      for (const i of [1, 0]) if (L[i] >= 5 && honor(i)) { const o = [0, 1, 2, 3].find(j => j !== i && L[j] >= 5 && honor(j)); if (o !== undefined) return R(sb(2, i), `Bicolore faible 5-5 : ${SYM[i]} et ${SYM[o]}`, true); }
      for (const i of [0, 1]) if (L[i] === 6 && twoTop(e, i)) return R('2♦', `Multi : deux faible à ${SYM[i]}`, true);
      for (const i of [0, 1, 2, 3]) if (L[i] >= 7 && good(e, i)) return R(sb(3, i), `Barrage : 7 cartes à ${SYM[i]}`);
    }
    return P(`Pas d'ouverture (${h}H)`);
  }
  // Réponses et suites propres au système Raimon ; null = on laisse faire le moteur SEF
  function raimon(e, C, pi) {
    const h = e.hcp, L = e.len, his = C.his, mine = C.mine, quiet = !C.them.length;
    if (!C.acts.length) return raimonOpening(e);
    const first = C.opener;
    // ── Je réponds à l'ouverture du partenaire
    if (quiet && first.seat === C.partner && !mine.length && his.length === 1) {
      const ob = his[0].b;
      if (ob === '2♣') {                                              // Albaran : réponses par les As
        const a = [0, 1, 2, 3].filter(i => e.parts[i].includes('A'));
        if (a.length === 0) return h >= 8 || e.parts.join('').split('K').length - 1 >= 2 ? R('2SA', '8H et plus (ou 2 Rois), sans As', true) : R('2♦', 'Pas d’As, moins de 8 points', true);
        if (a.length === 1) return R(['2♠', '2♥', '3♦', '3♣'][a[0]], `L'As de ${SYM[a[0]]}`, true);
        if (a.length === 2) { const black = x => x === 0 || x === 3; const [i, j] = a; return black(i) === black(j) ? R('3♥', '2 As de même couleur', true) : (i < 2) === (j < 2) ? R('3♠', '2 As de même rang', true) : R('3SA', '2 As mélangés', true); }
        return R('2SA', '3 As ou plus', true);
      }
      if (ob === '2♦') {                                              // Multi
        if (h >= 15) return R('2SA', 'Relais : 15H et plus', true);
        if (L[1] >= 3 && L[0] < 3) return R('2♠', 'Je supporte 3♥ (passe ou corrige)', true);
        return R('2♥', 'Négatif : je passe ou je corrige', true);
      }
      if (ob === '2♥') return R('2♠', 'Relais : fort ou bicolore ?', true);
      if (ob === '2♠') return R('2SA', 'Relais : fort ou bicolore ?', true);
      if (ob === '1♥' || ob === '1♠') {
        const M = SI[str(ob)], fit = L[M] >= 3, sp = supPts(e, M);
        if (M === 1 && L[0] >= 5 && h >= 12) return R('1♠', '5 cartes à ♠ et 12H ou plus : les ♠ d’abord, le fit ensuite');
        if (fit && sp >= 6 && sp <= 10 && h <= 10) return R(sb(2, M), `Soutien simple : 6-10 HLD (${sp})`);
        if (fit && sp >= 11 && sp <= 12) {
          if (h >= 8) return L[M] >= 4 ? R('3♦', 'Shadow fit : 4 cartes, 8H et plus (11-12 HLD)', true) : R('3♣', 'Shadow fit : 3 cartes, 8H et plus (11-12 HLD)', true);
          return R(sb(3, M), 'Shadow fit : moins de 8H (11-12 HLD)', true);
        }
        if (fit && sp >= 13 && sp <= 15 && h <= 11) {
          const k = keyCards(e, M), chic = L.some((l, i) => i !== M && l === 0);
          if (chic) return k <= 1 ? R(sb(3, M === 0 ? 1 : 0), 'Oklahoma : 0 ou 1 carte clé + une chicane', true) : R('4♣', 'Oklahoma : 2 cartes clés + une chicane', true);
          return k <= 1 ? R(sb(4, M), 'Oklahoma : 0 ou 1 carte clé', true) : R('4♦', 'Oklahoma : 2 cartes clés', true);
        }
        if (h >= 12 && !e.bal && fit) { const x = [3, 2, 1].filter(i => i !== M && rank(sb(2, i)) > C.last).sort((a, b) => L[b] - L[a])[0]; if (x !== undefined) return R(sb(2, x), `Changement de couleur : fit ${SYM[M]} et 12H ou plus, le fit viendra ensuite`); }
        if (h === 12 && e.bal && !fit) return R('2SA', '12H régulier');
      }
      if ((ob === '1♣' || ob === '1♦') && h === 12 && e.bal && L[0] < 4 && L[1] < 4) return R('2SA', '12H régulier');
      return null;
    }
    // ── J'ai ouvert : réponses aux relais
    if (quiet && first.seat === C.seat && mine.length === 1 && his.length === 1) {
      const ob = mine[0].b, pb = his[0].b;
      if (ob === '2♦') {                                              // Multi
        const weak = [0, 1].find(i => L[i] === 6 && h < 11);
        if (pb === '2♥') return weak === 1 ? P('Deux faible à ♥ : je passe') : weak === 0 ? R('2♠', 'Deux faible à ♠') : R('2SA', '22-23H régulier');
        if (pb === '2♠') return weak === 0 ? P('Deux faible à ♠ : je passe') : weak === 1 ? R('3♥', 'Deux faible à ♥') : R('2SA', '22-23H régulier');
        if (pb === '2SA') return weak !== undefined ? R(sb(3, weak), `Deux faible à ${SYM[weak]}`) : R('3SA', '22-23H régulier');
      }
      if ((ob === '2♥' && pb === '2♠') || (ob === '2♠' && pb === '2SA')) {
        const M = SI[str(ob)], o = M === 0 ? 1 : 0;
        if (h < 11) {                                                 // bicolore faible
          const x = [0, 1, 2, 3].find(i => i !== M && L[i] >= 5);
          if (M === 1 && x === 0) return R('2SA', 'Bicolore ♥/♠ faible', true);
          return R(x === 3 ? '3♣' : '3♦', `Bicolore ${SYM[M]}/${SYM[x]} faible`, true);
        }
        const chic = [0, 1, 2, 3].find(i => i !== M && L[i] === 0);
        if (chic !== undefined && chic !== o) return R(sb(4, chic), `Fort + chicane à ${SYM[chic]}`, true);
        if (L[o] === 3) return R(sb(3, o), `Fort et 3 cartes à ${SYM[o]}`, true);
        if (L.some((l, i) => i !== M && l === 1)) return R(sb(3, M), 'Fort + singleton', true);
        return R('3SA', 'Fort sans particularité', true);
      }
      // Ouvreur face au Shadow fit / à l'Oklahoma
      if (ob === '1♥' || ob === '1♠') {
        const M = SI[str(ob)], tp = supPts(e, M);
        if (pb === '3♣' || pb === '3♦') return tp >= 14 ? R(sb(4, M), 'Accepte la manche face au Shadow fit') : R(sb(3, M), 'Minimum : on s’arrête');
        if (pb === sb(3, M) && C.hist.length) return tp >= 16 ? R(sb(4, M), 'Accepte la manche') : P('Minimum');
        if (['4♣', '4♦', sb(3, M === 0 ? 1 : 0)].includes(pb)) return R(sb(4, M), 'Pas de chelem en vue : la manche');
      }
    }
    // ── J'ai fait le relais sur 2♥/2♠ et l'ouvreur a montré son bicolore faible : je choisis le contrat
    if (quiet && first.seat === C.partner && mine.length === 1 && his.length === 2 && /^2[♥♠]$/.test(his[0].b) && (mine[0].b === '2♠' || mine[0].b === '2SA')) {
      const M = SI[str(his[0].b)], ans = his[1].b;
      const other = ans === '2SA' ? 0 : ans === '3♣' ? 3 : ans === '3♦' ? 2 : null;
      if (other !== null) {
        if (L[M] >= 3 && h >= 16) return R(sb(4, M), `Fit ${SYM[M]} et la manche`);
        if (other <= 1 && L[other] >= 3 && h >= 16) return R(sb(4, other), `Fit ${SYM[other]} et la manche`);
        if (L[M] >= L[other] && L[M] >= 2) { const b = cheapest(C, M); return b && lvl(b) <= 3 ? R(b, `Préférence ${SYM[M]}`) : P(); }
        return lvl(ans) === 3 || ans === '2SA' ? (other === 0 ? R('3♠', 'Préférence ♠') : P(`On joue ${ans}`)) : P();
      }
      // main forte : on va au moins à la manche
      const o = M === 0 ? 1 : 0;
      const three = (M === 1 && ans === '3♠') || (M === 0 && ans === '3♥');
      if (three && L[o] >= 4) { const b = sb(4, o); if (rank(b) > C.last) return R(b, `4 cartes à ${SYM[o]} face aux 3 de l'ouvreur : la manche`); }
      if (L[M] >= 3) { const b = sb(4, M); if (rank(b) > C.last) return R(b, `Fit ${SYM[M]} face à la main forte : la manche`); }
      if (ans !== '3SA' && rank('3SA') > C.last) return R('3SA', 'Pas de fit : la manche à SA');
      return P('On joue la manche');
    }
    // ── Blackwood Lefèvre (réponses)
    const lastP = his[his.length - 1];
    if (lastP && lastP.b === '4SA' && mine.length) {
      const t = agreedSuit(C, e, pi);
      if (t !== null) {
        const a = e.aces, k = e.parts.join('').split('K').length - 1, inv = t === 3;
        if (a === 0 || a === 3) return R(inv ? '5♦' : '5♣', `0 ou 3 As${inv ? ' (inversé, atout ♣)' : ''}`, true);
        if (a === 1 || a === 4) return R(inv ? '5♣' : '5♦', `1 ou 4 As${inv ? ' (inversé, atout ♣)' : ''}`, true);
        if (k === 2) return R('5SA', '2 As et 2 Rois', true);
        return (k === 0 || k === 3) ? R('5♥', '2 As, 0 ou 3 Rois', true) : R('5♠', '2 As, 1 ou 4 Rois', true);
      }
    }
    const myLast = mine[mine.length - 1];
    if (myLast && myLast.b === '4SA' && lastP && lastP.i > myLast.i && /^5(♣|♦|♥|♠|SA)$/.test(lastP.b)) {
      const t = agreedSuit(C, e, pi); if (t === null) return P();
      const inv = t === 3, b = lastP.b;
      const opts = b === '5♣' ? (inv ? [1, 4] : [0, 3]) : b === '5♦' ? (inv ? [0, 3] : [1, 4]) : [2];
      const his_a = opts.length === 1 ? 2 : (e.aces + opts[1] <= 4 && pi.min + e.hcp >= 30 ? opts[1] : opts[0]);
      const tot = e.aces + his_a;
      if (tot <= 2) { const c5 = cheapest(C, t); return c5 && lvl(c5) === 5 ? R(c5, 'Il manque 2 As : on s’arrête') : P('Il manque 2 As'); }
      if (tot === 4 && pi.min + e.hcp >= 36) return R(sb(7, t), 'Tous les As : grand chelem');
      return R(sb(6, t), 'Il ne manque qu’un As : petit chelem');
    }
    // ── Défense sur 1SA adverse (fiche : 2e position X = du ♣ ; 4e position X = Landy 12H+)
    if (!mine.length && !his.length && C.lastBid === '1SA' && C.them.length === 1 && C.them[0].b === '1SA') {
      const direct = C.hist.length === C.them[0].i + 1;
      const maj54 = L[0] >= 4 && L[1] >= 4 && L[0] + L[1] >= 9, minors = L[2] >= 5 && L[3] >= 5;
      if (direct) {
        if (maj54 && h >= 12) return R('2♣', 'Landy : les deux majeures (5-4), 12H et plus', true);
        if (minors && h >= 8) return R('2SA', 'Bicolore mineur (5-5)', true);
        for (const i of [0, 1, 2]) if (L[i] >= 6 && h >= 8) return R(sb(2, i), `Naturel : 6 cartes à ${SYM[i]}`);
        if (L[3] >= 6 && h >= 8 && C.canX) return R('X', 'Du ♣ : 6 cartes à ♣ (jamais punitif)', true);
        return P();
      }
      if (maj54 && h >= 12 && C.canX) return R('X', 'Landy avec 12H et plus', true);
      if (maj54 && h >= 8) return R('2♣', 'Landy avec moins de 12H', true);
      if (minors && h >= 8) return R('2SA', 'Bicolore mineur (5-5)', true);
      for (const i of [0, 1, 2, 3]) if (L[i] >= 5 && h >= 8) { const b = i === 3 ? '3♣' : sb(2, i); if (rank(b) > C.last) return R(b, `Naturel : 5 cartes à ${SYM[i]}`); }
      return P();
    }
    // ── Réponse à notre défense sur 1SA
    if (!mine.length && his.length === 1 && C.them.length && C.them[0].b === '1SA' && C.lastBy !== C.seat) {
      const pb = his[0].b, direct = his[0].i === C.them[0].i + 1;
      if (pb === 'X' && direct) {
        const x = [0, 1, 2].find(i => L[i] >= 6);
        if (x !== undefined) { const b = cheapest(C, x); if (b && lvl(b) <= 2) return R(b, `6 cartes à ${SYM[x]}`); }
        return L[3] >= 2 ? R(cheapest(C, 3), 'Je passe ou corrige : on joue à ♣') : R(cheapest(C, longest(e)), 'Pas de ♣ : ma couleur');
      }
      if ((pb === 'X' && !direct) || pb === '2♣') {
        const m = L[1] > L[0] ? 1 : 0, strong = pb === 'X';
        if (h >= (strong ? 10 : 12)) return R(sb(4, m), `Manche dans la majeure préférée`);
        if (h >= (strong ? 7 : 10)) { const b = sb(3, m); if (rank(b) > C.last) return R(b, 'Proposition dans la majeure préférée'); }
        return R(cheapest(C, m), 'Préférence faible');
      }
      if (pb === '2SA') { const m = L[2] > L[3] ? 2 : 3; return R(cheapest(C, m), `Préférence ${SYM[m]}`); }
    }
    // ── Défense : Copenhague directement derrière l'ouvreur (bicolore 5-5)
    if (!mine.length && !his.length && C.them.length === 1 && C.hist.length === C.them[0].i + 1 && rank(C.them[0].b) >= 0 && lvl(C.them[0].b) === 1 && str(C.them[0].b) !== 'SA' && h >= 8 && h <= 16) {
      const o = SI[str(C.them[0].b)], two = [0, 1, 2, 3].filter(i => i !== o && L[i] >= 5);
      if (two.length >= 2) {
        const order = [3, 2, 1, 0].filter(i => i !== o);                 // de la moins chère à la plus chère
        const pair = two.slice(0, 2).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const kind = pair[0] === order[0] && pair[1] === order[1] ? '2SA' : pair[0] === order[0] && pair[1] === order[2] ? '3♣' : pair[0] === order[1] && pair[1] === order[2] ? '3♦' : null;
        if (kind && rank(kind) > C.last) return R(kind, `Copenhague : bicolore ${pair.map(i => SYM[i]).join(' et ')}`, true);
      }
    }
    return null;
  }

  // ───── Point d'entrée
  function bid(handStr, bids, dealer, vulCode, seat, sys) {
    const e = evalHand(handStr), C = context(bids, dealer, seat);
    C.sys = sys === 'raimon' ? 'raimon' : 'sef';
    const vul = vulCode === 'all' || vulCode === sideOf(seat);
    let r = null;
    try {
      const pi = partnerInfo(C);
      if (C.sys === 'raimon') r = raimon(e, C, pi);
      if (!r) r = conventions(e, C, pi);
      if (!r) {
        if (!C.acts.length) r = opening(e, C, vul);
        else if (sideOf(C.opener.seat) === sideOf(seat)) {
          const iOpened = C.opener.seat === seat;
          if (!C.them.length) {
            if (!iOpened && C.mine.length === 0) r = respond(e, C);
            else if (iOpened && C.mine.length === 1 && C.his.length === 1) r = openerRebid(e, C);
          } else if (!iOpened && C.mine.length === 0 && C.his.length >= 1) r = respondOverInterference(e, C);
          if (!r) r = general(e, C, pi);
        } else {
          if (!C.mine.length && !C.his.length) r = overcall(e, C, vul);
          else if (!C.mine.length && C.his.length) r = advance(e, C);
          else r = general(e, C, pi);
        }
      }
    } catch (err) { r = null; }
    // garde-fou : enchère légale, sinon passe
    if (!r || !r.bid) r = P();
    if (r.bid === 'X' && !C.canX) r = P();
    if (r.bid === 'XX' && !C.canXX) r = P();
    if (rank(r.bid) >= 0 && rank(r.bid) <= C.last) r = P();
    return r;
  }

  const api = { bid, evalHand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RaimonBid = api;
})(typeof window !== 'undefined' ? window : this);
