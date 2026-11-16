// Système Raimon — le « prof » : analyse d'une donne jouée au salon (bouton 🎓 Mieux faire).
//  1. Le par (meilleur contrat en double mort pour les deux camps, sacrifices compris) et le contrat joué.
//  2. Les enchères : à chaque enchère du joueur, ce que le robot aurait dit dans SON système (Raimon pour la famille,
//     SEF pour les autres), avec son explication ; et le contrat où le robot serait arrivé.
//  3. Le jeu de la carte (déclarant + mort, ou flanc) : chaque carte comparée au double mort (solveur DDS WebAssembly) ;
//     pour chaque carte qui coûte une levée, on vérifie si elle était « trouvable » sans voir les mains (simulation du robot).
function createCoach(h) {
  'use strict';
  const SEATS = ['N', 'E', 'S', 'O'], NAMES = { N: 'Nord', E: 'Est', S: 'Sud', O: 'Ouest' };
  const STR = ['♣', '♦', '♥', '♠', 'SA'], KEY = { '♣': 'C', '♦': 'D', '♥': 'H', '♠': 'S', SA: 'NT' }, SUIT_OF = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  const SYM = ['♠', '♥', '♦', '♣'], RCH = 'AKQJT98765432', RLAB = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4], partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
  const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
  const parse = x => x.split('.').map(p => (p === '-' ? [] : p.split('').map(ch => 12 - RCH.indexOf(ch))));
  const cardTxt = (s, r) => `<span class="${s === 1 || s === 2 ? 'red' : ''}">${SYM[s]}${RLAB[r]}</span>`;
  const sgn = v => (v > 0 ? '+' : '') + v;
  const { esc, fmt } = h;
  const winnerOf = (trick, trump) => trick.reduce((w, x) => { const wt = w.s === trump, xt = x.s === trump; if (xt && !wt) return x; if (wt && !xt) return w; if (x.s === w.s && x.r > w.r) return x; return w; });

  // ── 1. Le par : enchères « idéales » où chaque camp surenchérit tant que ça lui rapporte (sacrifices contrés compris)
  function parOf(deal) {
    if (!deal || !deal.dds) return null;
    const opts = [];
    for (const side of ['NS', 'EO']) {
      const decls = side === 'NS' ? ['N', 'S'] : ['E', 'O'];
      for (let l = 1; l <= 7; l++) STR.forEach((s, k) => {
        const decl = decls.reduce((a, b) => (deal.dds[b][KEY[s]] > deal.dds[a][KEY[s]] ? b : a));
        const t = deal.dds[decl][KEY[s]], makes = t >= 6 + l;
        const sc = h.score({ l, s, dbl: makes ? 0 : 1 }, t, h.isVul(deal, side));
        opts.push({ side, l, s, decl, rank: (l - 1) * 5 + k, ns: side === 'NS' ? sc : -sc, makes, t });
      });
    }
    let cur = { rank: -1, ns: 0, side: null };
    for (let it = 0; it < 60; it++) {
      let changed = false;
      for (const side of ['NS', 'EO']) {
        if (cur.side === side) continue;
        const better = opts.filter(o => o.side === side && o.rank > cur.rank && (side === 'NS' ? o.ns > cur.ns : o.ns < cur.ns));
        if (!better.length) continue;
        better.sort((a, b) => (side === 'NS' ? b.ns - a.ns : a.ns - b.ns) || a.rank - b.rank);
        cur = better[0]; changed = true;
      }
      if (!changed) break;
    }
    return cur.side ? cur : { passe: true, ns: 0 };
  }
  const parTxt = p => (!p ? '—' : p.passe ? 'passe générale' : `${p.l}${fmt(p.s)}${p.makes ? '' : 'X'} par ${NAMES[p.decl]}${p.makes ? '' : ' (sacrifice)'}`);
  function parLine(deal, nsPlayed) {
    const p = parOf(deal); if (!p) return '';
    const diff = nsPlayed === undefined ? '' : nsPlayed === p.ns ? ' · <b>au par</b> ✅' : ` · vous : NS ${sgn(nsPlayed)}`;
    return `<p class="parline">🎯 Par : <b>${parTxt(p)}</b> · NS ${sgn(p.ns)}${diff}</p>`;
  }

  // ── 2. Enchères : le robot du système du joueur, enchère par enchère
  function sysOf(r, seat, mySeat, mySys) {
    if (seat === mySeat || (r.places && r.places[seat] && seat === partner(mySeat))) return mySys;
    return (r.systemes && r.systemes[seat]) || 'sef';
  }
  function robotAuction(deal, r, mySeat, mySys, prefix) {
    const bids = (prefix || []).slice(), expl = bids.map(() => '');
    for (let k = 0; k < 60; k++) {
      const seat = SEATS[(SEATS.indexOf(deal.d) + bids.length) % 4];
      let x; try { x = RaimonBid.bid(deal[seat], bids, deal.d, deal.v, seat, sysOf(r, seat, mySeat, mySys)); } catch (e) { x = { bid: 'P', expl: '' }; }
      bids.push(x.bid); expl.push(x.expl || ''); const A = h.auction({ bids }, deal); if (A.ended) return { bids, expl, c: A.contract };
    }
    return { bids, expl, c: h.auction({ bids }, deal).contract };
  }
  const bidName = x => fmt(x === 'P' ? 'Passe' : x);
  function seqHtml(deal, bids, expl, from) {
    return '<ol class="coachseq">' + bids.map((b, i) => { const seat = SEATS[(SEATS.indexOf(deal.d) + i) % 4]; return `<li class="${i >= from ? 'new' : ''}"><b>${NAMES[seat]}</b> ${bidName(b)}${expl[i] && !/^passe.?$/i.test(expl[i].trim()) ? ` <small>— ${esc(expl[i])}</small>` : ''}</li>`; }).join('') + '</ol>';
  }
  const nsOf = (deal, c) => { if (!c) return 0; const t = deal.dds[c.decl][KEY[c.s]]; const sc = h.score(c, t, h.isVul(deal, sideOf(c.decl))); return sideOf(c.decl) === 'NS' ? sc : -sc; };
  function bidSection(deal, r, mySeat, mySys) {
    const bids = r.bids || [], sysName = mySys === 'raimon' ? 'Système Raimon' : 'SEF';
    const A = h.auction({ bids }, deal), c = A.contract, my = nsOf(deal, c), sideSign = sideOf(mySeat) === 'NS' ? 1 : -1;
    const ctr = x => (x ? `${x.l}${fmt(x.s)}${x.dbl === 2 ? 'XX' : x.dbl ? 'X' : ''} par ${NAMES[x.decl]}` : 'passe générale');
    // au par (ou mieux) : pas de faute d'enchères à signaler
    const par = parOf(deal), atPar = par && (my - par.ns) * sideSign >= 0;
    // chaque enchère différente du robot : où aurait mené la bonne enchère (suite jouée par les robots) ?
    let key = null; const diffs = [];
    bids.forEach((b, i) => {
      if (SEATS[(SEATS.indexOf(deal.d) + i) % 4] !== mySeat) return;
      let rb; try { rb = RaimonBid.bid(deal[mySeat], bids.slice(0, i), deal.d, deal.v, mySeat, mySys); } catch (e) { return; }
      if (!rb || rb.bid === b) return;
      const alt = robotAuction(deal, r, mySeat, mySys, [...bids.slice(0, i), rb.bid]);
      const gain = (nsOf(deal, alt.c) - my) * sideSign;
      const d = { i, mine: b, rob: rb.bid, expl: rb.expl, alt, gain };
      diffs.push(d); if (!key && gain >= 50 && !atPar) key = d;
    });
    const full = robotAuction(deal, r, mySeat, mySys), rob = nsOf(deal, full.c);
    let out = `<p>Contrat joué : <b>${ctr(c)}</b> (double mort : NS ${sgn(my)}) · les robots en ${sysName} : <b>${ctr(full.c)}</b> (NS ${sgn(rob)}).</p>`;
    if (key) {
      const before = bids.slice(0, key.i).map(bidName).join(' – ') || 'tu ouvres';
      out += `<div class="coachkey">❌ <b>L'erreur</b> : après <i>${before}</i>, tu as dit <b>${bidName(key.mine)}</b>. En ${sysName}, il faut <b>${bidName(key.rob)}</b>${key.expl ? ` — ${esc(key.expl)}` : ''}. On serait arrivé à ${ctr(key.alt.c)}, soit ${key.gain} points de mieux.</div>`;
      out += `<details><summary>Voir la bonne séquence</summary>${seqHtml(deal, key.alt.bids, key.alt.expl, key.i)}</details>`;
    } else if (atPar) {
      out += `<p>✅ Vous êtes au par (ou mieux) : rien à reprocher aux enchères.</p>`;
      if (diffs.length) out += `<details><summary>Voir la séquence des robots</summary>${seqHtml(deal, full.bids, full.expl, 0)}</details>`;
    } else if (diffs.length) {
      out += `<p>✅ Tes enchères diffèrent un peu du ${sysName}, mais ça ne t'a rien coûté.</p>`;
      out += `<details><summary>Voir la séquence des robots</summary>${seqHtml(deal, full.bids, full.expl, 0)}</details>`;
    } else out += `<p>✅ Toutes tes enchères sont celles du ${sysName}.</p>`;
    return `<div class="card coach"><h3>🗣️ Mieux enchérir</h3>${out}</div>`;
  }

  // ── 3. Jeu de la carte : double mort carte par carte (solveur DDS WebAssembly)
  function ddMap(start, trump, leader, trick) {
    const D = window.RaimonDDSW; if (!D) return null;
    // DDS veut les cartes restantes SANS celles déjà posées dans la levée en cours
    const rest = s => start[s].map((rs, su) => rs.filter(r => !trick.some(t => t.seat === s && t.s === su && t.r === r)));
    const pbn = 'N:' + SEATS.map(s => rest(s).map(rs => rs.slice().sort((a, b) => b - a).map(r => RCH[12 - r]).join('')).join('.')).join(' ');
    const ft = D.SolveBoardPBN({ trump: trump === null ? 4 : trump, first: SEATS.indexOf(leader), currentTrickSuit: [0, 1, 2].map(i => (trick[i] ? trick[i].s : 0)), currentTrickRank: [0, 1, 2].map(i => (trick[i] ? trick[i].r + 2 : 0)), remainCards: pbn }, -1, 3, 1);
    const m = new Map();
    for (let i = 0; i < ft.cards; i++) { const su = ft.suit[i]; m.set(su * 13 + ft.rank[i] - 2, ft.score[i]); for (let r = 2; r <= 14; r++) if (ft.equals[i] & (1 << r)) m.set(su * 13 + r - 2, ft.score[i]); }
    return m;
  }
  async function playSection(deal, r, mySeat) {
    const A = h.auction({ bids: r.bids || [] }, deal), c = A.contract, plays = r.plays || [];
    if (!c || !plays.length) return '';
    if (!window.RaimonDDSW) return '<div class="card coach"><h3>🃏 Jeu de la carte</h3><p class="muted">Le solveur n’est pas encore chargé : réessaie dans quelques secondes.</p></div>';
    const dummy = partner(c.decl), trump = c.s === 'SA' ? null : SUIT_OF[c.s];
    const role = mySeat === c.decl ? 'decl' : mySeat === dummy ? 'dummy' : 'def';
    if (role === 'dummy') return `<div class="card coach"><h3>🃏 Jeu de la carte</h3><p>Tu étais le mort : c’est ${NAMES[c.decl]} qui a joué le contrat.</p></div>`;
    const mine = role === 'decl' ? [c.decl, dummy] : [mySeat];
    const hands = {}; SEATS.forEach(s => { hands[s] = parse(deal[s]); });
    let leader = next(c.decl), trick = [], start = null; const played = [], voids = { N: [], E: [], S: [], O: [] }, errs = [];
    let ddFirst = null;
    for (let k = 0; k < plays.length; k++) {
      if (!trick.length) start = Object.fromEntries(SEATS.map(s => [s, hands[s].map(x => x.slice())]));
      const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
      const s = +plays[k][0], rk = 12 - RCH.indexOf(plays[k][1]);
      if (mine.includes(turn) || k === 0) {
        const m = ddMap(start, trump, leader, trick);
        if (m) {
          const best = Math.max(...m.values()), v = m.get(s * 13 + rk);
          if (k === 0) ddFirst = 13 - best;                            // levées du déclarant en double mort
          if (mine.includes(turn) && v !== undefined && v < best) {
            const goods = [...m.entries()].filter(([, x]) => x === best).map(([key]) => ({ s: Math.floor(key / 13), r: key % 13 })).sort((a2, b2) => a2.s - b2.s || b2.r - a2.r);
            // trouvable sans voir les mains ? on demande au robot (il imagine les mains cachées)
            let robotFinds = null;
            try {
              const vis = role === 'decl' ? partner(turn) : dummy;
              const known = {}; SEATS.forEach(x => { known[x] = x === turn || (x === vis && (k > 0)) ? hands[x].map(y => y.slice()) : [[], [], [], []]; });
              const counts = {}; SEATS.forEach(x => { counts[x] = hands[x].reduce((a, y) => a + y.length, 0); });
              const rc = RaimonPlay.choose({ me: turn, hands: known, visible: k > 0 ? [vis] : [], trick: trick.slice(), played: played.slice(), trump, decl: c.decl, counts, voids: JSON.parse(JSON.stringify(voids)), bids: r.bids, dealer: deal.d, mcSamples: 30 }, 0);
              robotFinds = goods.some(g => g.s === rc.s && g.r === rc.r);
            } catch (e) { robotFinds = null; }
            errs.push({ k, levee: Math.floor(k / 4) + 1, seat: turn, card: { s, r: rk }, goods, loss: best - v, robotFinds });
          }
        }
      }
      if (trick.length && s !== trick[0].s && !voids[turn].includes(trick[0].s)) voids[turn].push(trick[0].s);
      hands[turn][s] = hands[turn][s].filter(x => x !== rk);
      trick.push({ seat: turn, s, r: rk });
      if (trick.length === 4) { played.push(...trick); leader = winnerOf(trick, trump).seat; trick = []; }
      if (k % 8 === 7) await new Promise(res => setTimeout(res, 0));     // laisse respirer l'écran
    }
    const title = role === 'decl' ? '🃏 Mieux jouer avec le mort' : '🛡️ Mieux défendre';
    // la bonne suite à partir de la faute : chacun joue la meilleure carte en double mort
    function bestLine(e) {
      const H = {}; SEATS.forEach(x => { H[x] = parse(deal[x]); });
      let ld = next(c.decl), tr = [], st0 = null; const lines = []; let cur = [];
      for (let k = 0; k < 52; k++) {
        if (!tr.length) st0 = Object.fromEntries(SEATS.map(x => [x, H[x].map(y => y.slice())]));
        const turn = tr.length ? SEATS[(SEATS.indexOf(ld) + tr.length) % 4] : ld;
        let cs, cr;
        if (k < e.k) { cs = +plays[k][0]; cr = 12 - RCH.indexOf(plays[k][1]); }
        else { const m = ddMap(st0, trump, ld, tr); if (!m) break; const best = Math.max(...m.values()); const opts = [...m.entries()].filter(([, v]) => v === best).map(([key]) => ({ s: Math.floor(key / 13), r: key % 13 })).filter(o => H[turn][o.s].includes(o.r)); if (!opts.length) break; if (k === e.k) { opts.sort((a2, b2) => a2.s - b2.s || b2.r - a2.r); } else opts.sort((a2, b2) => a2.r - b2.r); cs = opts[0].s; cr = opts[0].r; }
        if (k >= e.k - (e.k % 4)) cur.push(`${NAMES[turn][0]} ${cardTxt(cs, cr)}`);
        H[turn][cs] = H[turn][cs].filter(x => x !== cr); tr.push({ seat: turn, s: cs, r: cr });
        if (tr.length === 4) { const w = winnerOf(tr, trump); if (cur.length) { lines.push(`<li>Levée ${Math.floor(k / 4) + 1} : ${cur.join(', ')} → ${NAMES[w.seat]}</li>`); cur = []; } ld = w.seat; tr = []; }
      }
      return '<ol class="coachseq plain">' + lines.slice(0, 8).join('') + '</ol>';
    }
    // une phrase qui dit QUOI changer
    function why(e) {
      const g = e.goods[0], same = e.goods.some(x => x.s === e.card.s);
      if (!same) {
        const gs = [...new Set(e.goods.map(x => x.s))].map(x => SYM[x]).join(' ou ');
        if (trump !== null && e.goods.some(x => x.s === trump) && !e.goods.some(x => x.s !== trump)) return role === 'decl' ? 'il fallait jouer atout (purger ou couper au bon moment).' : 'il fallait couper / rejouer atout.';
        return `il fallait jouer dans une autre couleur : ${gs}.`;
      }
      const higher = e.goods.filter(x => x.s === e.card.s).every(x => x.r > e.card.r);
      return higher ? 'il fallait monter plus haut dans la couleur (prendre ou forcer un honneur).' : 'il fallait jouer plus petit dans la couleur (garder ton honneur / laisser passer).';
    }
    const lost = errs.reduce((a, e) => a + e.loss, 0);
    const head = role === 'decl'
      ? `<p>Tu as fait <b>${r.levees}</b> levée(s) ; en double mort (toutes les cartes visibles) le contrat en fait <b>${ddFirst ?? '?'}</b>.</p>`
      : `<p>En double mort, la défense pouvait faire <b>${ddFirst === null ? '?' : 13 - ddFirst}</b> levée(s) ; vous en avez fait <b>${13 - r.levees}</b>.</p>`;
    if (!errs.length) return `<div class="card coach"><h3>${title}</h3>${head}<p>✅ Aucune carte n’a coûté de levée : jeu parfait, même en double mort !</p></div>`;
    const key = errs.find(e => e.robotFinds) || errs.slice().sort((a2, b2) => b2.loss - a2.loss)[0];
    const keyHtml = `<div class="coachkey">❌ <b>L'erreur</b> (levée ${key.levee}) : tu as joué ${cardTxt(key.card.s, key.card.r)}${role === 'decl' && key.seat !== mySeat ? ' du mort' : ''} ; ${why(key)} Avec ${key.goods.slice(0, 2).map(x => cardTxt(x.s, x.r)).join(' ou ')}, ${role === 'decl' ? 'tu faisais' : 'la défense faisait'} ${key.loss} levée${key.loss > 1 ? 's' : ''} de plus.${key.robotFinds ? ' <b>C’était trouvable</b> sans voir les mains.' : key.robotFinds === false ? ' (Difficile : il fallait deviner la répartition.)' : ''}</div>
      <details><summary>Voir la bonne suite et les explications</summary>${bestLine(key)}<p class="muted" style="font-size:12px">Suite jouée au mieux par les quatre joueurs, cartes visibles, à partir de la levée ${key.levee}.</p></details>`;
    const items = errs.filter(e => e !== key).slice(0, 4).map(e => {
      const g = e.goods.slice(0, 4).map(x => cardTxt(x.s, x.r)).join(' ou ');
      const who = role === 'decl' && e.seat !== mySeat ? ' (du mort)' : '';
      const verdict = e.robotFinds === true ? '👉 <b>Trouvable</b> : en raisonnant sur les mains possibles, le robot joue cette carte.' : e.robotFinds === false ? '🔮 Difficile : seul le double mort (cartes visibles) la trouve — il fallait deviner.' : '';
      return `<div class="coachitem"><b>Levée ${e.levee}</b> : tu as joué ${cardTxt(e.card.s, e.card.r)}${who} — mieux : ${g} (${e.loss} levée${e.loss > 1 ? 's' : ''} de plus).<br><small>${verdict}</small></div>`;
    }).join('');
    const findable = errs.filter(e => e.robotFinds).reduce((a, e) => a + e.loss, 0);
    return `<div class="card coach"><h3>${title}</h3>${head}${keyHtml}${items ? `<details><summary>Les autres cartes à revoir (${errs.length - 1})</summary>${items}</details>` : ''}<p class="muted" style="font-size:12px">${errs.length} carte(s) ont coûté ${lost} levée(s) en double mort${findable ? `, dont ${findable} trouvable(s) sans voir les mains` : ''}.</p></div>`;
  }

  // ── La page « Mieux faire »
  async function view(r, back) {
    const deal = h.dealOf(r.n); if (!deal) return;
    const mySeat = SEATS.find(s => r.places && r.places[s] === h.me()) || null;
    const mySys = h.isGuest() ? 'sef' : 'raimon';
    document.body.classList.remove('tablemode', 'inplay', 'land');
    const shell = body => h.app.innerHTML = h.topbar('🎓 Analyse · ' + r.n, back.label) + body + h.tabBar();
    shell('<p class="center muted">Le prof analyse la donne… (quelques secondes)</p>');
    h.on('back', back.go); h.wireTabs();
    await new Promise(res => setTimeout(res, 30));
    const parts = [];
    parts.push(`<div class="card coach"><h3>🏁 Le contrat</h3>${parLine(deal, r.ns)}<p>Contrat joué : <b>${fmt(r.contrat)}</b>${r.contrat !== 'Passe générale' ? ` · ${r.levees} levées` : ''} · NS ${sgn(r.ns)} · ${r.pct ?? '—'} % pour NS face à la salle.</p></div>`);
    if (mySeat) parts.push(bidSection(deal, r, mySeat, mySys));
    if (mySeat) parts.push(await playSection(deal, r, mySeat));
    if (!mySeat) parts.push('<p class="muted">Tu n’étais pas assis à cette donne : pas d’analyse personnelle.</p>');
    parts.push('<p class="muted" style="font-size:12px">Le double mort voit toutes les cartes : une carte « difficile » n’est pas forcément une faute. Les enchères sont comparées au robot de ton système, qui n’est pas infaillible non plus 😉</p>');
    shell(parts.join(''));
    h.on('back', back.go); h.wireTabs();
  }
  return { view, parLine, parOf };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createCoach };
