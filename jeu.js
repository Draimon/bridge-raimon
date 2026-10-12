// Système Raimon — jeu de la carte : tu joues le déclarant (sa main + le mort), Est et Ouest sont des robots.
// Les robots ne voient que leur main, le mort et les cartes déjà jouées.

// Cartes à jouer dessinées (partagées avec index.html). s : 0 ♠, 1 ♥, 2 ♦, 3 ♣ ; label : 'A', 'R', '10'…
const CARD_SYM = ['♠', '♥', '♦', '♣'];
const DISPLAY_SUITS = [0, 1, 3, 2];          // ♠ ♥ ♣ ♦ : on alterne noir / rouge, comme sur une vraie table
function cardHtml(s, label, cls, attrs) {
  return `<div class="pcard ${s === 1 || s === 2 ? 'red' : ''} ${cls || ''}" ${attrs || ''}><span class="rk">${label}</span><span class="st">${CARD_SYM[s]}</span><span class="big">${CARD_SYM[s]}</span></div>`;
}
// Main en arc de cercle (comme sur une vraie table) : cards = [{ s, label, cls, attrs }]
function arcHtml(cards) {
  const n = cards.length, spread = Math.min(30, n * 2.5);
  return `<div class="arc">${cards.map((c, i) => {
    const a = n > 1 ? -spread / 2 + (i * spread) / (n - 1) : 0;
    return cardHtml(c.s, c.label, 'lg ' + (c.cls || ''), `${c.attrs || ''} style="transform: rotate(${a.toFixed(1)}deg)${/\bsel\b/.test(c.cls || '') ? ' translateY(-30px)' : ''}"`);
  }).join('')}</div>`;
}
function backHtml(cls) { return `<div class="pcard back ${cls || ''}"></div>`; }

