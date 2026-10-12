// Système Raimon — robot d'enchères à règles (tranche 1 : ouvertures de 1SA et 2SA, sans intervention).
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
  // Points de longueur + distribution (HLD) avec un fit dans la couleur `fit`.
  function hld(e, fit) {
    let p = e.hcp;
    e.len.forEach(l => { if (l > 4) p += l - 4; });
    if (fit !== undefined) e.len.forEach((l, i) => { if (i !== fit) p += l === 0 ? 3 : l === 1 ? 2 : l === 2 ? 1 : 0; });
    return p;
  }
  const stop = (e, s) => { const p = e.parts[s]; return p.includes('A') || (p.includes('K') && p.length >= 2) || (p.includes('Q') && p.length >= 3); };

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
      if (s.hcp <= 7) { add('P', 'Main faible : on joue la partielle'); return A; }
      if (L === 5 && s.hcp <= 9) {
        add('2SA', `Proposition avec 5 cartes à ${M} (8-9H)`);
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
        const cands = [0, 1, 2, 3].filter(i => i !== major5);
        const cs = cands.sort((a, b) => s.len[b] - s.len[a])[0];
        add('3' + SUIT[cs], `Changement de couleur après le Texas : forcing un tour, pour que le partenaire montre son fit`);
        add('3' + M, `Il montre le fit ${M}`);
        const p = hld(s, major5);
        if (p + 17 >= 33) return null;                                // chelem possible : hors tranche 1
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
      if (s.hcp >= 15) return null;
      add('2♣', `Stayman : tu cherches un fit 4-4 ${s.s === 4 && s.h === 4 ? 'en majeure' : 'à ' + (s.s === 4 ? '♠' : '♥')}`);
      const ans = n.h >= 4 ? '2♥' : n.s >= 4 ? '2♠' : '2♦';
      add(ans, ans === '2♥' ? '4 cartes à ♥' : ans === '2♠' ? '4 cartes à ♠ (pas 4 cartes à ♥)' : 'Pas de majeure 4e');
      const fitM = ans === '2♥' && s.h >= 4 ? '♥' : ans === '2♠' && s.s >= 4 ? '♠' : null;
      if (fitM) {
        if (s.hcp <= 9) { add('3' + fitM, `Fit 4-4 et 8-9H : proposition`); if (n.hcp >= 16) { add('4' + fitM, 'Maximum : il accepte'); add('P'); } else add('P', 'Minimum : il passe'); return A; }
        add('4' + fitM, `Fit 4-4 et la manche : 4${fitM}`); add('P'); return A;
      }
      const has4S = ans === '2♥' && s.s >= 4;
      if (s.hcp <= 9) {
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
    if (s.hcp <= 9) { add('2SA', 'Proposition de 3SA (8-9H)'); if (n.hcp >= 16) { add('3SA', 'Maximum : il accepte'); add('P'); } else add('P', 'Minimum : il passe'); return A; }
    if (s.hcp <= 14) { add('3SA', 'La manche à SA'); add('P'); return A; }
    if (s.hcp <= 16 && s.balanced) {
      add('4SA', 'Quantitatif (15-16H)');
      if (n.hcp === 15) { add('P', '15H : il passe'); return A; }
      if (n.hcp === 16) { add('5SA', '16H'); if (s.hcp === 16) { add('6SA', '16 + 16 : le petit chelem'); add('P'); } else add('P', '15 + 16 : on s’arrête'); return A; }
      add('6SA', '17H : petit chelem'); add('P'); return A;
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
      if (s.h === 4 && s.s !== 4) return null;                          // séquence « 4♠ = 4♥ » à confirmer
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
      add('3♥', 'Inversé : tu montres 4 cartes à ♠');
      if (n.s >= 4) { add('4♠', 'Fit ♠'); add('P'); } else { add('3SA', 'Pas 4 cartes à ♠'); add('P'); }
      return A;
    }
    if (s.c >= 6 && s.hcp < 4) { add('3♠', 'Texas ♣ (dès 0H)'); add('4♣', 'Il exécute le Texas'); add('P'); return A; }
    if (s.d >= 6 && s.hcp < 4) { add('4♣', 'Texas ♦ (dès 0H)'); add('4♦', 'Il exécute le Texas'); add('P'); return A; }
    if (s.hcp < 4) { add('P', 'Moins de 4H : tu passes'); return A; }
    add('3SA', 'La manche à SA'); add('P'); return A;
  }

  // Séquence complète, donneur Nord, adversaires qui passent. Renvoie null si hors règles.
  function auction(northStr, southStr) {
    const n = evalHand(northStr), s = evalHand(southStr);
    const op = opening(n);
    if (!op) return null;
    const ours = op[0] === '1SA' ? after1SA(n, s) : after2SA(n, s);
    if (!ours) return null;
    // Nos enchères alternent N, S ; on intercale le passe de l'adversaire après chacune.
    // Notre séquence finit toujours par un passe : la donne se termine donc par 3 passes.
    if (ours[ours.length - 1][0] !== 'P') return null;
    return ours.flatMap(x => [x, ['P']]);
  }

  const theme = a => {
    const b = a.map(x => x[0]);
    if (b[0] === '2SA') return b[2] === '3♣' ? 'Puppet' : ['3♦', '3♥', '3♠', '4♣'].includes(b[2]) ? 'Texas sur 2SA' : 'Sur 2SA';
    const r = b[2];
    return r === '2♣' ? 'Stayman' : r === '2♦' || r === '2♥' ? 'Texas' : r === '2♠' ? 'Texas mineur' : r === '3♦' || r === '4♦' ? 'Bicolore majeur' : r === '4SA' ? 'Quantitatif' : 'Sur 1SA';
  };

  const api = { evalHand, hld, opening, auction, theme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RaimonRobot = api;
})(this);
