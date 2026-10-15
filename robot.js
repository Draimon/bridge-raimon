// Système Raimon — robot d'enchères à règles :
// tranche 1 = ouvertures de 1SA et 2SA ; tranche 2 = ouvertures d'1 à la couleur (11 à 19H) ;
// tranche 4 = interventions adverses (Lebelson, Truscott, contre d'appel, Copenhague) via compAuction().
// Nord ouvre, Sud répond ; le robot enchérit pour les deux. Il renvoie null quand une situation sort de
// ses règles sûres (chelems, cas non décrits par la fiche) : la donne est alors écartée.
// Utilisable dans Node (génération des donnes) et dans le navigateur.

(function (root) {
  'use strict';
  const HCP = { A: 4, K: 3, Q: 2, J: 1 };
  const SUIT = ['♠', '♥', '♦', '♣'];

  function evalHand(str) {
    const parts = str.split('.').map(p => (p === '-' ? '' : p));
    const len = parts.map(p => p.length);
    const hcp = parts.join('').split('').reduce((s, c) => s + (HCP[c] || 0), 0);
    const sorted = len.slice().sort((a, b) => b - a);
    const balanced = sorted[3] >= 2 && sorted[2] >= 3 || (sorted[0] === 5 && sorted[1] === 3 && sorted[3] === 2) || (sorted.join('') === '4432');
    return { parts, len, hcp, balanced, s: len[0], h: len[1], d: len[2], c: len[3] };
  }
  // Points HLD (règles de Damien et Michèle, 15/10/2026) :
  // - sans fit : H + 1 point par carte au-delà de la 4e dans chaque couleur ;
  // - avec un fit, main de base (celle qui a nommé la couleur) : H + chicane 3 / singleton 2 / doubleton 1, sans points de longueur ;
  // - avec un fit, main de soutien (celle qui soutient ; `known` = atouts promis par le partenaire) : H + chicane 5 / singleton 3 /
  //   doubleton 1, et les atouts au-delà du fit de 8 : le 1er compte 2, les suivants 1 (6 cartes face à 1♠ 5e : 2 + 1 + 1 = 4).
  function hld(e, fit, known) {
    let p = e.hcp;
    if (fit === undefined) { e.len.forEach(l => { if (l > 4) p += l - 4; }); return p; }
    const sup = known !== undefined, short = sup ? [5, 3, 1] : [3, 2, 1];
    e.len.forEach((l, i) => { if (i !== fit && l <= 2) p += short[l]; });
    if (sup) { const extra = e.len[fit] + known - 8; if (extra > 0) p += 2 + (extra - 1); }
    return p;
  }
  const stop = (e, s) => { const p = e.parts[s]; return p.includes('A') || (p.includes('K') && p.length >= 2) || (p.includes('Q') && p.length >= 3); };

  // ───── Chelems : Blackwood Lefèvre (As) et Blackwood 30-41 + CRM sur 1SA
  const rankOf = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + ['♣', '♦', '♥', '♠', 'SA'].indexOf(m[2]) : -1; };
  const aces = e => e.parts.join('').split('').filter(c => c === 'A').length;
  const kings = e => e.parts.join('').split('').filter(c => c === 'K').length;
  // Réponse au 4SA Lefèvre avec l'atout t : [enchère, explication, valeurs possibles]
  function lefevre(e, t) {
    const a = aces(e), k = kings(e), inv = t === 3;
    if (a === 0 || a === 3) return [inv ? '5♦' : '5♣', `0 ou 3 As${inv ? ' (inversé : atout ♣)' : ''}`, [0, 3]];
    if (a === 1 || a === 4) return [inv ? '5♣' : '5♦', `1 ou 4 As${inv ? ' (inversé : atout ♣)' : ''}`, [1, 4]];
    if (k === 0 || k === 3) return ['5♥', '2 As, 0 ou 3 Rois', [2]];
    if (k === 1 || k === 4) return ['5♠', '2 As, 1 ou 4 Rois', [2]];
    return ['5SA', '2 As et 2 Rois', [2]];
  }
  // Réponse au 4♣ (BW 30-41 + CRM) sur 1SA
  function bw41(e) {
    const a = aces(e);
    if (a === 0 || a === 3) return ['4♦', '0 ou 3 As', [0, 3]];
    if (a === 1 || a === 4) return ['4♥', '1 ou 4 As', [1, 4]];
    const [i, j] = [0, 1, 2, 3].filter(x => e.parts[x].includes('A'));
    const black = x => x === 0 || x === 3;
    if (black(i) === black(j)) return ['4♠', '2 As de même couleur (CRM)', [2]];
    if ((i < 2) === (j < 2)) return ['4SA', '2 As de même rang (CRM)', [2]];
    return ['5♣', '2 As mixtes (CRM)', [2]];
  }
  // Lecture d'une réponse « 0 ou 3 » / « 1 ou 4 » : une seule valeur compatible avec ses propres As, sinon donne écartée.
  function readAces(opts, mine) { const ok = opts.filter(x => x + mine <= 4); return ok.length === 1 ? ok[0] : null; }

  // ───── Ouverture de Nord
  function opening(n) {
    if (n.balanced && n.hcp >= 15 && n.hcp <= 17 && n.s < 5 && n.h < 5) return ['1SA', '15-17H régulier'];
    if (n.balanced && n.hcp >= 20 && n.hcp <= 21) return ['2SA', '20-21H régulier'];
    return null;
  }

  // ───── Après 1SA
  function after1SA(n, s) {
    const A = [['1SA', '15-17H régulier']];
    const add = (b, why) => A.push([b, why || '']);
    const major5 = s.s >= 5 ? 0 : s.h >= 5 ? 1 : -1;
    // Bicolore majeur 5-5
    if (s.s >= 5 && s.h >= 5) {
      if (s.hcp <= 5) { add('3♦', 'Bicolore ♥/♠ faible (0-5H)'); const m = n.h > n.s ? '3♥' : '3♠'; add(m, `Il choisit sa meilleure majeure`); add('P', 'Main faible : tu passes'); return A; }
      if (s.hcp <= 12) { add('4♦', 'Bicolore majeur de manche'); const m = n.h > n.s ? '4♥' : '4♠'; add(m, 'Il choisit sa meilleure majeure'); add('P'); return A; }
      return null;
    }
    // Texas majeur
    if (major5 >= 0) {
      const M = major5 === 0 ? '♠' : '♥', other = major5 === 0 ? '♥' : '♠';
      const tx = major5 === 0 ? '2♥' : '2♦';
      const L = s.len[major5], sup = n.len[major5];
      if (s.hcp >= 15) return null;                                   // zone de chelem : hors tranche 1
      add(tx, `Texas ${M} : 5 cartes ou plus à ${M}`);
      // Super-acceptation
      if (n.hcp === 17 && sup >= 3) {
        if (sup >= 4) add('3' + M, `Super-acceptation : 17 points avec 4 cartes à ${M}`);
        else add('2SA', `Super-acceptation : 17 points avec 3 cartes à ${M}`);
        if (s.hcp >= 5 || L >= 6) { add('4' + M, `Fit et un maximum en face : la manche`); add('P'); return A; }
        if (sup >= 4) { add('P', 'Main trop faible même face à un maximum'); return A; }
        add('3' + M, `Main trop faible : tu reviens à 3${M}`); add('P'); return A;
      }
      add('2' + M, 'Il exécute le Texas');
      if (s.hcp <= 5 || (s.hcp <= 7 && L < 6)) { add('P', 'Main faible : on joue la partielle'); return A; }
      if (L === 5 && s.hcp <= 8) {
        add('2SA', `Proposition avec 5 cartes à ${M} (8H)`);
        if (n.hcp >= 16) { if (sup >= 3) add('4' + M, `Maximum avec 3 cartes à ${M}`); else add('3SA', 'Maximum sans fit'); add('P'); return A; }
        if (sup >= 3) { add('3' + M, `Minimum avec 3 cartes à ${M}`); add('P'); return A; }
        add('P', 'Minimum : il passe'); return A;
      }
      if (L >= 6 && s.hcp <= 8) {
        add('3' + M, `Proposition avec 6 cartes à ${M}`);
        if (n.hcp >= 16) { add('4' + M, 'Maximum : il accepte'); add('P'); return A; }
        add('P', 'Minimum : il passe'); return A;
      }
      if (L >= 6) {
        // Votre règle : changement de couleur forcing, puis on recompte en HLD.
        const cands = [0, 1, 2, 3].filter(i => i !== major5 && rankOf('3' + SUIT[i]) < rankOf('3' + M));
        const cs = cands.sort((a, b) => s.len[b] - s.len[a])[0];
        add('3' + SUIT[cs], `Changement de couleur après le Texas : forcing un tour, pour que le partenaire montre son fit`);
        add('3' + M, `Il montre le fit ${M}`);
        const p = hld(s, major5);
        if (p + 16 >= 32) {
          A.theme = 'Chelem sur 1SA';
          add('4SA', `Tu recomptes ta main : ${p} HLD face à 15-17, zone de chelem : Blackwood Lefèvre`);
          const [b, why, opts] = lefevre(n, major5); add(b, why);
          const pa = readAces(opts, aces(s)); if (pa === null) return null;
          const tot = pa + aces(s);
          if (tot <= 2) { if (rankOf('5' + M) <= rankOf(b)) return null; add('5' + M, `Il manque 2 As : on s'arrête à 5${M}`); add('P'); return A; }
          if (tot === 4) return null;                                   // grand chelem : non géré
          add('6' + M, 'Il ne manque qu’un As : petit chelem'); add('P'); return A;
        }
        add('4' + M, `Tu recomptes ta main : ${p} HLD face à 15-17, pas de chelem, tu conclus à 4${M}`);
        add('P'); return A;
      }
      // 5 cartes, valeurs de manche
      const oi = major5 === 0 ? 1 : 0;
      if (L === 5 && s.len[oi] >= 4) {
        const nb = '3' + other;
        add(nb, `Changement de couleur forcing : 4 cartes à ${other}`);
        if (sup >= 3) add('4' + M, `Fit ${M} (3 cartes)`);
        else if (n.len[oi] >= 4) add('4' + other, `Fit ${other}`);
        else add('3SA', 'Ni fit, ni 4 cartes dans ta 2e couleur');
        add('P'); return A;
      }
      add('3SA', `5 cartes à ${M} et la manche : il choisit entre 3SA et 4${M}`);
      if (sup >= 3) { add('4' + M, `3 cartes à ${M} : il choisit 4${M}`); add('P'); return A; }
      add('P', `Seulement 2 cartes à ${M} : 3SA`); return A;
    }
    // Texas mineur faible (♣)
    if (s.c >= 6 && s.hcp <= 7) {
      add('2♠', 'Texas mineur'); add('3♣', 'L’ouvreur dit 3♣'); add('P', 'Main faible avec des ♣ : on joue 3♣'); return A;
    }
    if (s.d >= 6 && s.hcp <= 7) return null;                          // misère à ♦ : non décrite
    // Stayman
    if ((s.s === 4 || s.h === 4) && s.hcp >= 8) {
      if (s.hcp >= 19) return null;
      add('2♣', `Stayman : tu cherches un fit 4-4 ${s.s === 4 && s.h === 4 ? 'en majeure' : 'à ' + (s.s === 4 ? '♠' : '♥')}`);
      const ans = n.h >= 4 ? '2♥' : n.s >= 4 ? '2♠' : '2♦';
      add(ans, ans === '2♥' ? '4 cartes à ♥' : ans === '2♠' ? '4 cartes à ♠ (pas 4 cartes à ♥)' : 'Pas de majeure 4e');
      const fitM = ans === '2♥' && s.h >= 4 ? '♥' : ans === '2♠' && s.s >= 4 ? '♠' : null;
      if (fitM) {
        const t = fitM === '♠' ? 0 : 1, p = hld(s, t, 4);
        if (p + 16 >= 32) {
          A.theme = 'Chelem sur 1SA';
          add('4SA', `Fit ${fitM} et ${p} HLD face à 15-17 : Blackwood Lefèvre`);
          const [b, why, opts] = lefevre(n, t); add(b, why);
          const pa = readAces(opts, aces(s)); if (pa === null) return null;
          const tot = pa + aces(s);
          if (tot <= 2) { if (rankOf('5' + fitM) <= rankOf(b)) return null; add('5' + fitM, `Il manque 2 As : on s'arrête à 5${fitM}`); add('P'); return A; }
          if (tot === 4) return null;                                   // grand chelem : non géré
          add('6' + fitM, 'Il ne manque qu’un As : petit chelem'); add('P'); return A;
        }
        if (p <= 10) { add('3' + fitM, `Fit 4-4 et ${p} HLD : proposition`); if (n.hcp >= 16) { add('4' + fitM, 'Maximum : il accepte'); add('P'); } else add('P', 'Minimum : il passe'); return A; }
        add('4' + fitM, `Fit 4-4 et ${p} HLD : la manche`); add('P'); return A;
      }
      const has4S = ans === '2♥' && s.s >= 4;
      if (s.hcp >= 15) {
        if (has4S) return null;
        A.theme = 'Chelem sur 1SA';
        if (s.hcp <= 16) {
          add('4SA', 'Pas de fit : quantitatif (15-16H)');
          if (n.hcp === 15) { add('P', '15H : il passe'); return A; }
          if (n.hcp === 16) { add('5SA', '16H'); if (s.hcp === 16) { add('6SA', '16 + 16 : le petit chelem'); add('P'); } else add('P', '15 + 16 : on s’arrête'); return A; }
          add('6SA', '17H : petit chelem'); add('P'); return A;
        }
        add('6SA', `Pas de fit et ${s.hcp}H face à 15-17 : petit chelem à SA`); add('P'); return A;
      }
      if (s.hcp <= 8) {
        add('2SA', has4S ? 'Proposition de 3SA (et tu as 4 cartes à ♠)' : 'Pas de fit : proposition de 3SA');
        if (has4S && n.s >= 4) { if (n.hcp >= 16) { add('4♠', 'Les 4 cartes à ♠ et un maximum'); add('P'); } else { add('3♠', 'Les 4 cartes à ♠, minimum'); add('P'); } return A; }
        if (n.hcp >= 16) { add('3SA', 'Maximum : il accepte'); add('P'); } else add('P', 'Minimum : il passe');
        return A;
      }
      add('3SA', has4S ? 'Pas de fit ♥ : 3SA (ton Stayman montrait les ♠)' : 'Pas de fit : 3SA');
      if (has4S && n.s >= 4) { add('4♠', 'Il a aussi 4 cartes à ♠'); add('P'); return A; }
      add('P', ans === '2♥' ? 'Il n’a pas 4 cartes à ♠ : il passe' : 'Il passe'); return A;
    }
    // Sans majeure
    if (s.hcp <= 7) { add('P', 'Moins de 8H : tu passes'); return A; }
    if (s.hcp <= 8) { add('2SA', 'Proposition de 3SA (8H)'); if (n.hcp >= 16) { add('3SA', 'Maximum : il accepte'); add('P'); } else add('P', 'Minimum : il passe'); return A; }
    if (s.hcp <= 14) { add('3SA', 'La manche à SA'); add('P'); return A; }
    if (s.hcp <= 16 && s.balanced) {
      add('4SA', 'Quantitatif (15-16H)');
      if (n.hcp === 15) { add('P', '15H : il passe'); return A; }
      if (n.hcp === 16) { add('5SA', '16H'); if (s.hcp === 16) { add('6SA', '16 + 16 : le petit chelem'); add('P'); } else add('P', '15 + 16 : on s’arrête'); return A; }
      add('6SA', '17H : petit chelem'); add('P'); return A;
    }
    if (s.hcp >= 17 && s.hcp <= 19 && s.balanced) {
      A.theme = 'Chelem sur 1SA';
      add('4♣', `Blackwood 30-41 + CRM : ${s.hcp}H face à 15-17, tu vises le chelem`);
      const [b, why, opts] = bw41(n); add(b, why);
      const pa = readAces(opts, aces(s)); if (pa === null) return null;
      const tot = pa + aces(s);
      if (tot <= 2 || (tot === 4 && s.hcp + n.hcp >= 37)) return null;
      add('6SA', `${tot} As sur 4 : petit chelem`); add('P'); return A;
    }
    return null;
  }

  // ───── Après 2SA
  function after2SA(n, s) {
    const A = [['2SA', '20-21H régulier']];
    const add = (b, why) => A.push([b, why || '']);
    if (s.hcp >= 11) return null;                                       // chelem : hors tranche 1
    if (s.s >= 5 && s.h >= 5) {
      if (s.hcp < 4) return null;
      add('4♦', 'Bicolore majeur (4H et plus)'); add(n.h > n.s ? '4♥' : '4♠', 'Il choisit sa meilleure majeure'); add('P'); return A;
    }
    if (s.s >= 5 && s.h === 4 && s.hcp >= 4) {
      add('3SA', '5♠ et 4♥ (4H et plus)');
      if (n.s >= 3) add('4♠', 'Fit ♠'); else if (n.h >= 4) add('4♥', 'Fit ♥'); else { add('P', 'Pas de fit : 3SA'); return A; }
      add('P'); return A;
    }
    const major5 = s.s >= 5 ? 0 : s.h >= 5 ? 1 : -1;
    if (major5 >= 0) {
      const M = SUIT[major5], tx = major5 === 0 ? '3♥' : '3♦';
      add(tx, `Texas ${M} (dès 0H)`); add('3' + M, 'Il exécute le Texas');
      if (s.hcp < 4) { add('P', 'Main faible : on joue 3' + M); return A; }
      if (s.len[major5] >= 6) { add('4' + M, `6 cartes à ${M} : la manche`); add('P'); return A; }
      add('3SA', `5 cartes à ${M} : il choisit entre 3SA et 4${M}`);
      if (n.len[major5] >= 3) { add('4' + M, `3 cartes à ${M}`); add('P'); return A; }
      add('P', `Pas de fit : 3SA`); return A;
    }
    if ((s.s === 4 || s.h === 4) && s.hcp >= 4) {
      add('3♣', 'Puppet');
      if (n.h >= 5 || n.s >= 5) {
        const m = n.h >= 5 ? '♥' : '♠'; add('3' + m, `5 cartes à ${m}`);
        if (s.len[SUIT.indexOf(m)] >= 3) { add('4' + m, `Fit ${m}`); add('P'); } else { add('3SA', 'Pas de fit'); add('P'); }
        return A;
      }
      if (n.h < 4 && n.s < 4) { add('3SA', 'Ni majeure 4e, ni majeure 5e'); add('P'); return A; }
      add('3♦', 'Au moins une majeure 4e');
      if (s.s === 4 && s.h === 4) {
        add('4♣', 'Les 2 majeures, de manche (moins de 9H)');
        add(n.s >= 4 ? '4♠' : '4♥', `Il a 4 cartes à ${n.s >= 4 ? '♠' : '♥'}`); add('P'); return A;
      }
      if (s.s === 4) {
        add('3♥', 'Inversé : tu montres 4 cartes à ♠');
        if (n.s >= 4) { add('4♠', 'Fit ♠'); add('P'); } else { add('3SA', 'Pas 4 cartes à ♠'); add('P'); }
        return A;
      }
      add('3♠', 'Inversé : tu montres 4 cartes à ♥');
      if (n.h >= 4) { add('4♥', 'Fit ♥'); add('P'); } else { add('3SA', 'Pas 4 cartes à ♥'); add('P'); }
      return A;
    }
    if (s.c >= 6 && s.hcp < 4) { add('3♠', 'Texas ♣ (dès 0H)'); add('4♣', 'Il exécute le Texas'); add('P'); return A; }
    if (s.d >= 6 && s.hcp < 4) { add('4♣', 'Texas ♦ (dès 0H)'); add('4♦', 'Il exécute le Texas'); add('P'); return A; }
    if (s.hcp < 4) { add('P', 'Moins de 4H : tu passes'); return A; }
    add('3SA', 'La manche à SA'); add('P'); return A;
  }

  // ═════ Tranche 2 : ouvertures d'1 à la couleur (11 à 19H), sans intervention ═════
  const NAMES = ['♠', '♥', '♦', '♣'];
  const keyCards = (e, t) => (e.parts.join('').split('').filter(c => c === 'A').length) + (e.parts[t].includes('K') ? 1 : 0);
  const voidSuit = (e, t) => [0, 1, 2, 3].some(i => i !== t && e.len[i] === 0);

  // ───── Enchère d'essai (fit M soutenu à 2)
  const honPts = (e, i) => e.parts[i].split('').reduce((t, c) => t + ({ A: 4, K: 3, Q: 2, J: 1 }[c] || 0), 0);
  const hasControl = (e, i) => { const p = e.parts[i]; return p.length <= 1 || p.includes('A') || (p.includes('K') && p.length === 2); };
  // 2SA = essai généralisé ; 3x = 5 cartes dans x (sous 3M)
  function trialBid(e, M) {
    const xs = [0, 1, 2, 3].filter(x => x !== M && e.len[x] >= 5 && rankOf('3' + NAMES[x]) < rankOf('3' + NAMES[M])).sort((a, b) => e.len[b] - e.len[a]);
    return xs.length ? ['3' + NAMES[xs[0]], 'Essai : 5 cartes à ' + NAMES[xs[0]], xs[0]] : ['2SA', 'Essai généralisé', -1];
  }
  // Réponse selon la zone [bas, milieu, haut] : refus 3M / force dans une couleur / 1er contrôle (manche acceptée)
  function trialAnswer(e, M, zone, last, known) {
    const p = hld(e, M, known), Ms = NAMES[M];
    if (p <= zone[0]) return ['3' + Ms, p + ' HLD, bas de zone : tu refuses', 'non'];
    if (p === zone[1]) {
      const cands = [3, 2, 1, 0].filter(i => i !== M && rankOf('3' + NAMES[i]) > rankOf(last) && rankOf('3' + NAMES[i]) < rankOf('3' + Ms) && honPts(e, i) >= 3);
      const best = cands.sort((a, b) => honPts(e, b) - honPts(e, a))[0];
      if (best === undefined) return ['3' + Ms, p + ' HLD, milieu de zone sans force à montrer : 3' + Ms, 'non'];
      return ['3' + NAMES[best], p + ' HLD, milieu de zone : une force à ' + NAMES[best], 'force', best];
    }
    let cue = null;
    for (const i of [0, 1, 2, 3]) {
      if (i === M || !hasControl(e, i)) continue;
      const b = rankOf('3' + NAMES[i]) > rankOf('3' + Ms) ? '3' + NAMES[i] : '4' + NAMES[i];
      if (rankOf(b) > rankOf(last) && rankOf(b) < rankOf('4' + Ms) && (!cue || rankOf(b) < rankOf(cue[0]))) cue = [b, NAMES[i]];
    }
    if (!cue) return ['4' + Ms, p + ' HLD, haut de zone : la manche', 'oui'];
    return [cue[0], p + ' HLD, haut de zone : tu acceptes la manche et nommes ton 1er contrôle (' + cue[1] + ')', 'oui'];
  }
  // Décision de celui qui a essayé
  function trialEnd(A, add, asker, answerer, M, askP, type, x, forceSuit, ansBid, th) {
    const Ms = NAMES[M];
    const est = type === 'non' ? th.low : type === 'force' ? th.mid : th.other;
    if (askP + est >= 32) {
      add('4SA', 'Zone de chelem : Blackwood Lefèvre');
      const [b, why, opts] = lefevre(answerer, M); add(b, why);
      const pa = readAces(opts, aces(asker)); if (pa === null) return null;
      const tot = pa + aces(asker);
      if (tot <= 2) { if (rankOf('5' + Ms) <= rankOf(b)) return null; add('5' + Ms, "Il manque 2 As : on s'arrête à 5" + Ms); add('P'); return A; }
      if (tot === 4) return null;
      add('6' + Ms, 'Il ne manque qu’un As : petit chelem'); add('P'); return A;
    }
    if (type === 'non') { if (askP >= th.refuse) { add('4' + Ms, 'Assez pour la manche malgré le refus'); add('P'); } else add('P', 'Refus : on joue 3' + Ms); return A; }
    if (type === 'force') {
      if (askP >= th.force || forceSuit === x) { add('4' + Ms, forceSuit === x ? 'La force est dans ta 2e couleur : la manche' : 'Assez pour la manche'); add('P'); }
      else { add('3' + Ms, "On s'arrête à 3" + Ms); add('P'); }
      return A;
    }
    if (ansBid === '4' + Ms) { add('P', 'Manche'); return A; }
    add('4' + Ms, 'La manche'); add('P'); return A;
  }

  // ───── 2 sur 1 (répondant 11H et plus, sans fit 3 cartes)
  function twoOverOne(n, s, M, A, add) {
    const Ms = NAMES[M], r = s.hcp;
    if (r >= 16 || (M === 1 && s.s >= 4)) return null;
    A.theme = '2 sur 1';
    const cand = [3, 2, 1].filter(i => i !== M && rankOf('2' + NAMES[i]) < rankOf('2' + Ms) && s.len[i] >= 5).sort((a, b) => s.len[b] - s.len[a]);
    let x, liar = false;
    if (!cand.length) {
      if (!s.balanced) return null;
      if (r === 12) {
        add('2SA', '12H régulier, pas de fit');
        if (n.len[M] >= 6) { add((n.hcp >= 13 ? '4' : '3') + Ms, '6 cartes à ' + Ms); add('P'); return A; }
        if (n.hcp >= 13) { add('3SA', 'Assez pour la manche'); add('P'); } else add('P', 'Minimum : il passe');
        return A;
      }
      if (r >= 13) { add('3SA', r + 'H régulier, pas de fit'); if (n.len[M] >= 6) { add('4' + Ms, '6 cartes à ' + Ms + ' : la manche en majeure'); add('P'); } else add('P'); return A; }
      x = s.c >= 3 ? 3 : 2; liar = true;
    } else x = cand[0];
    const X = NAMES[x];
    add('2' + X, liar ? '2 sur 1 avec 11H régulier, sans couleur 5e (« mensonge » en mineure)' : '2 sur 1 : 5 cartes à ' + X + ', 11H et plus');
    let reb;
    const y = [1, 2, 3].find(i => i !== M && i !== x && n.len[i] >= 4 && rankOf('2' + NAMES[i]) > rankOf('2' + X) && rankOf('2' + NAMES[i]) < rankOf('2' + Ms));
    if (x === 1 && n.h >= 3) reb = ['3♥', 'Fit ♥ (3 cartes)'];
    else if (x >= 2 && n.len[x] >= 4) reb = ['3' + X, 'Fit ' + X + ' (4 cartes)'];
    else if (n.balanced && n.hcp >= 15 && n.hcp <= 17) reb = ['2SA', '15-17H régulier'];
    else if (n.len[M] >= 6 && n.hcp <= 14) reb = ['2' + Ms, '6 cartes à ' + Ms + ', minimum'];
    else if (y !== undefined && n.hcp <= 16) reb = ['2' + NAMES[y], '2e couleur : 4 cartes à ' + NAMES[y]];
    else if (n.hcp <= 14) reb = ['2' + Ms, 'Minimum (peut être régulier)'];
    else return null;
    add(reb[0], reb[1]);
    const b = reb[0];
    if (b === '3♥') { if (hld(s, 1) + 14 >= 32) return null; add('4♥', 'Fit ♥ : la manche'); add('P'); return A; }
    if (b === '3' + X) { add('3SA', 'Fit mineur mais la manche à SA'); add('P'); return A; }
    if (b === '2SA') { if (r + 16 >= 32) return null; add('3SA', 'Face à 15-17 : la manche'); add('P'); return A; }
    if (r <= 12 && x === 1 && s.h >= 6 && b === '2' + Ms) {
      add('3♥', '6 cartes à ♥ : proposition');
      if (n.hcp >= 13 && n.h >= 2) { add('4♥', 'Haut de zone avec 2 cartes à ♥ : il accepte'); add('P'); } else add('P', 'Il passe');
      return A;
    }
    if (r <= 12) {
      add('2SA', r === 11 && s.balanced ? '11H régulier : proposition' : 'Proposition (11-12H)');
      if (n.len[M] >= 6) { add((n.hcp >= 13 ? '4' : '3') + Ms, n.len[M] + ' cartes à ' + Ms + (n.hcp >= 13 ? ' et haut de zone : la manche' : ', minimum : il répète sa couleur')); add('P'); return A; }
      if (n.hcp >= 13) { add('3SA', 'Haut de zone : il accepte'); add('P'); } else add('P', 'Minimum : il passe');
      return A;
    }
    if (x === 1 && s.h >= 6) { add('4♥', s.h + ' cartes à ♥ : la manche en majeure'); add('P'); return A; }
    add('3SA', 'La manche'); add('P'); return A;
  }

  function openSuit(n) {
    if (n.hcp < 11 || n.hcp > 19) return null;
    if (n.balanced && n.hcp >= 15 && n.hcp <= 17 && n.s < 5 && n.h < 5) return null;   // 1SA
    if (n.s >= 5 || n.h >= 5) return n.s >= n.h ? 0 : 1;
    if (n.d >= 4 && n.d >= n.c) return 2;
    if (n.c >= 4) return 3;
    if (n.s === 4 && n.h === 4 && n.d === 3) return 2;
    return 3;
  }

  function afterMajor(n, s, M) {
    const Ms = NAMES[M], OM = NAMES[M === 0 ? 1 : 0];
    const A = [['1' + Ms, `Ouverture, ${n.len[M]} cartes à ${Ms}`]];
    const add = (b, why) => A.push([b, why || '']);
    const fit = s.len[M];
    if (fit >= 3) {
      const h = hld(s, M, 5);
      if (h < 6) { add('P', 'Moins de 6 HLD : tu passes'); A.theme = 'Ouverture majeure'; return A; }
      if (h <= 10) {
        add('2' + Ms, `Soutien simple : fit ${Ms}, 6-10 HLD (${h})`);
        A.theme = 'Soutien majeur';
        const on = hld(n, M);
        if (on <= 14) { add('P', on + ' HLD : pas de manche, il passe'); return A; }
        if (on <= 16) { add('3' + Ms, on + ' HLD : proposition de manche'); if (h >= 10) { add('4' + Ms, h + ' HLD : tu acceptes'); add('P'); } else add('P', h + ' HLD : tu refuses'); return A; }
        A.theme = 'Enchère d’essai';
        const [tb, tw, tx] = trialBid(n, M); add(tb, tw + ' (' + on + ' HLD)');
        const [ab, aw, at, af] = trialAnswer(s, M, [8, 9, 10], tb, 5); add(ab, aw);
        return trialEnd(A, add, n, s, M, on, at, tx, af, ab, { refuse: 19, force: 18, low: 7, mid: 9, other: 10 });
      }
      if (h <= 12) {
        if (s.hcp >= 8) add(fit >= 4 ? '3♦' : '3♣', `Shadow fit : fit ${Ms} par ${fit >= 4 ? 4 : 3} cartes, 8H et plus, zone 11-12 HLD`);
        else add('3' + Ms, `Shadow fit : fit ${Ms} avec moins de 8H, zone 11-12 HLD`);
        const on = hld(n, M);
        if (on >= 20) return null;
        if (on >= 14) add('4' + Ms, `${on} HLD face à 11-12 : la manche`);
        else if (s.hcp >= 8) add('3' + Ms, `Minimum (${on} HLD) : il s'arrête à 3${Ms}`);
        else { add('P', `Minimum (${on} HLD) : il passe`); A.theme = 'Shadow fit'; return A; }
        add('P'); A.theme = 'Shadow fit'; return A;
      }
      if (h <= 15) {
        const k = keyCards(s, M), chic = voidSuit(s, M);
        if (k > 2) return null;
        let b, why;
        if (chic) { if (k <= 1) { b = '3' + OM; why = `Oklahoma : fit ${Ms}, 0 ou 1 carte clé + une chicane`; } else { b = '4♣'; why = 'Oklahoma : fit, 2 cartes clés + une chicane'; } }
        else if (k <= 1) { b = '4' + Ms; why = `Oklahoma : fit ${Ms}, 0 ou 1 carte clé`; }
        else { b = '4♦'; why = 'Oklahoma : fit, 2 cartes clés'; }
        add(b, why + ` (${h} HLD)`);
        A.theme = 'Oklahoma';
        const nk = keyCards(n, M), rich = hld(n, M) + h >= 32;
        if (rich && (b === '4♣' || b === '4♦') && nk + 2 >= 4) {
          A.theme = 'Oklahoma – chelem';
          if (b === '4♦') { add('6' + Ms, `${nk} cartes clés + 2 en face : petit chelem`); add('P'); return A; }
          add('4♦', 'Relais chelem : où est ta chicane ?');
          const v = [0, 1, 2, 3].find(i => i !== M && s.len[i] === 0);
          const ans = (v <= 1 ? '4' : '5') + NAMES[v];
          add(ans, `Chicane à ${NAMES[v]}`);
          const waste = n.parts[v].replace(/[^AKQ]/g, '').length;
          if (waste >= 2) { add(ans[0] === '4' && M === 0 ? '4♠' : '5' + Ms, `Ses honneurs à ${NAMES[v]} sont perdus en face de ta chicane : il s'arrête`); add('P'); return A; }
          add('6' + Ms, 'Les cartes clés et pas de gaspillage en face de la chicane : petit chelem'); add('P'); return A;
        }
        if (rich && nk >= 3) return null;                             // autres cas de chelem : non couverts
        if (b !== '4' + Ms) add('4' + Ms, 'Pas de chelem en vue : il conclut à la manche');
        add('P'); return A;
      }
      return null;
    }
    if (s.hcp < 6) { add('P', 'Moins de 6H et pas de fit : tu passes'); A.theme = 'Ouverture majeure'; return A; }
    if (s.hcp > 10) return twoOverOne(n, s, M, A, add);
    if (M === 1 && s.s >= 4) {
      add('1♠', '4 cartes ou plus à ♠ : forcing');
      A.theme = '1♥ – 1♠';
      if (n.s >= 4) {
        const on = hld(n, 0, 4);
        if (on >= 20) return null;
        if (on >= 17) { add('3♠', `Fit ♠ et 17 HLD ou plus (${on})`); if (hld(s, 0) >= 8) { add('4♠', 'Tu acceptes la manche'); add('P'); } else add('P', 'Minimum : tu passes'); return A; }
        add('2♠', `Fit ♠, 11-16 HLD (${on})`); add('P', 'Pas de manche possible : tu passes'); return A;
      }
      if (n.balanced) {
        if (n.hcp <= 14) { add('1SA', 'Régulier, 12-14H'); if (s.s >= 6) { add('2♠', '6 cartes à ♠, main faible'); add('P'); return A; } add('P', 'Pas de manche : tu passes'); return A; }
        return null;
      }
      if (n.h >= 6) {
        if (n.hcp >= 15 && hld(n) >= 17) { add('3♥', '6 cartes à ♥, 17-19 HLD'); if (s.h >= 2 || s.hcp >= 8) { add('4♥', `${s.h >= 2 ? 'Fit ♥ (6 cartes en face)' : 'Assez de points'} : tu acceptes la manche`); add('P'); } else add('P', 'Singleton ♥ et minimum : tu passes'); return A; }
        if (n.hcp > 16) return null;
        add('2♥', '6 cartes à ♥, minimum'); if (s.s >= 6 && s.h <= 1) { add('2♠', '6 cartes à ♠ et singleton ♥'); add('P'); return A; } add('P', 'Tu passes'); return A;
      }
      const m = n.d >= 4 && n.d >= n.c ? 2 : n.c >= 4 ? 3 : -1;
      if (m < 0 || n.hcp > 16) return null;
      add('2' + NAMES[m], `2e couleur : 4 cartes ou plus à ${NAMES[m]}`);
      if (s.s >= 5 && s.h <= 1) { add('2♠', `${s.s} cartes à ♠ et pas de préférence ♥`); add('P'); }
      else if (s.h >= 2 && s.h >= s.len[m]) { add('2♥', 'Préférence pour les ♥'); add('P'); } else add('P', `Tu préfères les ${NAMES[m]} : tu passes`);
      return A;
    }
    add('1SA', 'Pas de fit, 6-10H');
    A.theme = 'Majeure – 1SA';
    if (n.hcp >= 17) return null;
    if (n.len[M] >= 6) { add('2' + Ms, `6 cartes à ${Ms}`); add('P', 'Tu passes'); return A; }
    const others = [0, 1, 2, 3].filter(i => i !== M && n.len[i] >= 4).sort((a, b) => n.len[b] - n.len[a] || a - b);
    if (others.length) {
      const x = others[0];
      if (x < M) return null;                                       // 2♠ sur 1♥ = bicolore cher
      add('2' + NAMES[x], `2e couleur : 4 cartes ou plus à ${NAMES[x]}`);
      if (s.len[M] >= 2 && s.len[M] >= s.len[x]) { add('2' + Ms, `Préférence pour les ${Ms}`); add('P'); } else add('P', `Tu préfères les ${NAMES[x]} : tu passes`);
      return A;
    }
    if (n.balanced) { add('P', 'Régulier minimum : il passe'); return A; }
    return null;
  }

  function afterMinor(n, s, m) {
    const ms = NAMES[m];
    const why0 = m === 2 ? (n.d >= 4 ? 'Ouverture, 4 cartes ou plus à ♦' : '4-4 en majeures et 3 cartes à ♦ : 1♦') : 'Ouverture, meilleure mineure';
    const A = [['1' + ms, why0]];
    const add = (b, why) => A.push([b, why || '']);
    const r = s.hcp;
    if (r < 6) { add('P', 'Moins de 6H : tu passes'); A.theme = 'Ouverture mineure'; return A; }
    // Réponse en majeure
    if (s.h >= 4 || s.s >= 4) {
      if (r >= 18) return null;
      const M = s.h >= 4 && !(s.s >= 5 && s.s >= s.h) ? 1 : 0, Ms = NAMES[M], L = s.len[M];
      add('1' + Ms, `${L} cartes à ${Ms}${s.h >= 4 && s.s >= 4 && L === 4 ? ' (avec 4-4 en majeures, les ♥ d’abord)' : ''}`);
      A.theme = 'Mineure – majeure';
      let reb;
      if (n.len[M] >= 4) { const on = hld(n, M, 4); if (on >= 20) return null; reb = on >= 17 ? ['3' + Ms, `Fit ${Ms}, 17 HLD ou plus (${on})`] : ['2' + Ms, `Fit ${Ms}, 11-16 HLD (${on})`]; }
      else if (M === 1 && n.s >= 4) reb = ['1♠', '4 cartes à ♠'];
      else if (n.balanced && n.hcp <= 14) reb = ['1SA', 'Régulier, 12-14H'];
      else if (n.balanced && n.hcp >= 18) reb = ['2SA', '18-19H régulier, sans fit'];
      else if (n.len[m] >= 6 && n.hcp >= 15 && hld(n) >= 17) reb = ['3' + ms, `6 cartes à ${ms}, 17-19 HLD`];
      else if (n.len[m] >= 6 && n.hcp <= 16) reb = ['2' + ms, `6 cartes à ${ms}, minimum`];
      else if (m === 2 && n.c >= 4 && n.hcp <= 16) reb = ['2♣', '2e couleur : 4 cartes ou plus à ♣'];
      else if (m === 3 && n.c >= 5 && n.hcp <= 16) reb = ['2♣', '5 cartes à ♣, minimum'];
      else return null;
      add(reb[0], reb[1]);
      const b = reb[0];
      if (b === '2' + Ms) {
        const h = hld(s, M);
        if (h <= 10) { add('P', 'Pas de manche : tu passes'); return A; }
        A.theme = 'Enchère d’essai';
        const [tb, tw, tx] = trialBid(s, M); add(tb, tw + ' (' + h + ' HLD)');
        const [ab, aw, at, af] = trialAnswer(n, M, [13, 14, 16], tb, 4); add(ab, aw);
        return trialEnd(A, add, s, n, M, h, at, tx, af, ab, { refuse: 13, force: 12, low: 12, mid: 14, other: 15.5 });
      }
      if (b === '3' + Ms) { const h = hld(s, M); if (h >= 14) return null; if (h >= 8) { add('4' + Ms, 'Tu acceptes la manche'); add('P'); } else add('P', 'Minimum : tu passes'); return A; }
      if (b === '1♠') {
        if (s.s >= 4) {
          const h = hld(s, 0, 4);
          if (h >= 18) return null;
          if (h >= 13) { add('4♠', `Fit ♠ et ${h} HLD : la manche`); add('P'); return A; }
          if (h >= 10) { add('3♠', `Fit ♠, proposition (${h} HLD)`); if (hld(n, 0) >= 14) { add('4♠', 'Haut de zone : il accepte'); add('P'); } else add('P', 'Bas de zone : il passe'); return A; }
          add('2♠', `Fit ♠, ${h} HLD`); if (hld(n, 0) > 16) return null; add('P'); return A;
        }
        if (r >= 18) return null;
        if (r >= 13) { add('3SA', 'Pas de fit, la manche'); add('P'); return A; }
        if (r >= 11) { add('2SA', 'Pas de fit, proposition (11-12H)'); if (n.hcp >= 14) { add('3SA', 'Haut de zone : il accepte'); add('P'); } else add('P', 'Bas de zone : il passe'); return A; }
        if (s.h >= 6) { add('2♥', '6 cartes à ♥, faible'); add('P'); return A; }
        add('1SA', 'Pas de fit, 6-10H'); add('P'); return A;
      }
      if (b === '1SA') {
        if (L >= 5 && r >= 11) {
          if (r >= 18) return null;
          A.theme = 'Roudy';
          add('2♣', `Roudy : 5 cartes à ${Ms}, tu cherches le fit et la force`);
          const mini = n.hcp <= 12, fitO = n.len[M] >= 3;
          const ans = !fitO && mini ? ['2♦', 'Minimum, pas de fit'] : fitO && mini ? ['2' + Ms, 'Minimum avec fit (3 cartes)'] : fitO ? ['2' + NAMES[M === 0 ? 1 : 0], 'Maximum avec fit (3 cartes)'] : ['2SA', 'Maximum, pas de fit'];
          add(ans[0], ans[1]);
          const est = mini ? 12 : 14;
          if (fitO) {
            if (hld(s, M) + est >= 25) { add('4' + Ms, 'Fit et assez de points : la manche'); add('P'); return A; }
            if (ans[0] === '2' + Ms) { add('P', 'Fit mais pas de manche : tu passes'); return A; }
            add('3' + Ms, 'Fit, on s’arrête à 3'); add('P'); return A;
          }
          if (r + est >= 25) { add('3SA', 'Pas de fit, assez pour la manche'); add('P'); return A; }
          if (ans[0] === '2♦') { add('2SA', 'Pas de fit, on s’arrête'); add('P'); return A; }
          add('P', 'Pas de manche : tu passes'); return A;
        }
        if (r <= 10) { if (L >= 6) { add('2' + Ms, `6 cartes à ${Ms}, faible`); add('P'); } else add('P', 'Pas de manche : tu passes'); return A; }
        if (r <= 12) { add('2SA', 'Proposition (11-12H)'); if (n.hcp >= 13) { add('3SA', 'Haut de zone : il accepte'); add('P'); } else add('P', 'Bas de zone : il passe'); return A; }
        if (r >= 18) return null;
        add('3SA', 'La manche'); add('P'); return A;
      }
      if (b === '2SA') {
        if (r >= 13) return null;
        if (M === 0 && (L >= 5 || s.h >= 4)) {
          A.theme = 'Check-Back Stayman';
          add('3♣', `Check-Back Stayman : ${L >= 5 ? '5 cartes à ♠' : ''}${L >= 5 && s.h >= 4 ? ' et ' : ''}${s.h >= 4 ? '4 cartes à ♥' : ''}`);
          const fS = n.s >= 3, h4 = n.h >= 4;
          const ans = fS && h4 ? ['3♦', 'Fit ♠ (3 cartes) et 4 cartes à ♥'] : h4 ? ['3♥', '4 cartes à ♥'] : fS ? ['3♠', 'Fit ♠ par 3 cartes'] : ['3SA', 'Rien : ni fit ♠, ni 4 cartes à ♥'];
          add(ans[0], ans[1]);
          if (L >= 5 && fS) { add('4♠', 'Fit ♠ : la manche à ♠'); add('P'); return A; }
          if (s.h >= 4 && h4) { add('4♥', 'Fit 4-4 à ♥'); add('P'); return A; }
          if (ans[0] === '3SA') { add('P', 'Pas de fit : 3SA'); return A; }
          add('3SA', 'Pas de fit : 3SA'); add('P'); return A;
        }
        if (M === 1 && (L >= 5 || s.s >= 4)) return null;
        add('3SA', 'Face à 18-19 : la manche'); add('P'); return A;
      }
      if (b === '2' + ms || b === '2♣') {
        if (r >= 18) return null;
        if (r >= 13) { add('3SA', 'La manche à SA'); add('P'); return A; }
        if (r >= 11) { add('2SA', 'Proposition (11-12H)'); if (n.hcp >= 14) { add('3SA', 'Haut de zone : il accepte'); add('P'); } else add('P', 'Bas de zone : il passe'); return A; }
        if (L >= 6) { add('2' + Ms, `${L} cartes à ${Ms}, main faible`); add('P'); return A; }
        if (b === '2♣' && m === 2 && s.d >= s.c) { add('2♦', 'Préférence pour les ♦'); add('P'); return A; }
        add('P', 'Pas de manche : tu passes'); return A;
      }
      if (b === '3' + ms) { if (r >= 14) return null; if (L >= 6) { add('4' + Ms, `${L} cartes à ${Ms} : la manche en majeure`); add('P'); return A; } if (r >= 8) { add('3SA', 'Assez pour la manche'); add('P'); } else add('P', 'Minimum : tu passes'); return A; }
      return null;
    }
    // Pas de majeure 4e
    if (m === 3 && s.d >= 4) {
      add('1♦', '4 cartes ou plus à ♦ (pas de majeure 4e)'); A.theme = '1♣ – 1♦';
      let reb;
      if (n.h >= 4) reb = ['1♥', '4 cartes à ♥'];
      else if (n.s >= 4) reb = ['1♠', '4 cartes à ♠'];
      else if (n.balanced && n.hcp <= 14) reb = ['1SA', 'Régulier, 12-14H'];
      else if (n.balanced && n.hcp >= 18) reb = ['2SA', '18-19H régulier'];
      else if (n.d >= 4 && n.hcp <= 16) reb = ['2♦', 'Fit ♦'];
      else if (n.c >= 6 && n.hcp <= 16) reb = ['2♣', '6 cartes à ♣, minimum'];
      else return null;
      add(reb[0], reb[1]);
      if (r >= 18) return null;
      if (reb[0] === '2SA') { if (r >= 13) return null; add('3SA', 'Face à 18-19 : la manche'); add('P'); return A; }
      if (r >= 13) { add('3SA', 'La manche à SA'); add('P'); return A; }
      if (r >= 11) { add('2SA', 'Proposition (11-12H)'); if (n.hcp >= 14) { add('3SA', 'Haut de zone : il accepte'); add('P'); } else add('P', 'Bas de zone : il passe'); return A; }
      if (reb[0] === '1♥' || reb[0] === '1♠') { add('1SA', 'Pas de fit, 6-10H'); add('P'); return A; }
      add('P', 'Pas de manche : tu passes'); return A;
    }
    if (s.balanced) {
      A.theme = 'Mineure – SA';
      if (r <= 10) {
        add('1SA', 'Régulier, 6-10H, pas de majeure 4e');
        if (n.balanced && n.hcp <= 14) { add('P', 'Régulier minimum : il passe'); return A; }
        if (n.balanced && n.hcp >= 18) { add('2SA', '18-19H régulier'); if (r >= 8) { add('3SA', 'Tu acceptes'); add('P'); } else add('P', 'Minimum : tu passes'); return A; }
        if (n.len[m] >= 6 && n.hcp <= 16) { add('2' + ms, `6 cartes à ${ms}`); add('P'); return A; }
        return null;
      }
      if (r === 12) { if (!n.balanced && n.len[m] >= 6) return null; add('2SA', '12H régulier, pas de majeure 4e'); if (n.hcp >= 13) { add('3SA', 'Assez pour la manche'); add('P'); } else add('P', 'Minimum : il passe'); return A; }
      if (r >= 13 && r <= 15) { add('3SA', '13-15H régulier, pas de majeure 4e'); add('P'); return A; }
      return null;
    }
    const raise = (m === 2 && s.d >= 4) || (m === 3 && s.c >= 5);
    if (raise && r <= 12) {
      A.theme = 'Soutien mineur';
      if (r <= 10) { add('2' + ms, `Soutien ${ms}, 6-10H`); if (n.hcp > 16) return null; add('P', 'Il passe'); return A; }
      add('3' + ms, `Soutien ${ms}, 11-12H, proposition`);
      if (n.hcp >= 14) { add('3SA', 'Haut de zone : la manche à SA'); add('P'); } else add('P', 'Bas de zone : il passe');
      return A;
    }
    return null;
  }

  // ═════ Tranche 4 : interventions adverses ═════
  // compAuction(H, v) : H = { N, E, S, O } (mains), v = vulnérabilité ('none' | 'NS' | 'EO' | 'all').
  // Renvoie { d: donneur, a: séquence complète (tous les joueurs), theme } ou null.
  // Termine une séquence par exactement 3 passes après la dernière enchère (en gardant leurs explications).
  function closeAuction(A) {
    let last = -1; A.forEach(([b], i) => { if (b !== 'P') last = i; });
    const tail = A.slice(last + 1, last + 4).filter(x => x[0] === 'P');
    while (tail.length < 3) tail.push(['P']);
    return A.slice(0, last + 1).concat(tail);
  }
  const quietHand = (x, max) => x.hcp <= max && Math.max(...x.len) <= 5;   // un joueur qui n'a rien à dire

  function compAuction(H, v) {
    const e = { N: evalHand(H.N), E: evalHand(H.E), S: evalHand(H.S), O: evalHand(H.O) };
    const vulEO = v === 'EO' || v === 'all';
    return lebelsonDeal(e, vulEO) || truscottDeal(e) || takeoutDeal(e) || copenhagueDeal(e) || null;
  }

  // 1SA – (2♦/2♥/2♠) : Lebelson
  function lebelsonDeal(e, vulEO) {
    const n = e.N, E = e.E, s = e.S;
    const op = opening(n);
    if (!op || op[0] !== '1SA' || !quietHand(e.O, 7)) return null;
    const xs = [0, 1, 2].filter(i => E.len[i] >= 5).sort((a, b) => E.len[b] - E.len[a] || a - b);
    if (!xs.length || E.hcp < (vulEO ? 10 : 8) || E.hcp > 15) return null;
    const x = xs[0], X = SUIT[x], cue = '3' + X;
    const A = [['1SA', '15-17H régulier'], ['2' + X, `Intervention (adversaire) : ${E.len[x]} cartes à ${X}`]];
    const P = () => A.push(['P']);
    const res = () => ({ d: 'N', a: closeAuction(A), theme: 'Lebelson' });
    if (s.hcp >= 16 || (s.hcp >= 8 && s.hcp <= 9)) return null;
    const relay = why => { A.push(['2SA', why || 'Lebelson : passage par 2SA (l’ouvreur dira 3♣)']); P(); A.push(['3♣', 'Obligatoire sur 2SA']); P(); };
    if (s.hcp <= 7) {
      if (s.c >= 6) { relay(); A.push(['P', 'Misère à ♣ : on joue 3♣']); P(); P(); return res(); }
      if (s.d >= 6 && x !== 2) { relay(); A.push(['3♦', 'Misère à ♦ : on joue 3♦']); P(); A.push(['P']); P(); return res(); }
      A.push(['P', 'Main faible : tu passes']); P(); A.push(['P']); return res();
    }
    const st = stop(s, x), um = [0, 1].filter(i => i !== x);
    const five = um.find(i => s.len[i] >= 5), four = um.filter(i => s.len[i] === 4);
    if (five !== undefined) {
      const M = SUIT[five];
      if (st) A.push(['3' + M, `5 cartes à ${M} avec arrêt ${X}`]);
      else { relay(); A.push(['3' + M, `2SA puis 3${M} : 5 cartes à ${M} sans arrêt ${X}`]); }
      P();
      if (n.len[five] >= 3) A.push(['4' + M, `3 cartes à ${M} : la manche`]);
      else if (st || stop(n, x)) A.push(['3SA', `Pas de fit${st ? '' : ' mais l’arrêt ' + X}`]);
      else return null;
      P(); A.push(['P']); P(); return res();
    }
    if (four.length) {
      if (st) A.push([cue, `Cue-bid direct : Stayman avec arrêt ${X}`]);
      else { relay(); A.push([cue, `2SA puis cue-bid : Stayman sans arrêt ${X}`]); }
      P();
      const nm = um.find(i => n.len[i] >= 4 && s.len[i] >= 4) ?? um.find(i => n.len[i] >= 4);
      if (nm !== undefined) {
        const b3 = '3' + SUIT[nm];
        const bid = rankOf(b3) > rankOf(cue) ? b3 : '4' + SUIT[nm];
        A.push([bid, `4 cartes à ${SUIT[nm]}`]); P();
        if (s.len[nm] >= 4) { if (bid[0] === '3') { A.push(['4' + SUIT[nm], 'Fit 4-4 : la manche']); P(); A.push(['P']); P(); } else { A.push(['P', 'Fit 4-4 : la manche']); P(); A.push(['P']); } return res(); }
        if (!st && !stop(n, x)) return null;
        A.push(['3SA', 'Pas de fit' + (st ? '' : ', mais l’arrêt ' + X)]); if (rankOf('3SA') <= rankOf(bid)) return null; P(); A.push(['P']); P(); return res();
      }
      if (!st && !stop(n, x)) return null;
      A.push(['3SA', 'Pas de majeure 4e' + (st ? '' : ', mais l’arrêt ' + X)]); P(); A.push(['P']); P(); return res();
    }
    if (st) { A.push(['3SA', `3SA direct : conclusion avec arrêt ${X}`]); P(); A.push(['P']); P(); return res(); }
    if (!stop(n, x)) return null;
    relay(); A.push(['3SA', `2SA puis 3SA : conclusion sans arrêt ${X}`]); P(); A.push(['P', `Il a l’arrêt ${X} : il passe`]); P(); return res();
  }

  // 1x – (X) : Truscott (avec un fit)
  function truscottDeal(e) {
    const n = e.N, E = e.E, s = e.S;
    const t = openSuit(n);
    if (t === null || !quietHand(e.O, 6)) return null;
    const others = [0, 1, 2, 3].filter(i => i !== t);
    if (!(E.hcp >= 12 && E.hcp <= 16 && E.len[t] <= 1 && others.every(i => E.len[i] >= 3))) return null;
    const T = SUIT[t];
    const A = [['1' + T, t <= 1 ? `Ouverture, ${n.len[t]} cartes à ${T}` : 'Ouverture'], ['X', "Contre d'appel (adversaire)"]];
    const P = () => A.push(['P']);
    const res = () => ({ d: 'N', a: closeAuction(A), theme: 'Truscott' });
    const h = s.hcp, fit = s.len[t];
    if (t <= 1) {
      if (fit < 3 || s.len[1 - t] >= 4 || h >= 16) return null;
      if (h >= 13) { if (hld(n, t) + 14 >= 32) return null; A.push(['3SA', `Truscott : fit ${T}, 13-15H`]); P(); A.push(['4' + T, 'Il conclut la manche à la couleur']); P(); A.push(['P']); P(); return res(); }
      if (h >= 11) { A.push(['2SA', `Truscott : fit ${T}, 11-12H`]); P(); const on = hld(n, t); A.push([on >= 14 ? '4' + T : '3' + T, on >= 14 ? `${on} HLD : la manche` : `${on} HLD : il s'arrête à 3${T}`]); P(); A.push(['P']); P(); return res(); }
      if (hld(s, t, 5) >= 6 && h <= 10) {
        if (hld(n, t) >= 18) return null;
        A.push([fit >= 4 ? '3' + T : '2' + T, `Fit direct = barrage (${fit} cartes, moins de 11H)`]); P(); A.push(['P', 'Il passe']); P(); return res();
      }
      return null;
    }
    if (fit < 4 || s.h >= 4 || s.s >= 4 || h >= 12) return null;
    if (h >= 10) { A.push(['3SA', `Truscott : fit ${T}, 10-11H`]); P(); A.push(['P']); P(); return res(); }
    if (h >= 8) { A.push(['2SA', `Truscott : fit ${T}, 8-9H`]); P(); A.push([n.hcp >= 15 ? '3SA' : '3' + T, n.hcp >= 15 ? 'Assez pour la manche' : `Minimum : il s'arrête à 3${T}`]); P(); A.push(['P']); P(); return res(); }
    if (h >= 4 && fit >= 5) { A.push(['3' + T, 'Fit direct = barrage']); P(); A.push(['P']); P(); return res(); }
    return null;
  }

  // (1x) – X : ton contre d'appel, réponses du partenaire par paliers
  function takeoutDeal(e) {
    const E = e.E, s = e.S, n = e.N;
    const x = openSuit(E);
    if (x === null || x === 0 || E.hcp > 15 || !quietHand(e.O, 5)) return null;
    const others = [0, 1, 2, 3].filter(i => i !== x);
    if (!(s.hcp >= 12 && s.hcp <= 16 && s.len[x] <= 2 && others.every(i => s.len[i] >= 3) && s.s < 5 && s.h < 5)) return null;
    if (s.balanced && s.hcp >= 16 && stop(s, x)) return null;               // 1SA d'intervention
    const X = SUIT[x];
    const A = [['1' + X, 'Ouverture (adversaire)'], ['X', `Contre d'appel : ${s.hcp}H, court à ${X}`], ['P']];
    const P = () => A.push(['P']);
    const res = () => ({ d: 'E', a: closeAuction(A), theme: 'Contre d’appel' });
    const um = [0, 1].filter(i => i !== x && n.len[i] >= 4).sort((a, b) => n.len[b] - n.len[a] || b - a);
    const lvl = i => (rankOf('1' + SUIT[i]) > rankOf('1' + X) ? 1 : 2);
    const r = n.hcp;
    if (r >= 11) {
      if (r <= 12 && stop(n, x) && !um.length) { A.push(['2SA', `11-12H avec arrêt ${X}`]); P(); A.push([s.hcp >= 13 ? '3SA' : 'P', s.hcp >= 13 ? 'Assez pour la manche' : 'Minimum : tu passes']); if (s.hcp >= 13) { P(); A.push(['P']); P(); } else { P(); A.push(['P']); } return res(); }
      return null;
    }
    let bid, kind;
    if (um.length) {
      const M = um[0], base = lvl(M);
      if (r <= 7) { bid = base + SUIT[M]; kind = 0; A.push([bid, `0-7H : palier ${base === 1 ? 1 : '1 (la moins chère)'}, ${n.len[M]} cartes à ${SUIT[M]}`]); }
      else if (n.len[M] === 4) { bid = (base + 1) + SUIT[M]; kind = 4; A.push([bid, `Palier 2 (saut) : 8-10H avec 4 cartes à ${SUIT[M]}`]); }
      else { bid = (base + 2) + SUIT[M]; kind = 5; A.push([bid, `Palier 3 : 8-10H avec 5 cartes à ${SUIT[M]}`]); }
      P();
      const sm = hld(s, M, kind === 5 ? 5 : 4);
      if (kind === 0) { A.push(['P', 'Ton partenaire a 0-7H : tu passes']); P(); A.push(['P']); return res(); }
      if (kind === 4) {
        if (sm >= 16) { A.push(['4' + SUIT[M], `${sm} HLD face à 8-10H : la manche`]); P(); A.push(['P']); P(); return res(); }
        if (sm >= 14 && bid[0] === '2') { A.push(['3' + SUIT[M], `${sm} HLD : proposition`]); P(); A.push([r >= 10 ? '4' + SUIT[M] : 'P', r >= 10 ? 'Haut de zone : il accepte' : 'Bas de zone : il passe']); if (r >= 10) { P(); A.push(['P']); P(); } else { P(); A.push(['P']); } return res(); }
        A.push(['P', 'Pas de manche : tu passes']); P(); A.push(['P']); return res();
      }
      if (sm >= 14 && bid[0] === '3') { A.push(['4' + SUIT[M], `${sm} HLD face à 8-10H avec 5 cartes : la manche`]); P(); A.push(['P']); P(); return res(); }
      A.push(['P', 'Pas de manche : tu passes']); P(); A.push(['P']); return res();
    }
    if (r <= 7) {
      const m = [3, 2].filter(i => i !== x).sort((a, b) => n.len[b] - n.len[a])[0];
      A.push([lvl(m) + SUIT[m], `0-7H : la couleur la moins chère (${n.len[m]} cartes à ${SUIT[m]})`]); P();
      A.push(['P', 'Ton partenaire a 0-7H : tu passes']); P(); A.push(['P']); return res();
    }
    if (!stop(n, x)) return null;
    A.push(['1SA', `8-10H avec arrêt ${X}`]); P();
    if (s.hcp >= 15) { A.push(['2SA', 'Proposition de manche']); P(); A.push([r >= 10 ? '3SA' : 'P', r >= 10 ? 'Haut de zone : il accepte' : 'Bas de zone : il passe']); if (r >= 10) { P(); A.push(['P']); P(); } else { P(); A.push(['P']); } return res(); }
    A.push(['P', 'Pas de manche : tu passes']); P(); A.push(['P']); return res();
  }

  // (1x) – Copenhague : 2SA = 2 moins chères, 3♣ = extrêmes, 3♦ = 2 plus chères
  function copenhagueDeal(e) {
    const E = e.E, s = e.S, n = e.N;
    const x = openSuit(E);
    if (x === null || E.hcp > 15 || !quietHand(e.O, 6)) return null;
    if (s.hcp < 6 || s.hcp > 12) return null;
    const unbid = [3, 2, 1, 0].filter(i => i !== x);                            // du moins cher au plus cher
    const two = unbid.filter(i => s.len[i] >= 5);
    if (two.length !== 2) return null;
    const X = SUIT[x];
    const pairs = [[unbid[0], unbid[1], '2SA', 'les 2 moins chères'], [unbid[0], unbid[2], '3♣', 'les extrêmes'], [unbid[1], unbid[2], '3♦', 'les 2 plus chères']];
    const pr = pairs.find(p => two.includes(p[0]) && two.includes(p[1]));
    const A = [['1' + X, 'Ouverture (adversaire)'], [pr[2], `Copenhague : bicolore 5/5 ${SUIT[pr[0]]} + ${SUIT[pr[1]]} (${pr[3]})`], ['P']];
    const P = () => A.push(['P']);
    const res = () => ({ d: 'E', a: closeAuction(A), theme: 'Copenhague' });
    const pick = [pr[0], pr[1]].sort((a, b) => n.len[b] - n.len[a] || a - b)[0];
    const Y = SUIT[pick];
    if (pick <= 1 && hld(n, pick, 5) >= 12) { A.push(['4' + Y, `Il choisit les ${Y} et a de quoi jouer la manche`]); P(); A.push(['P']); P(); return res(); }
    if (pr[2] === '2SA' && n.hcp >= 13) {
      A.push(['4SA', '« Choisis » : il jouera ta meilleure mineure au palier de 5']); P();
      const m = s.d >= s.c ? 2 : 3;
      A.push(['5' + SUIT[m], s.d === s.c ? 'Même longueur : la plus chère' : `Ta mineure la plus longue (${SUIT[m]})`]); P(); A.push(['P']); P(); return res();
    }
    const b3 = '3' + Y;
    if (b3 === pr[2]) { A.push(['P', `Il choisit les ${Y} : on joue ${b3}`]); P(); A.push(['P']); return res(); }
    if (rankOf(b3) <= rankOf(pr[2])) return null;
    A.push([b3, `Il choisit les ${Y}`]); P(); A.push(['P']); P(); return res();
  }

  // Séquence complète, donneur Nord, adversaires qui passent. Renvoie null si hors règles.
  function auction(northStr, southStr) {
    const n = evalHand(northStr), s = evalHand(southStr);
    const op = opening(n);
    let ours;
    if (op) ours = op[0] === '1SA' ? after1SA(n, s) : after2SA(n, s);
    else {
      const t = openSuit(n);
      if (t === null) return null;
      ours = t <= 1 ? afterMajor(n, s, t) : afterMinor(n, s, t);
    }
    if (!ours) return null;
    const th = ours.theme;
    // Nos enchères alternent N, S ; on intercale le passe de l'adversaire après chacune.
    // Notre séquence finit toujours par un passe : la donne se termine donc par 3 passes.
    if (ours[ours.length - 1][0] !== 'P') return null;
    const full = ours.flatMap(x => [x, ['P']]);
    if (th) full.theme = th;
    return full;
  }

  const theme = a => {
    if (a.theme) return a.theme;
    const b = a.map(x => x[0]);
    if (b[0] === '2SA') return b[2] === '3♣' ? 'Puppet' : ['3♦', '3♥', '3♠', '4♣'].includes(b[2]) ? 'Texas sur 2SA' : 'Sur 2SA';
    const r = b[2];
    return r === '2♣' ? 'Stayman' : r === '2♦' || r === '2♥' ? 'Texas' : r === '2♠' ? 'Texas mineur' : r === '3♦' || r === '4♦' ? 'Bicolore majeur' : r === '4SA' ? 'Quantitatif' : 'Sur 1SA';
  };

  const api = { evalHand, hld, opening, auction, compAuction, theme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RaimonRobot = api;
})(this);