function createPlay(env) {
  'use strict';
  const { app, fmt, topbar, on, go, getProgress, save, exit } = env;
  const ORDER = ['N', 'E', 'S', 'O'];
  const NAMES = { N: 'Nord', E: 'Est', S: 'Sud', O: 'Ouest' };
  const SYM = ['♠', '♥', '♦', '♣'];
  const RCH = 'AKQJT98765432';
  const RLAB = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const next = s => ORDER[(ORDER.indexOf(s) + 1) % 4];
  const partner = s => ORDER[(ORDER.indexOf(s) + 2) % 4];
  const side = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
  const red = s => s === 1 || s === 2;
  const lab = c => `<span class="${red(c.s) ? 'red' : ''}">${SYM[c.s]}</span>${RLAB[c.r]}`;

  let G = null;
  let epoch = 0;                              // invalide les temporisations après une annulation

  function parseHand(h) {
    return h.split('.').map(p => (p === '-' ? [] : p.split('').map(ch => 12 - RCH.indexOf(ch)).sort((a, b) => b - a)));
  }

  // mode : undefined (jeu normal), 'open' (jeux découverts) ou 'sol' (solution pas à pas)
  function start(deal, mode) {
    const c = deal.c;
    G = {
      deal, decl: c.by, dummy: partner(c.by),
      trump: c.s === 'SA' ? -1 : SYM.indexOf(c.s),
      need: c.l + 6,
      hands: Object.fromEntries(ORDER.map(s => [s, parseHand(deal.h[s])])),
      turn: next(c.by), trick: [], tricks: { NS: 0, EO: 0 }, last: null,
      played: [], void: Object.fromEntries(ORDER.map(s => [s, [false, false, false, false]])),
      firstLead: {}, busy: false, done: false, dummyShown: false, history: [], claiming: false, msg: '',
      mode, open: mode === 'open' || mode === 'sol',
    };
    epoch++;
    if (mode === 'sol') { G.solCards = (deal.sol.match(/.{3}/g) || []).map(x => ({ seat: ORDER[+x[0]], c: { s: +x[1], r: x.charCodeAt(2) - 97 } })); G.step = 0; go(view); return; }
    go(view);
    schedule();
  }

  // Solution : on reconstruit la position après k cartes de la ligne optimale.
  function solGo(k) {
    const { deal, solCards } = G;
    start(deal, 'sol');
    G.solCards = solCards;
    k = Math.max(0, Math.min(52, k));
    for (let i = 0; i < k; i++) {
      const { seat, c } = solCards[i];
      if (G.trick.length === 4) { G.last = G.trick; G.trick = []; }
      const h = G.hands[seat][c.s]; h.splice(h.indexOf(c.r), 1);
      G.trick.push({ seat, c }); G.dummyShown = true;
      if (G.trick.length === 4) { const w = winnerOf(G.trick); G.tricks[side(w.seat)]++; G.turn = w.seat; } else G.turn = next(seat);
    }
    G.step = k;
    view();
  }

  // ───── Règles
  const has = (s, suit) => G.hands[s][suit].length > 0;
  function legal(seat) {
    const h = G.hands[seat];
    if (!G.trick.length) return h.flatMap((rs, s) => rs.map(r => ({ s, r })));
    const led = G.trick[0].c.s;
    if (h[led].length) return h[led].map(r => ({ s: led, r }));
    return h.flatMap((rs, s) => rs.map(r => ({ s, r })));
  }
  function winnerOf(trick) {
    let w = trick[0];
    for (const t of trick.slice(1)) {
      if (t.c.s === w.c.s ? t.c.r > w.c.r : t.c.s === G.trump) w = t;
    }
    return w;
  }
  const beats = (c, w) => (c.s === w.c.s ? c.r > w.c.r : c.s === G.trump);
  const userSeat = s => s === G.decl || s === G.dummy;

  function playCard(seat, c) {
    if (!legal(seat).some(x => x.s === c.s && x.r === c.r)) throw new Error('carte illégale ' + seat + ' ' + c.s + ':' + c.r);
    const h = G.hands[seat][c.s];
    h.splice(h.indexOf(c.r), 1);
    if (G.trick.length && c.s !== G.trick[0].c.s) G.void[seat][G.trick[0].c.s] = true;
    if (!G.trick.length && side(seat) === 'EO' && G.firstLead[seat] === undefined) G.firstLead[seat] = c.s;
    G.sel = null;
    G.trick.push({ seat, c });
    G.played.push({ seat, c });
    G.dummyShown = true;
    if (G.trick.length === 4) {
      const w = winnerOf(G.trick);
      G.tricks[side(w.seat)]++;
      G.busy = true;
      go(view);
      const ep = epoch;
      setTimeout(() => {
        if (ep !== epoch) return;
        G.last = G.trick; G.trick = []; G.turn = w.seat; G.busy = false;
        if (G.tricks.NS + G.tricks.EO === 13) { G.done = true; finish(); return; }
        go(view); schedule();
      }, 1100);
      return;
    }
    G.turn = next(seat);
    go(view);
    schedule();
  }

  function schedule() {
    if (G.done || G.busy) return;
    const seat = G.turn;
    const ep = epoch;
    if (!userSeat(seat)) { G.busy = true; setTimeout(() => { if (ep !== epoch) return; G.busy = false; playCard(seat, bot(seat)); }, 550); return; }
    const l = legal(seat);
    if (l.length === 1) { G.busy = true; setTimeout(() => { if (ep !== epoch) return; G.busy = false; playCard(seat, l[0]); }, 400); }
  }

  // ───── Robot de défense
  // Cartes encore « dehors » pour ce défenseur : ni jouées, ni dans sa main, ni au mort.
  function unseenHigher(seat, c) {
    let n = 0;
    for (let r = c.r + 1; r <= 12; r++) {
      const gone = G.played.some(p => p.c.s === c.s && p.c.r === r);
      const mine = G.hands[seat][c.s].includes(r);
      const dummy = G.hands[G.dummy][c.s].includes(r);
      if (!gone && !mine && !dummy) n++;
    }
    return n;
  }
  const lowest = list => list.reduce((a, b) => (b.r < a.r ? b : a));
  const highest = list => list.reduce((a, b) => (b.r > a.r ? b : a));

  function bot(seat) {
    const l = legal(seat);
    if (!G.trick.length) return G.played.length === 0 ? openingLead(seat) : laterLead(seat, l);
    return follow(seat, l);
  }

  function openingLead(seat) {
    const h = G.hands[seat], nt = G.trump < 0;
    const trumps = nt ? 0 : h[G.trump].length;
    let best = null;
    for (let s = 0; s < 4; s++) {
      const cs = h[s];
      if (!cs.length || (s === G.trump && h.some((x, k) => k !== s && x.length))) continue;
      let score = 0, card = cs[cs.length - 1];
      const top = cs[0];
      const seq = cs.length >= 2 && top >= 9 && cs[1] === top - 1 && (top >= 10 || cs[2] === top - 2);
      if (top === 12 && cs[1] === 11) { score = nt ? 6 : 8; card = 12; }
      else if (seq) { score = 6; card = top; }
      else if (nt) {
        score = cs.length * 2 + (top >= 9 ? 1 : 0);
        card = cs.length >= 4 ? cs[3] : top >= 9 ? cs[cs.length - 1] : top;
      } else {
        if (cs.length === 1 && trumps >= 1 && top < 9) { score = 5; card = top; }
        else if (cs[0] === 12) { score = -5; card = 12; }
        else if (top < 9) { score = cs.length === 2 ? 2 : 3; card = top; }
        else if (top === 11) { score = -2; card = cs[cs.length - 1]; }
        else { score = 1; card = cs.length >= 4 ? cs[3] : cs[cs.length - 1]; }
      }
      score += cs.length * 0.1;
      if (!best || score > best.score) best = { score, c: { s, r: card } };
    }
    return best ? best.c : lowest(legal(seat));
  }

  function laterLead(seat, l) {
    const h = G.hands[seat], dummyH = G.hands[G.dummy];
    const nt = G.trump < 0;
    const ruffSluff = s => !nt && s !== G.trump && G.void[G.decl][s] && dummyH[s].length === 0;
    // 1. Une carte maîtresse, si le mort ne coupera pas.
    for (let s = 0; s < 4; s++) {
      if (!h[s].length || s === G.trump) continue;
      const c = { s, r: h[s][0] };
      if (unseenHigher(seat, c) === 0 && !dummyH[s].some(r => r > c.r) && (nt || dummyH[s].length || !dummyH[G.trump].length)) return c;
    }
    // 2. Rejouer la couleur d'entame du partenaire.
    const ps = G.firstLead[partner(seat)];
    if (ps !== undefined && ps !== G.trump && h[ps].length && !ruffSluff(ps)) return h[ps].length <= 2 ? { s: ps, r: h[ps][0] } : { s: ps, r: h[ps][h[ps].length - 1] };
    // 3. Continuer sa propre couleur d'entame (surtout à SA).
    const ms = G.firstLead[seat];
    if (ms !== undefined && ms !== G.trump && h[ms].length && (nt || dummyH[ms].length) && !ruffSluff(ms)) return { s: ms, r: h[ms].length >= 3 ? h[ms][h[ms].length - 1] : h[ms][0] };
    // 4. Une couleur où le mort est faible, sans donner de coupe et défausse.
    let best = null;
    for (let s = 0; s < 4; s++) {
      if (!h[s].length || (s === G.trump && h.some((x, k) => k !== s && x.length)) || ruffSluff(s)) continue;
      const dummyHonors = dummyH[s].filter(r => r >= 9).length;
      const score = -dummyHonors * 2 + h[s].length * 0.3 - (!nt && !dummyH[s].length && dummyH[G.trump].length ? 3 : 0);
      if (!best || score > best.score) best = { score, s };
    }
    if (best) { const cs = h[best.s]; const seq = cs.length >= 2 && cs[0] >= 9 && cs[1] === cs[0] - 1; return { s: best.s, r: seq ? cs[0] : cs[cs.length - 1] }; }
    return lowest(l);
  }

  function follow(seat, l) {
    const pos = G.trick.length;                 // 1 = 2e joueur, 2 = 3e, 3 = 4e
    const led = G.trick[0].c.s;
    const w = winnerOf(G.trick);
    const partnerWins = side(w.seat) === side(seat);
    const after = ORDER.slice(0).filter(s => !G.trick.some(t => t.seat === s) && s !== seat);
    // Le gagnant actuel peut-il être battu par quelqu'un qui joue après moi ?
    const safe = () => after.every(s => {
      if (s === G.dummy) {
        const dh = G.hands[s];
        if (dh[led].length) return !dh[led].some(r => beats({ s: led, r }, w));
        return G.trump < 0 || !dh[G.trump].length || (w.c.s === G.trump && !dh[G.trump].some(r => r > w.c.r));
      }
      return w.c.s === G.trump ? true : unseenHigher(seat, w.c) === 0 && (G.trump < 0 || w.c.s === G.trump || G.void[s][led] === false);
    });
    if (l[0].s === led) {
      const winners = l.filter(c => beats(c, w));
      if (pos === 1) {
        const ledC = G.trick[0].c;
        if (ledC.r >= 9 && side(G.trick[0].seat) !== side(seat) && winners.length) return lowest(winners); // couvrir un honneur
        return lowest(l);
      }
      if (partnerWins && (pos === 3 || safe())) return lowest(l);
      if (winners.length) return lowest(winners);   // 3e fort / 4e prend au plus juste
      return lowest(l);
    }
    // Défausse ou coupe
    if (partnerWins && (pos === 3 || safe())) return discard(seat);
    if (G.trump >= 0 && G.hands[seat][G.trump].length) {
      const ruffs = G.hands[seat][G.trump].map(r => ({ s: G.trump, r })).filter(c => beats(c, w));
      if (ruffs.length) return lowest(ruffs);
    }
    return discard(seat);
  }

  function discard(seat) {
    const h = G.hands[seat];
    let best = null;
    for (let s = 0; s < 4; s++) {
      if (!h[s].length || (s === G.trump && h.some((x, k) => k !== s && x.length))) continue;
      const honors = h[s].filter(r => r >= 9).length;
      const score = h[s].length - honors * 3 - (s === G.firstLead[partner(seat)] ? 4 : 0);
      if (!best || score > best.score) best = { score, s };
    }
    const cs = h[best.s];
    return { s: best.s, r: cs[cs.length - 1] };
  }

  // ───── Annuler / réclamer
  function snapshot() { const { deal, history, ...rest } = G; return JSON.stringify(rest); }
  function undo() {
    if (!G.history.length) return;
    const st = JSON.parse(G.history.pop());
    G = Object.assign(st, { deal: G.deal, history: G.history, busy: false, claiming: false, msg: '' });
    epoch++;
    view(); schedule();
  }
  function claim(k) {
    const left = G.hands[G.turn].reduce((s, x) => s + x.length, 0);
    const masks = ORDER.map(s => G.hands[s].map(rs => rs.reduce((m, r) => m | (1 << r), 0)));
    let dd;
    const lead = G.trick.length ? G.trick[0].seat : G.turn;
    const cur = G.trick.map(t => ({ p: ORDER.indexOf(t.seat), s: t.c.s, r: t.c.r }));
    try { dd = RaimonDDS.solve(masks, G.trump, ORDER.indexOf(lead), k, 4e6, cur); }
    catch (e) { G.claiming = false; G.msg = 'Trop tôt pour vérifier une réclamation sur le téléphone : joue encore une ou deux levées.'; view(); return; }
    G.claiming = false;
    if (k > dd) { G.msg = `Réclamation refusée : la défense peut t'empêcher de faire ${k} levée${k > 1 ? 's' : ''} (au mieux ${dd}).`; view(); return; }
    G.tricks.NS += k; G.tricks.EO += left - k; G.done = true; G.claimed = k;
    epoch++;
    finish();
  }

  // ───── Affichage : tapis vert, vraies cartes
  const cardAttrs = (seat, c, ok) => (ok ? `data-play="${seat}:${c.s}:${c.r}"` : '');
  // Couleur choisie pour le joueur à qui c'est le tour : imposée s'il doit fournir, sinon celle qu'il a touchée.
  function selSuit(seat) {
    const suits = [...new Set(legal(seat).map(c => c.s))];
    return suits.length === 1 ? suits[0] : G.sel;
  }
  const pickCls = (seat, c, ok) => (!ok ? 'dim' : selSuit(seat) === c.s ? 'can sel' : selSuit(seat) === null || selSuit(seat) === undefined ? 'can' : 'can off');
  // Main en éventail (le déclarant, en bas)
  function fanHtml(seat, clickable) {
    const l = clickable ? legal(seat) : [];
    const cards = DISPLAY_SUITS.flatMap(s => G.hands[seat][s].map(r => ({ s, r })));
    return arcHtml(cards.map(c => {
      const ok = l.some(x => x.s === c.s && x.r === c.r);
      return { s: c.s, label: RLAB[c.r], cls: clickable ? pickCls(seat, c, ok) : '', attrs: cardAttrs(seat, c, ok) };
    }));
  }
  // Le mort étalé en colonnes par couleur
  function dummyHtml(seat, clickable) {
    const l = clickable ? legal(seat) : [];
    const open = clickable ? selSuit(seat) : null;
    // Couleur choisie : ses cartes descendent sous le mort, posées côte à côte face à toi (sans décaler l'écran).
    const cols = DISPLAY_SUITS.filter(s => G.hands[seat][s].length).map(s => `<div class="dcol ${open === s ? 'ghost' : ''}">${G.hands[seat][s].map(r => {
      const ok = l.some(x => x.s === s && x.r === r);
      if (open === s) return cardHtml(s, RLAB[r], 'md');
      return cardHtml(s, RLAB[r], 'md ' + (clickable ? pickCls(seat, { s, r }, ok) : ''), cardAttrs(seat, { s, r }, ok));
    }).join('')}</div>`).join('');
    const row = open !== null && open !== undefined && G.hands[seat][open].length
      ? `<div class="dpick ${G.hands[seat][open].length > 5 ? 'tight' : ''}">${G.hands[seat][open].map(r => cardHtml(open, RLAB[r], 'md can sel', cardAttrs(seat, { s: open, r }, l.some(x => x.s === open && x.r === r)))).join('')}</div>`
      : '';
    return `<div class="dummywrap"><div class="dummy">${cols}</div>${row}</div>`;
  }
  const isTurn = seat => !G.busy && !G.done && G.turn === seat && !G.trick.some(t => t.seat === seat);
  // Défenseur sur le côté : dos de cartes + nombre de cartes
  function sideHtml(seat) {
    const n = G.hands[seat].reduce((t, x) => t + x.length, 0);
    return `<div class="side ${isTurn(seat) ? 'turn' : ''}"><div class="sname">${NAMES[seat]}</div><div class="backs">${n ? backHtml() + (n > 1 ? backHtml() : '') : ''}</div><div class="cnt">${n} carte${n > 1 ? 's' : ''}</div></div>`;
  }
  // Levée au centre : pos = haut / gauche / droite / bas
  function trickHtml(M, L, R, D) {
    const w = G.trick.length === 4 ? winnerOf(G.trick) : null;
    const slot = (seat, pos) => {
      const t = G.trick.find(x => x.seat === seat);
      return `<div class="slot ${pos}">${t ? cardHtml(t.c.s, RLAB[t.c.r], 'md ' + (w && w.seat === seat ? 'win' : '')) : ''}</div>`;
    };
    return `<div class="trick">${slot(M, 'top')}${slot(L, 'left')}${slot(R, 'right')}${slot(D, 'bottom')}</div>`;
  }

  function actionsHtml() {
    if (G.mode === 'sol') {
      const nextTrick = Math.min(52, (Math.floor(G.step / 4) + 1) * 4);
      const cur = G.solCards[G.step - 1];
      return `<div class="solnav"><button class="btn center" data-act="s0">⏮</button><button class="btn center" data-act="sprev">◀</button><button class="btn center" data-act="snext">▶</button><button class="btn center" data-act="strick">Levée ⏭</button></div>
        <p class="center solinfo">Carte ${G.step}/52${cur ? ` · ${NAMES[cur.seat]} a joué ${lab(cur.c)}` : ' · touche ▶ pour commencer'}</p>`;
    }
    if (G.done) return '';
    const left = G.hands[G.turn].reduce((s, x) => s + x.length, 0);
    const canClaim = !G.busy && userSeat(G.turn) && left > 0;
    let html = `<div class="row2" style="margin-bottom:10px">
      <button class="btn center" data-act="undo" ${G.history.length && !G.busy ? '' : 'disabled'}>↶ Annuler</button>
      <button class="btn center" data-act="claim" ${canClaim ? '' : 'disabled'}>Réclamer</button></div>`;
    if (G.claiming && canClaim) {
      const opts = []; for (let k = left; k >= 0; k--) opts.push(k);
      html += `<div class="card"><b>Combien de levées sur les ${left} restantes ?</b>
        <div class="claimgrid">${opts.map(k => `<button class="dcell" data-claim="${k}">${k}</button>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:6px 0 0">La défense accepte si elle ne peut pas t'en prendre plus, même en jouant parfaitement.</p></div>`;
    }
    return html;
  }

  function view() {
    if (typeof document !== 'undefined') document.body.classList.add('tablemode');
    const c = G.deal.c;
    const toPlay = G.mode !== 'sol' && !G.busy && userSeat(G.turn) ? G.turn : null;
    // Tu joues toujours depuis la place du déclarant : sa main en bas, le mort en face (en haut).
    const D = G.decl, M = G.dummy, L = next(D), R = next(M);
    const who = s => (s === 'S' ? 'Sud, ta main' : 'Nord, ton partenaire');
    app.innerHTML = topbar(G.mode === 'sol' ? `Solution · donne n° ${G.deal.n}` : `Jeu · donne n° ${G.deal.n}${G.mode === 'open' ? ' (jeux découverts)' : ''}`, 'Quitter') + `
      ${G.dummyShown ? dummyHtml(M, toPlay === M) : '<p class="feltnote">Le mort sera étalé après l’entame</p>'}
      ${G.open ? `<div class="openhands">${[L, R].map(s => `<div class="ohand"><div class="sname">${NAMES[s]}</div>${DISPLAY_SUITS.map(x => `<div><span class="${red(x) ? 'red' : ''}">${SYM[x]}</span> ${G.hands[s][x].map(r => RLAB[r]).join(' ') || '—'}</div>`).join('')}</div>`).join('')}</div>` : ''}
      <div class="frame">
        <div class="plate top ${isTurn(M) ? 'turn' : ''}"><span class="seat">${M}</span>Mort · ${M === 'S' ? 'ta main' : 'partenaire'}</div>
        <div class="plate left ${isTurn(L) ? 'turn' : ''}"><span class="seat">${L === 'O' ? 'O' : 'E'}</span>${NAMES[L]} · ${G.hands[L].reduce((t, x) => t + x.length, 0)}</div>
        <div class="plate right ${isTurn(R) ? 'turn' : ''}"><span class="seat">${R === 'O' ? 'O' : 'E'}</span>${NAMES[R]} · ${G.hands[R].reduce((t, x) => t + x.length, 0)}</div>
        <div class="plate bottom ${isTurn(D) ? 'turn' : ''}"><span class="seat">${D}</span>Toi · déclarant<span class="contract">${c.l}${fmt(c.s)}</span></div>
        <div class="corner cl">NS<br><b>${G.tricks.NS}/${G.need}</b></div>
        <div class="corner cr">EO<br><b>${G.tricks.EO}</b></div>
        ${trickHtml(M, L, R, D)}
      </div>
      ${fanHtml(D, toPlay === D)}
      ${G.msg ? `<div class="feedback ko" style="margin-bottom:10px"><p style="margin:0">${G.msg}</p></div>` : ''}
      ${actionsHtml()}
      ${G.last ? `<p class="muted center" style="font-size:13px">Levée précédente : ${G.last.map(t => NAMES[t.seat][0] + ' ' + lab(t.c)).join(' · ')}</p>` : ''}`;
    on('back', () => { if (G.mode === 'sol' || G.done || confirm('Abandonner le jeu de la carte ?')) { G.done = true; epoch++; exit(G.deal); } });
    on('s0', () => solGo(0)); on('sprev', () => solGo(G.step - 1)); on('snext', () => solGo(G.step + 1));
    on('strick', () => solGo(Math.min(52, (Math.floor(G.step / 4) + 1) * 4)));
    on('undo', undo);
    on('claim', () => { G.claiming = !G.claiming; G.msg = ''; view(); });
    app.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => {
      b.textContent = 'Vérification…'; setTimeout(() => claim(+b.dataset.claim), 30);
    }));
    app.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => {
      if (G.busy || G.done) return;
      const [seat, s, r] = b.dataset.play.split(':');
      if (seat !== G.turn) return;
      if (selSuit(seat) !== +s) { G.sel = +s; view(); return; }
      if (legal(seat).length > 1) G.history.push(snapshot());
      G.msg = '';
      playCard(seat, { s: +s, r: +r });
    }));
  }

  function finish() {
    if (typeof document !== 'undefined') document.body.classList.remove('tablemode');
    const c = G.deal.c, made = G.tricks.NS, dd = G.deal.dd;
    const diff = made - G.need;
    const p = getProgress();
    const prev = p['j' + G.deal.n] || {};
    p['j' + G.deal.n] = { best: Math.max(prev.best || 0, made), last: made };
    save();
    const verdict = made > dd ? ['ok', `Au top ! ${made} levées pour un objectif de ${dd}`]
      : made === dd ? ['ok', `Objectif atteint : ${made} levées`]
      : ['ko', `En dessous de l’objectif : ${made} levées sur ${dd} possibles`];
    const claimNote = G.claimed !== undefined ? `<p class="muted" style="margin:4px 0 0;font-size:14px">Fin de donne réclamée (${G.claimed} levée${G.claimed > 1 ? 's' : ''}), réclamation acceptée.</p>` : '';
    const contract = diff >= 0 ? `Contrat réussi${diff ? ` avec ${diff} levée${diff > 1 ? 's' : ''} de mieux` : ''}` : `Chuté de ${-diff}`;
    const mini = seat => `<div class="mini"><div class="who">${NAMES[seat]}</div>${parseHand(G.deal.h[seat]).map((rs, s) => `<div><span class="${red(s) ? 'red' : ''}">${SYM[s]}</span> ${rs.length ? rs.map(r => RLAB[r]).join(' ') : '—'}</div>`).join('')}</div>`;
    app.innerHTML = topbar(`Jeu · donne n° ${G.deal.n}`, 'Donnes') + `
      <div class="card center">
        <div class="muted">${c.l}${fmt(c.s)} par ${G.decl === 'S' ? 'toi' : 'ton partenaire'}</div>
        <div style="font-size:24px;font-weight:700;margin:4px 0">${contract}</div>${claimNote}
        <div class="feedback ${verdict[0]}" style="margin-top:10px"><h3 style="margin:0">${verdict[1]}</h3>
          <p style="margin:6px 0 0;font-size:14px">L’objectif est le nombre de levées faisable avec un jeu parfait des deux côtés (double mort).</p></div>
        ${G.deal.best ? `<p style="font-size:15px;margin:10px 0 0">Meilleur contrat possible : <b>${fmt(G.deal.best.c)}</b> par ${G.deal.best.by === 'S' ? 'toi' : 'ton partenaire'} (${G.deal.best.t} levées en double mort)${G.deal.best.c === c.l + c.s ? ' : vous y étiez !' : ''}</p>` : ''}
      </div>
      <div class="card"><b>Les 4 mains d’origine</b>
        <div class="compass"><div class="cN">${mini('N')}</div><div class="cO">${mini('O')}</div><div class="cE">${mini('E')}</div><div class="cS">${mini('S')}</div></div></div>
      ${G.deal.sol ? '<button class="btn primary center" data-act="showsol">Voir la solution</button>' : ''}
      <button class="btn center" data-act="openplay">Rejouer à jeux découverts</button>
      <button class="btn center" data-act="replay">Rejouer la carte</button>
      <button class="btn center" data-act="out">Retour aux donnes</button>`;
    on('back', () => exit(G.deal));
    on('out', () => exit(G.deal));
    on('replay', () => start(G.deal));
    on('openplay', () => start(G.deal, 'open'));
    on('showsol', () => { start(G.deal, 'sol'); });
  }

  return { start, _state: () => G, _play: (seat, c) => playCard(seat, c), _legal: seat => legal(seat), _solGo: k => solGo(k) };
}
