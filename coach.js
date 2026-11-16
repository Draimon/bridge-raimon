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
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pause = ms => new Promise(res => setTimeout(res, ms));

  // ── Le carnet du prof (par joueur, sur ce téléphone) : donnes expliquées, fautes relevées, exercices réussis
  const CATS = { ouv: '🗣️ Ouverture', dev: '🗣️ Réponses et redemandes', comp: '🗣️ Compétition', entame: '🛡️ Entame', def: '🛡️ Flanc', decl: '🃏 Jeu avec le mort' };
  const storeKey = () => 'raimon-prof:' + h.me();
  function store() { try { const x = JSON.parse(localStorage.getItem(storeKey()) || '{}'); return { vu: x.vu || {}, an: x.an || {}, ex: x.ex || {} }; } catch (e) { return { vu: {}, an: {}, ex: {} }; } }
  function saveStore(x) { try { localStorage.setItem(storeKey(), JSON.stringify(x)); } catch (e) { /* stockage indisponible */ } }
  // type d'enchère : ouverture, réponses/redemandes (adversaires muets), compétition
  function bidCat(deal, bids, i, seat) {
    const prev = bids.slice(0, i).map((b, j) => ({ b, s: SEATS[(SEATS.indexOf(deal.d) + j) % 4] })).filter(x => x.b !== 'P');
    if (!prev.length) return 'ouv';
    return prev.some(x => sideOf(x.s) !== sideOf(seat)) ? 'comp' : 'dev';
  }

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
  function bidSection(deal, r, mySeat, mySys, rec) {
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
    if (rec) rec.bid = key ? bidCat(deal, bids, key.i, mySeat) : null;
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
  // la bonne suite à partir de la carte k : chacun joue la meilleure carte en double mort
  function bestLineFrom(deal, c, plays, k0) {
    const trump = c.s === 'SA' ? null : SUIT_OF[c.s];
    const H = {}; SEATS.forEach(x => { H[x] = parse(deal[x]); });
    let ld = next(c.decl), tr = [], st0 = null; const lines = []; let cur = [];
    for (let k = 0; k < 52; k++) {
      if (!tr.length) st0 = Object.fromEntries(SEATS.map(x => [x, H[x].map(y => y.slice())]));
      const turn = tr.length ? SEATS[(SEATS.indexOf(ld) + tr.length) % 4] : ld;
      let cs, cr;
      if (k < k0) { cs = +plays[k][0]; cr = 12 - RCH.indexOf(plays[k][1]); }
      else { const m = ddMap(st0, trump, ld, tr); if (!m) break; const best = Math.max(...m.values()); const opts = [...m.entries()].filter(([, v]) => v === best).map(([key]) => ({ s: Math.floor(key / 13), r: key % 13 })).filter(o => H[turn][o.s].includes(o.r)); if (!opts.length) break; if (k === k0) { opts.sort((a2, b2) => a2.s - b2.s || b2.r - a2.r); } else opts.sort((a2, b2) => a2.r - b2.r); cs = opts[0].s; cr = opts[0].r; }
      if (k >= k0 - (k0 % 4)) cur.push(`${NAMES[turn][0]} ${cardTxt(cs, cr)}`);
      H[turn][cs] = H[turn][cs].filter(x => x !== cr); tr.push({ seat: turn, s: cs, r: cr });
      if (tr.length === 4) { const w = winnerOf(tr, trump); if (cur.length) { lines.push(`<li>Levée ${Math.floor(k / 4) + 1} : ${cur.join(', ')} → ${NAMES[w.seat]}</li>`); cur = []; } ld = w.seat; tr = []; }
    }
    return '<ol class="coachseq plain">' + lines.slice(0, 8).join('') + '</ol>';
  }
  // une phrase qui dit QUOI changer
  function whyTxt(e, trump, role) {
    const same = e.goods.some(x => x.s === e.card.s);
    if (!same) {
      const gs = [...new Set(e.goods.map(x => x.s))].map(x => SYM[x]).join(' ou ');
      if (trump !== null && e.goods.some(x => x.s === trump) && !e.goods.some(x => x.s !== trump)) return role === 'decl' ? 'il fallait jouer atout (purger ou couper au bon moment).' : 'il fallait couper / rejouer atout.';
      return `il fallait jouer dans une autre couleur : ${gs}.`;
    }
    const higher = e.goods.filter(x => x.s === e.card.s).every(x => x.r > e.card.r);
    return higher ? 'il fallait monter plus haut dans la couleur (prendre ou forcer un honneur).' : 'il fallait jouer plus petit dans la couleur (garder ton honneur / laisser passer).';
  }
  async function playSection(deal, r, mySeat, rec) {
    const A = h.auction({ bids: r.bids || [] }, deal), c = A.contract, plays = r.plays || [];
    if (!c || !plays.length) return '';
    if (!window.RaimonDDSW) return '<div class="card coach"><h3>🃏 Jeu de la carte</h3><p class="muted">Le solveur n’est pas encore chargé : réessaie dans quelques secondes.</p></div>';
    const dummy = partner(c.decl), trump = c.s === 'SA' ? null : SUIT_OF[c.s];
    const role = mySeat === c.decl ? 'decl' : mySeat === dummy ? 'dummy' : 'def';
    if (role === 'dummy') { if (rec) rec.play = { role }; return `<div class="card coach"><h3>🃏 Jeu de la carte</h3><p>Tu étais le mort : c’est ${NAMES[c.decl]} qui a joué le contrat.</p></div>`; }
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
    const bestLine = e => bestLineFrom(deal, c, plays, e.k), why = e => whyTxt(e, trump, role);
    const lost = errs.reduce((a, e) => a + e.loss, 0);
    if (rec) rec.play = { role, lead: mySeat === next(c.decl), entame: errs.some(e => e.k === 0 && e.robotFinds !== false) ? 1 : 0, fautes: errs.filter(e => e.k > 0 && e.robotFinds !== false).reduce((a2, e) => a2 + e.loss, 0) };
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
  let viewTok = 0;
  const alive = tok => tok === viewTok && !!h.app.querySelector(`[data-ctok="${tok}"]`);
  const mySeatOf = r => SEATS.find(k => r.places && r.places[k] === h.me()) || null;
  const myPct = r => { const x = mySeatOf(r); if (r.pct === null || r.pct === undefined) return null; return !x || sideOf(x) === 'NS' ? r.pct : Math.round((100 - r.pct) * 10) / 10; };
  const sysOfMe = () => (h.isGuest() ? 'sef' : 'raimon');
  const sysLabel = s => (s === 'raimon' ? 'Système Raimon' : 'SEF');
  const ctrTxt = x => (x ? `${x.l}${fmt(x.s)}${x.dbl === 2 ? 'XX' : x.dbl ? 'X' : ''} par ${NAMES[x.decl]}` : 'passe générale');
  function page(tok, title, backLabel, backGo, body) {
    h.app.innerHTML = h.topbar(title, backLabel) + `<div data-ctok="${tok}"></div>` + body + h.tabBar();
    h.on('back', backGo); h.wireTabs();
  }
  // analyse d'une donne : les sections affichées + ce qu'on retient dans le carnet
  async function analyze(r, deal, mySeat) {
    const rec = { t: Date.now() };
    const parts = [bidSection(deal, r, mySeat, sysOfMe(), rec), await playSection(deal, r, mySeat, rec)];
    if (window.RaimonDDSW) { const S = store(); S.an[r.n] = rec; saveStore(S); }
    return parts;
  }
  async function view(r, back, opts) {
    opts = opts || {};
    const deal = h.dealOf(r.n); if (!deal) return;
    const tok = ++viewTok, mySeat = mySeatOf(r);
    document.body.classList.remove('tablemode', 'inplay', 'land');
    window.scrollTo(0, 0);
    const title = '🎓 Analyse · ' + r.n, prog = opts.progress ? `<p class="muted center" style="margin:0 0 6px">${opts.progress}</p>` : '';
    page(tok, title, back.label, back.go, prog + '<p class="center muted">Le prof analyse la donne… (quelques secondes)</p>');
    await pause(30);
    if (!alive(tok)) return;
    const parts = [prog];
    parts.push(`<div class="card coach"><h3>🏁 Le contrat</h3>${parLine(deal, r.ns)}<p>Contrat joué : <b>${fmt(r.contrat)}</b>${r.contrat !== 'Passe générale' ? ` · ${r.levees} levées` : ''} · NS ${sgn(r.ns)} · ${r.pct ?? '—'} % pour NS face à la salle.</p></div>`);
    if (mySeat) parts.push(...await analyze(r, deal, mySeat));
    else parts.push('<p class="muted">Tu n’étais pas assis à cette donne : pas d’analyse personnelle.</p>');
    if (!alive(tok)) return;
    parts.push('<p class="muted" style="font-size:12px">Le double mort voit toutes les cartes : une carte « difficile » n’est pas forcément une faute. Les enchères sont comparées au robot de ton système, qui n’est pas infaillible non plus 😉</p>');
    if (opts.next) parts.push(`<button class="btn primary center" data-act="coachnext">${opts.next.label}</button>`);
    page(tok, title, back.label, back.go, parts.join(''));
    if (opts.next) h.on('coachnext', opts.next.go);
    if (mySeat) { const S = store(); S.vu[r.n] = Date.now(); saveStore(S); }
  }

  // ── L'onglet 🎓 Prof : la revue des donnes, les points faibles, les exercices
  function weakness(S) {
    const an = Object.values(S.an), n = an.length, rate = {}, sample = {};
    ['ouv', 'dev', 'comp'].forEach(k => { rate[k] = n ? an.filter(a => a.bid === k).length / n : 0; sample[k] = n; });
    const avg = (list, f) => (list.length ? list.reduce((x, a) => x + f(a), 0) / list.length : 0);
    const leads = an.filter(a => a.play && a.play.lead), defs = an.filter(a => a.play && a.play.role === 'def'), decls = an.filter(a => a.play && a.play.role === 'decl');
    rate.entame = avg(leads, a => a.play.entame); sample.entame = leads.length;
    rate.def = avg(defs, a => Math.min(2, a.play.fautes) / 2); sample.def = defs.length;
    rate.decl = avg(decls, a => Math.min(2, a.play.fautes) / 2); sample.decl = decls.length;
    Object.keys(CATS).forEach(k => { const e = S.ex[k]; if (e && e.n >= 3) rate[k] = rate[k] * 0.7 + (1 - e.ok / e.n) * 0.3; });
    const order = Object.keys(CATS).sort((a, b) => rate[b] - rate[a]);
    return { n, rate, sample, weakest: (n || Object.keys(S.ex).length) && rate[order[0]] > 0 ? order[0] : null, order };
  }
  async function prof() {
    const tok = ++viewTok;
    document.body.classList.remove('tablemode', 'inplay', 'land');
    window.scrollTo(0, 0);
    const go = body => page(tok, '🎓 Le prof', h.homeLabel(), h.home, body);
    go('<p class="center muted">Le prof ouvre ton carnet…</p>');
    let hist = []; try { hist = await h.history(); } catch (e) { hist = []; }
    if (!alive(tok)) return;
    const S = store();
    const mine = hist.filter(r => mySeatOf(r) && h.dealOf(r.n));
    const review = mine.filter(r => myPct(r) !== null && myPct(r) < 50 && !S.vu[r.n]).sort((a, b) => myPct(a) - myPct(b));
    const todo = mine.filter(r => !S.an[r.n]).slice(0, 10);
    const W = weakness(S);
    const lvl = x => (x >= 0.5 ? 'souvent' : x >= 0.25 ? 'parfois' : x > 0 ? 'rarement' : 'jamais');
    const bars = W.order.filter(k => W.sample[k] || S.ex[k]).map(k => `<div class="wrow"><span>${CATS[k]}</span><div class="wbar"><i style="width:${Math.round(Math.min(1, W.rate[k]) * 100)}%"></i></div><small>${lvl(W.rate[k])}</small></div>`).join('');
    const exStat = k => { const e = S.ex[k]; return e && e.n ? `${e.ok}/${e.n} réussi(s)` : 'pas encore fait'; };
    const weak = W.weakest || Object.keys(CATS)[Math.floor(Math.random() * 6)];
    go(`<div class="card coach"><h3>📚 Revue de tes donnes</h3>
        <p>${review.length ? `<b>${review.length}</b> donne(s) en rouge pas encore expliquée(s). Le prof les reprend une par une, de la pire à la moins mauvaise.` : '✅ Toutes tes donnes en rouge ont été expliquées. Bravo !'}</p>
        ${review.length ? '<button class="btn primary center" data-act="profrev">▶ Commencer la revue</button>' : ''}</div>
      <div class="card coach"><h3>🔎 Tes points faibles</h3>
        ${bars ? `${bars}<p class="muted" style="font-size:12px">D’après ${W.n} donne(s) analysée(s) et tes exercices : fautes qu’on pouvait éviter sans voir les mains.</p>` : '<p class="muted">Le prof n’a pas encore analysé de donne.</p>'}
        ${todo.length ? `<button class="btn center" data-act="profan">🔎 Analyser mes ${todo.length} dernière(s) donne(s)</button><p id="profprog" class="center muted" style="font-size:13px"></p>` : ''}</div>
      <div class="card coach"><h3>🏋️ Cours : exercices</h3>
        <p>Des positions tirées de vraies donnes de tournoi, en <b>${sysLabel(sysOfMe())}</b>.${W.weakest ? ' Le prof commence par ton point faible.' : ''}</p>
        <button class="btn primary center" data-act="profex">🎯 Exercice : ${CATS[weak]}</button>
        <div class="exgrid">${Object.keys(CATS).map(k => `<button class="btn" data-ex="${k}">${CATS[k]}<small>${exStat(k)}</small></button>`).join('')}</div></div>`);
    h.on('profrev', () => reviewNext(review, 0));
    h.on('profex', () => exercise(weak));
    h.on('profan', () => analyzeAll(todo, tok));
    h.app.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => exercise(b.dataset.ex)));
  }
  function reviewNext(list, idx) {
    if (idx >= list.length) return prof();
    const last = idx + 1 >= list.length;
    view(list[idx], { label: 'Prof', go: prof }, { progress: `📚 Revue · donne ${idx + 1} sur ${list.length}`, next: last ? { label: '✅ Revue terminée : retour au prof', go: prof } : { label: `Donne suivante ▶ (encore ${list.length - idx - 1})`, go: () => reviewNext(list, idx + 1) } });
  }
  async function analyzeAll(list, tok) {
    if (!window.RaimonDDSW) { const el = h.app.querySelector('#profprog'); if (el) el.textContent = 'Le solveur se charge : réessaie dans quelques secondes.'; return; }
    h.app.querySelectorAll('[data-act="profan"]').forEach(b => { b.disabled = true; });
    for (let i = 0; i < list.length; i++) {
      if (!alive(tok)) return;
      const el = h.app.querySelector('#profprog'); if (el) el.textContent = `Analyse de la donne ${i + 1} sur ${list.length}…`;
      await pause(20);
      try { await analyze(list[i], h.dealOf(list[i].n), mySeatOf(list[i])); } catch (e) { /* donne illisible : on passe */ }
    }
    if (alive(tok)) prof();
  }

  // ── Exercices
  const DEALS = () => (typeof FFB_DEALS !== 'undefined' ? FFB_DEALS : []);
  const pickDeal = () => { const D = DEALS(); return D[Math.floor(Math.random() * D.length)]; };
  const hcpOf = hand => hand.split('').reduce((a, ch) => a + ({ A: 4, K: 3, Q: 2, J: 1 }[ch] || 0), 0);
  const handRows = hand => '<div class="exhand">' + hand.split('.').map((p, s) => `<div><span class="${s === 1 || s === 2 ? 'red' : ''}">${SYM[s]}</span> ${p === '-' || !p ? '—' : p.split('').map(ch => RLAB[12 - RCH.indexOf(ch)]).join(' ')}</div>`).join('') + '</div>';
  function aucTable(deal, bids, ask, me) {
    const cols = ['O', 'N', 'E', 'S'], cells = Array(cols.indexOf(deal.d)).fill('').concat(bids.map(bidName));
    if (ask) cells.push('<b class="ask">?</b>');
    const rows = []; for (let i = 0; i < cells.length; i += 4) rows.push('<tr>' + [0, 1, 2, 3].map(j => `<td>${cells[i + j] ?? ''}</td>`).join('') + '</tr>');
    return `<table class="extab"><tr>${cols.map(c => `<th class="${h.isVul(deal, sideOf(c)) ? 'vul' : ''}">${c === me ? '<u>' + NAMES[c] + '</u>' : NAMES[c]}</th>`).join('')}</tr>${rows.join('')}</table>`;
  }
  function makeBidEx(kind) {
    const mySys = sysOfMe();
    for (let t = 0; t < 400; t++) {
      const deal = pickDeal(), seat = SEATS[Math.floor(Math.random() * 4)];
      const fake = { systemes: Object.fromEntries(SEATS.map(x => [x, sideOf(x) === sideOf(seat) ? mySys : 'sef'])) };
      const full = robotAuction(deal, fake, seat, mySys);
      const pos = full.bids.map((b, i) => i).filter(i => SEATS[(SEATS.indexOf(deal.d) + i) % 4] === seat && bidCat(deal, full.bids, i, seat) === kind && (full.bids[i] !== 'P' || Math.random() < 0.12));
      if (!pos.length) continue;
      const i = pos[Math.floor(Math.random() * pos.length)];
      return { deal, seat, i, full, ans: full.bids[i], expl: full.expl[i] };
    }
    return null;
  }
  function bidChoices(ex) {
    const prefix = ex.full.bids.slice(0, ex.i), A = h.auction({ bids: prefix }, ex.deal);
    const rank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STR.indexOf(m[2]) : -1; };
    const ofRank = k => `${Math.floor(k / 5) + 1}${STR[k % 5]}`;
    const legal = b => b === 'P' || (b === 'X' && A.canX) || (b === 'XX' && A.canXX) || rank(b) > A.last;
    let other = null; try { other = RaimonBid.bid(ex.deal[ex.seat], prefix, ex.deal.d, ex.deal.v, ex.seat, sysOfMe() === 'raimon' ? 'sef' : 'raimon').bid; } catch (e) { other = null; }
    const ar = rank(ex.ans) >= 0 ? rank(ex.ans) : Math.max(0, A.last + 1), near = [];
    for (let d = -5; d <= 5; d++) if (d && ar + d >= 0 && ar + d < 35) near.push(ofRank(ar + d));
    const pool = [...new Set([other, 'P', A.canX ? 'X' : null, ...shuffle(near)])].filter(b => b && b !== ex.ans && legal(b));
    const key = b => (b === 'P' ? 100 : b === 'X' ? 101 : b === 'XX' ? 102 : rank(b));
    return { list: [ex.ans, ...pool.slice(0, 3)].sort((a, b) => key(a) - key(b)), other };
  }
  function addEx(kind, ok) { const S = store(); const e = S.ex[kind] || { n: 0, ok: 0 }; e.n++; if (ok) e.ok++; S.ex[kind] = e; saveStore(S); }
  const exTitle = kind => '🏋️ ' + CATS[kind].replace(/^\S+\s/, '');
  async function exercise(kind) {
    const tok = ++viewTok;
    document.body.classList.remove('tablemode', 'inplay', 'land');
    window.scrollTo(0, 0);
    const go = body => page(tok, exTitle(kind), 'Prof', prof, body);
    go('<p class="center muted">Le prof prépare un exercice…</p>');
    await pause(30);
    const isBid = ['ouv', 'dev', 'comp'].includes(kind);
    if (!isBid && !window.RaimonDDSW) return go('<p class="center muted">Le solveur se charge : réessaie dans quelques secondes.</p>');
    let ex = null; try { ex = isBid ? makeBidEx(kind) : await makeCardEx(kind, tok); } catch (e) { ex = null; }
    if (!alive(tok)) return;
    if (!ex) { go('<p class="center muted">Pas trouvé de bonne position cette fois.</p><button class="btn primary center" data-act="exnext">Réessayer</button>'); h.on('exnext', () => exercise(kind)); return; }
    if (isBid) showBidEx(ex, kind, go); else showCardEx(ex, kind, go);
  }
  function showBidEx(ex, kind, go) {
    const sys = sysOfMe(), ch = bidChoices(ex), d = ex.deal;
    go(`<div class="card coach">
        <p>Tu es <b>${NAMES[ex.seat]}</b> · donneur ${NAMES[d.d]} · ${h.isVul(d, sideOf(ex.seat)) ? 'tu es <b class="red">vulnérable</b>' : 'tu n’es pas vulnérable'}. Système : <b>${sysLabel(sys)}</b>.</p>
        ${aucTable(d, ex.full.bids.slice(0, ex.i), true, ex.seat)}
        <div class="exme">${handRows(d[ex.seat])}<small class="muted">${hcpOf(d[ex.seat])} points H</small></div>
        <p><b>Que dis-tu ?</b></p>
        <div class="exchoices">${ch.list.map(b => `<button class="btn" data-bid="${esc(b)}">${bidName(b)}</button>`).join('')}</div>
        <div id="exres"></div></div>`);
    h.app.querySelectorAll('[data-bid]').forEach(btn => btn.addEventListener('click', () => {
      const b = btn.dataset.bid, ok = b === ex.ans;
      h.app.querySelectorAll('[data-bid]').forEach(x => { x.disabled = true; if (x.dataset.bid === ex.ans) x.classList.add('exok'); else if (x === btn) x.classList.add('exko'); });
      addEx(kind, ok);
      const ex2 = ex.expl && !/^passe.?$/i.test(ex.expl.trim()) ? ` — ${esc(ex.expl)}` : '';
      const otherTxt = !ok && b === ch.other ? ` (${bidName(b)}, c’est ce qu’on dirait en ${sysLabel(sys === 'raimon' ? 'sef' : 'raimon')}.)` : '';
      h.app.querySelector('#exres').innerHTML = (ok ? `<div class="coachgood">✅ <b>Bravo !</b> ${bidName(ex.ans)}${ex2}.</div>` : `<div class="coachkey">❌ En ${sysLabel(sys)}, on dit <b>${bidName(ex.ans)}</b>${ex2}.${otherTxt}</div>`)
        + `<details><summary>Voir toute la séquence et les 4 mains</summary>${seqHtml(d, ex.full.bids, ex.full.expl, ex.i)}<p>Contrat final : <b>${ctrTxt(ex.full.c)}</b></p>${parLine(d)}<div class="exall">${SEATS.map(x => `<div><b>${NAMES[x]}</b> <small class="muted">${hcpOf(d[x])} H</small>${handRows(d[x])}</div>`).join('')}</div></details>`
        + '<button class="btn primary center" data-act="exnext">Exercice suivant ▶</button>';
      h.on('exnext', () => exercise(kind));
    }));
  }
  // position au moment de la carte « upto »
  function stateAt(deal, c, plays, upto) {
    const trump = c.s === 'SA' ? null : SUIT_OF[c.s];
    const hands = {}; SEATS.forEach(s => { hands[s] = parse(deal[s]); });
    const snap = () => Object.fromEntries(SEATS.map(x => [x, hands[x].map(y => y.slice())]));
    let leader = next(c.decl), trick = [], start = snap();
    const played = [], voids = { N: [], E: [], S: [], O: [] }, tricks = { NS: 0, EO: 0 }, done = [];
    for (let k = 0; k < upto; k++) {
      const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
      const s = +plays[k][0], r = 12 - RCH.indexOf(plays[k][1]);
      if (trick.length && s !== trick[0].s && !voids[turn].includes(trick[0].s)) voids[turn].push(trick[0].s);
      hands[turn][s] = hands[turn][s].filter(x => x !== r); trick.push({ seat: turn, s, r });
      if (trick.length === 4) { const w = winnerOf(trick, trump); played.push(...trick); done.push({ cards: trick, w: w.seat }); tricks[sideOf(w.seat)]++; leader = w.seat; trick = []; start = snap(); }
    }
    const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
    return { trump, hands, leader, trick, start, played, voids, tricks, done, turn };
  }
  function legalOf(hand, trick) {
    const ls = trick.length ? trick[0].s : null, follow = ls !== null && hand[ls].length, L = [];
    hand.forEach((rs, s) => { if (!follow || s === ls) rs.forEach(r => L.push({ s, r })); });
    return L;
  }
  function robotPick(deal, c, bids, S, role) {
    const turn = S.turn, k = S.played.length + S.trick.length, vis = role === 'decl' ? partner(turn) : partner(c.decl);
    const known = {}, counts = {};
    SEATS.forEach(x => { known[x] = x === turn || (x === vis && k > 0) ? S.hands[x].map(y => y.slice()) : [[], [], [], []]; counts[x] = S.hands[x].reduce((a, y) => a + y.length, 0); });
    return RaimonPlay.choose({ me: turn, hands: known, visible: k > 0 ? [vis] : [], trick: S.trick.slice(), played: S.played.slice(), trump: S.trump, decl: c.decl, counts, voids: JSON.parse(JSON.stringify(S.voids)), bids, dealer: deal.d, mcSamples: 30 }, 0);
  }
  async function makeCardEx(kind, tok) {
    const mySys = sysOfMe(), role = kind === 'decl' ? 'decl' : 'def';
    for (let t = 0; t < 30; t++) {
      if (tok !== viewTok) return null;
      const deal = pickDeal(), fake = { systemes: Object.fromEntries(SEATS.map(x => [x, mySys])) };
      const auc = robotAuction(deal, fake, 'S', mySys), c = auc.c;
      if (!c) continue;
      const student = kind === 'decl' ? c.decl : kind === 'entame' ? next(c.decl) : (Math.random() < 0.5 ? next(c.decl) : partner(next(c.decl)));
      const mine = kind === 'decl' ? [c.decl, partner(c.decl)] : [student];
      const kMax = kind === 'entame' ? 0 : 36, plays = [];
      for (let k = 0; k <= kMax; k++) {
        const S = stateAt(deal, c, plays, k);
        const m = ddMap(S.start, S.trump, S.leader, S.trick); if (!m) return null;
        const L = legalOf(S.hands[S.turn], S.trick), val = o => m.get(o.s * 13 + o.r);
        const best = Math.max(...L.map(val)), goods = L.filter(o => val(o) === best);
        if ((kind === 'entame' ? k === 0 : k >= 1) && mine.includes(S.turn) && L.length > 1 && (kind === 'entame' || Math.random() < 0.45) && goods.length < L.length && goods.length / L.length <= 0.6) {
          let rc = null; try { rc = robotPick(deal, c, auc.bids, S, role); } catch (e) { rc = null; }
          if (rc && goods.some(g => g.s === rc.s && g.r === rc.r)) return { deal, c, bids: auc.bids, plays: plays.slice(), k, S, student, role, goods, val, best };
          await pause(0);
        }
        const o = goods[Math.floor(Math.random() * goods.length)];
        plays.push(`${o.s}${RCH[12 - o.r]}`);
      }
      await pause(0);
    }
    return null;
  }
  function showCardEx(ex, kind, go) {
    const { deal, c, S, student, role } = ex, dummy = partner(c.decl), k = ex.k, defSide = sideOf(c.decl) === 'NS' ? 'EO' : 'NS';
    const turn = S.turn, other = role === 'decl' ? (turn === dummy ? c.decl : dummy) : dummy;
    const order = hand => (window.suitOrder ? window.suitOrder([0, 1, 2, 3].map(s => hand[s].length), S.trump) : [0, 1, 3, 2]);
    const L = legalOf(S.hands[turn], S.trick);
    const myCards = order(S.hands[turn]).map(s => S.hands[turn][s].slice().sort((a, b) => b - a).map(r => { const ok = L.some(o => o.s === s && o.r === r); return cardHtml(s, RLAB[r], 'md ' + (ok ? 'play' : 'dim'), ok ? `data-c="${s * 13 + r}"` : ''); }).join('')).join('');
    const handTxtNow = seat => '<div class="exhand">' + [0, 1, 2, 3].map(s => `<div><span class="${s === 1 || s === 2 ? 'red' : ''}">${SYM[s]}</span> ${S.hands[seat][s].slice().sort((a, b) => b - a).map(r => RLAB[r]).join(' ') || '—'}</div>`).join('') + '</div>';
    const intro = role === 'decl'
      ? `Tu joues <b>${ctrTxt(c)}</b> ; le mort est ${NAMES[dummy]}.${turn === dummy ? ' <b>C’est au mort de jouer.</b>' : ''}`
      : kind === 'entame' ? `Tu es <b>${NAMES[student]}</b> et tu entames contre <b>${ctrTxt(c)}</b>.` : `Tu es <b>${NAMES[student]}</b> en flanc contre <b>${ctrTxt(c)}</b>.`;
    const doneTxt = S.done.map((d, i) => `<li>Levée ${i + 1} : ${d.cards.map(x => `${NAMES[x.seat][0]} ${cardTxt(x.s, x.r)}`).join(', ')} → ${NAMES[d.w]}</li>`).join('');
    const trickTxt = S.trick.length ? 'Sur la table : ' + S.trick.map(x => `${NAMES[x.seat]} ${cardTxt(x.s, x.r)}`).join(', ') : 'C’est à toi de commencer la levée.';
    go(`<div class="card coach">
        <p>${intro}</p>
        <details ${k === 0 ? 'open' : ''}><summary>Les enchères</summary>${aucTable(deal, ex.bids, false, student)}</details>
        ${k ? `<p>Levées : déclarant <b>${S.tricks[sideOf(c.decl)]}</b> · défense <b>${S.tricks[defSide]}</b> · il en faut ${6 + c.l} au déclarant.</p>` : ''}
        ${doneTxt ? `<details><summary>Les levées déjà jouées (${S.done.length})</summary><ol class="coachseq plain">${doneTxt}</ol></details>` : ''}
        ${k ? `<div class="exother"><b>${other === dummy ? 'Le mort' : 'Ta main'} (${NAMES[other]})</b>${handTxtNow(other)}</div>` : ''}
        <p class="extrick">${trickTxt}</p>
        <p><b>${turn === dummy ? 'Quelle carte du mort ?' : 'Quelle carte joues-tu ?'}</b></p>
        <div class="excards">${myCards}</div>
        <div id="exres"></div></div>`);
    h.app.querySelectorAll('.excards [data-c]').forEach(el => el.addEventListener('click', () => {
      if (h.app.querySelector('#exres').innerHTML) return;
      const s = Math.floor(+el.dataset.c / 13), r = +el.dataset.c % 13, ok = ex.goods.some(g => g.s === s && g.r === r), loss = ex.best - ex.val({ s, r });
      el.classList.add(ok ? 'exok' : 'exko');
      h.app.querySelectorAll('.excards [data-c]').forEach(x => { if (ex.goods.some(g => g.s * 13 + g.r === +x.dataset.c)) x.classList.add('exgood'); });
      addEx(kind, ok);
      const gl = ex.goods.slice(0, 3).map(x => cardTxt(x.s, x.r)).join(' ou ');
      h.app.querySelector('#exres').innerHTML = (ok
        ? `<div class="coachgood">✅ <b>Bien joué !</b> ${cardTxt(s, r)} est la bonne carte${ex.goods.length > 1 ? ` (${gl} se valent)` : ''}.</div>`
        : `<div class="coachkey">❌ ${cardTxt(s, r)} coûte ${loss} levée${loss > 1 ? 's' : ''} : ${whyTxt({ card: { s, r }, goods: ex.goods }, S.trump, role)} La bonne carte : ${gl}.</div>`)
        + `<details><summary>Voir les 4 mains et la bonne suite</summary><div class="exall">${SEATS.map(x => `<div><b>${NAMES[x]}</b>${handTxtNow(x)}</div>`).join('')}</div>${bestLineFrom(deal, c, ex.plays, k)}<p class="muted" style="font-size:12px">Suite jouée au mieux par les quatre joueurs, cartes visibles.</p></details>`
        + '<button class="btn primary center" data-act="exnext">Exercice suivant ▶</button>';
      h.on('exnext', () => exercise(kind));
    }));
  }
  return { view, parLine, parOf, prof, seen: n => !!store().vu[n], _ex: exercise };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createCoach };
