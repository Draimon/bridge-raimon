// Système Raimon — salon de bridge : joueurs connectés, chat général, tables de 4 (humains ou robots),
// enchères et jeu de la carte en direct (Firestore temps réel), marque par paires en % face à la salle FFB.
// Données : presence/{uid}, chat/{id}, tables/{id} (tout l'état d'une table dans un seul document),
// joues/{uid} (donnes déjà jouées), resultats/{id}. Les donnes viennent des simultanés FFB (FFB_DEALS).

function createSalon(env) {
  'use strict';
  const { app, topbar, on, fmt, esc, bidCard, home, getPlayer, isGuest } = env;
  const db = firebase.firestore();
  const MAX = 16;                                    // joueurs connectés en même temps (quota gratuit Firebase)
  const FRESH = 150000;                              // présence : vu il y a moins de 2 min 30
  const SEATS = ['N', 'E', 'S', 'O'];
  const NAMES = { N: 'Nord', E: 'Est', S: 'Sud', O: 'Ouest' };
  const STRAINS = ['♣', '♦', '♥', '♠', 'SA'];
  const SUIT_OF = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  const SYM = ['♠', '♥', '♦', '♣'], RCH = 'AKQJT98765432';
  const RLAB = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const DISPLAY = [0, 1, 3, 2];
  const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4];
  const partner = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
  const sideOf = s => (s === 'N' || s === 'S' ? 'NS' : 'EO');
  const red = s => s === 1 || s === 2;
  const me = () => (firebase.auth().currentUser || {}).uid;
  const dealOf = n => FFB_DEALS.find(d => d.n === n);
  const now = () => Date.now();
  const unsubs = [];
  const stopAll = () => { while (unsubs.length) { try { unsubs.pop()(); } catch (e) { /* déjà arrêté */ } } };
  let presence = [], tables = [], chat = [], where = null, beat = null, current = null, curId = null, robotTimer = null;
  let ui = { chatOpen: false, sel: null, choice: null, msg: '' };

  // ───── Semaine du chat : depuis le dernier lundi 3h, heure de Paris
  function weekStart() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
      .formatToParts(new Date()).map(p => [p.type, p.value]));
    const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
    const h = +parts.hour % 24, m = +parts.minute;
    let back = dow * 24 * 60 + (h - 3) * 60 + m;          // minutes écoulées depuis lundi 3h (heure de Paris)
    if (back < 0) back += 7 * 24 * 60;
    return Math.floor((now() - back * 60000) / 60000) * 60000;
  }

  // ───── Présence (battement toutes les 60 s tant que l'appli est ouverte)
  async function heartbeat() {
    const uid = me(); if (!uid || !where) return;
    try { await db.collection('presence').doc(uid).set({ nom: getPlayer(), invite: isGuest(), ou: where, t: now() }); } catch (e) { /* hors ligne */ }
  }
  function startBeat(w) {
    where = w; heartbeat();
    if (!beat) beat = setInterval(heartbeat, 60000);
  }
  function stopBeat() {
    clearInterval(beat); beat = null; where = null;
    const uid = me(); if (uid) db.collection('presence').doc(uid).delete().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && where) heartbeat(); });
  window.addEventListener('pagehide', () => { if (where) { const uid = me(); if (uid) db.collection('presence').doc(uid).delete().catch(() => {}); } });
  const fresh = () => presence.filter(p => p.t > now() - FRESH);
  const isFresh = uid => fresh().some(p => p.id === uid);

  // Ménage partagé : le premier qui ouvre le salon efface le vieux chat, les présences et tables abandonnées.
  async function cleanup() {
    try {
      const ws = weekStart();
      const old = await db.collection('chat').where('sem', '<', ws - 6 * 86400000 + 1).limit(100).get();
      old.forEach(d => d.ref.delete().catch(() => {}));
      const pres = await db.collection('presence').where('t', '<', now() - 86400000).limit(50).get();
      pres.forEach(d => d.ref.delete().catch(() => {}));
      const tab = await db.collection('tables').where('maj', '<', now() - 2 * 86400000).limit(50).get();
      tab.forEach(d => d.ref.delete().catch(() => {}));
    } catch (e) { /* pas grave */ }
  }

  // ───── Salon
  async function open() {
    stopAll(); current = null; curId = null;
    document.body.classList.remove('tablemode');
    app.innerHTML = topbar('Salon de bridge', isGuest() ? 'Quitter' : 'Accueil') + '<p class="center muted">Entrée dans le salon…</p>';
    on('back', leave);
    let snap;
    try { snap = await db.collection('presence').get(); } catch (e) { app.innerHTML += '<p class="center">Connexion au salon impossible.</p>'; return; }
    presence = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!isFresh(me()) && fresh().length >= MAX) {
      app.innerHTML = topbar('Salon de bridge', isGuest() ? 'Quitter' : 'Accueil') + `<div class="card center"><h3>Salon complet</h3><p>${MAX} joueurs sont déjà connectés (maximum pour rester dans l’offre gratuite). Réessaie un peu plus tard.</p></div>`;
      on('back', leave); return;
    }
    startBeat('salon');
    cleanup();
    unsubs.push(db.collection('presence').onSnapshot(s => { presence = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSalon(); }));
    unsubs.push(db.collection('tables').where('maj', '>', now() - 12 * 3600000).onSnapshot(s => { tables = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSalon(); }));
    listenChat();
    renderSalon();
  }
  function listenChat() {
    unsubs.push(db.collection('chat').where('t', '>=', weekStart()).orderBy('t', 'desc').limit(50).onSnapshot(s => {
      chat = s.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      const box = document.getElementById('chatlog'); if (box) { box.innerHTML = chatLog(); box.scrollTop = box.scrollHeight; }
    }, () => {}));
  }
  function leave() {
    stopAll(); stopBeat(); clearTimeout(robotTimer);
    document.body.classList.remove('tablemode');
    if (isGuest()) { firebase.auth().signOut().catch(() => {}); location.reload(); } else home();
  }
  const seatLabel = st => (!st ? '<i class="muted">libre</i>' : st.robot ? '🤖 Robot' : esc(st.nom) + (isFresh(st.uid) ? '' : ' <span class="muted">(absent)</span>'));
  function renderSalon() {
    if (curId) return;
    const ps = fresh().sort((a, b) => a.nom.localeCompare(b.nom));
    const live = tables.filter(t => t.etat !== 'fermee');
    const keepDraft = (document.getElementById('chatin') || {}).value || '';
    app.innerHTML = topbar('Salon de bridge', isGuest() ? 'Quitter' : 'Accueil') + `
      <div class="section-title">Connectés (${ps.length}/${MAX})</div>
      <div class="card" style="padding:10px 14px">${ps.map(p => `<div class="sl-who"><span class="dot"></span>${esc(p.nom)}${p.invite ? ' <small class="muted">invité</small>' : ''}<small class="muted"> · ${p.ou === 'salon' ? 'au salon' : 'à une table'}</small></div>`).join('') || '<span class="muted">Personne</span>'}</div>
      <div class="section-title">Tables</div>
      ${live.map(t => {
        const free = SEATS.filter(s => !t.sieges[s]).length;
        const mine = SEATS.some(s => t.sieges[s] && t.sieges[s].uid === me());
        return `<div class="card sl-table"><b>${esc(t.nom)}</b> <small class="muted">· ${t.etat === 'attente' ? 'en attente' : t.etat === 'fin' ? 'entre deux donnes' : 'en jeu'}${t.historique && t.historique.length ? ' · ' + t.historique.length + ' donne(s)' : ''}</small>
          <div class="sl-seats">${SEATS.map(s => `<span><b>${s}</b> ${seatLabel(t.sieges[s])}</span>`).join('')}</div>
          <button class="btn ${mine || free ? 'primary' : ''} center" data-join="${t.id}" ${mine || free ? '' : 'disabled'}>${mine ? 'Revenir à la table' : free ? 'Rejoindre' : 'Complète'}</button></div>`;
      }).join('') || '<p class="muted center">Aucune table pour l’instant.</p>'}
      <button class="btn primary center" data-act="create">＋ Créer une table</button>
      <div class="section-title">Chat (remis à zéro le lundi à 3h)</div>
      ${chatHtml(keepDraft)}`;
    on('back', leave);
    on('create', createTable);
    app.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => enterTable(b.dataset.join)));
    wireChat();
  }
  function chatLog() {
    return chat.map(m => `<div class="chatmsg ${m.uid === me() ? 'mine' : ''}"><b>${esc(m.nom)}</b> ${esc(m.texte)}<small>${new Date(m.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || '<p class="muted center" style="font-size:13px">Pas encore de message cette semaine.</p>';
  }
  const chatHtml = draft => `<div class="chatbox"><div id="chatlog" class="chatlog">${chatLog()}</div>
    <form id="chatform" class="chatform"><input id="chatin" maxlength="400" placeholder="Écrire à tout le salon…" value="${esc(draft || '')}" autocomplete="off"><button class="btn primary">Envoyer</button></form></div>`;
  function wireChat() {
    const log = document.getElementById('chatlog'); if (log) log.scrollTop = log.scrollHeight;
    const f = document.getElementById('chatform'); if (!f) return;
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const inp = document.getElementById('chatin'), texte = inp.value.trim(); if (!texte) return;
      inp.value = '';
      db.collection('chat').add({ uid: me(), nom: getPlayer(), texte: texte.slice(0, 400), t: now(), sem: weekStart() }).catch(() => { inp.value = texte; });
    });
  }

  // ───── Tables
  async function createTable() {
    const ref = db.collection('tables').doc();
    await ref.set({
      nom: 'Table de ' + getPlayer(), maitre: me(), cree: now(), maj: now(), etat: 'attente',
      sieges: { N: null, E: null, S: { uid: me(), nom: getPlayer() }, O: null },
      n: null, bids: [], plays: [], moves: 0, historique: [], robot: 'simple',
    });
    enterTable(ref.id);
  }
  function enterTable(id) {
    stopAll(); curId = id; ui = { chatOpen: false, sel: null, choice: null, msg: '' };
    startBeat('table:' + id);
    unsubs.push(db.collection('presence').onSnapshot(s => { presence = s.docs.map(d => ({ id: d.id, ...d.data() })); }));
    unsubs.push(db.collection('tables').doc(id).onSnapshot(d => {
      if (!d.exists) { curId = null; open(); return; }
      current = { id: d.id, ...d.data() };
      afterUpdate();
      renderTable();
    }));
    listenChat();
  }
  const mySeat = t => SEATS.find(s => t.sieges[s] && t.sieges[s].uid === me()) || null;
  const isMaster = t => t.maitre === me();
  async function tx(fn) {
    const ref = db.collection('tables').doc(curId);
    try {
      await db.runTransaction(async T => {
        const d = await T.get(ref); if (!d.exists) throw new Error('table disparue');
        const t = d.data(), upd = fn(t);
        if (upd) T.update(ref, { ...upd, maj: now() });
      });
    } catch (e) { ui.msg = 'Action refusée (' + (e.message || e) + ')'; renderTable(); }
  }
  function sit(seat) {
    tx(t => {
      if (t.sieges[seat]) return null;
      const s = { ...t.sieges }; SEATS.forEach(x => { if (s[x] && s[x].uid === me()) s[x] = null; });
      s[seat] = { uid: me(), nom: getPlayer() };
      return { sieges: s };
    });
  }
  function setRobot(seat, on) { tx(t => (!isMaster(t) || (on && t.sieges[seat]) ? null : { sieges: { ...t.sieges, [seat]: on ? { robot: true } : null } })); }
  function freeSeat(seat) { tx(t => (!isMaster(t) ? null : { sieges: { ...t.sieges, [seat]: null } })); }
  function leaveTable() {
    const id = curId;
    tx(t => {
      const s = { ...t.sieges }; SEATS.forEach(x => { if (s[x] && s[x].uid === me()) s[x] = null; });
      const humans = SEATS.filter(x => s[x] && s[x].uid);
      const upd = { sieges: s };
      if (t.maitre === me()) upd.maitre = humans.length ? s[humans[0]].uid : null;
      if (!humans.length) upd.etat = 'fermee';
      return upd;
    }).then(() => { if (curId === id) { curId = null; open(); } });
  }
  // Donne suivante : jamais une donne déjà jouée par l'un des humains assis
  async function nextDeal() {
    const t = current, humans = SEATS.map(s => t.sieges[s]).filter(x => x && x.uid);
    const seen = new Set();
    for (const h of humans) {
      try { const d = await db.collection('joues').doc(h.uid).get(); (d.exists ? d.data().liste || [] : []).forEach(n => seen.add(n)); } catch (e) { /* tant pis */ }
    }
    (t.historique || []).forEach(h => seen.add(h.n));
    const pool = FFB_DEALS.filter(d => !seen.has(d.n));
    if (!pool.length) { ui.msg = 'Plus aucune donne neuve pour cette table : préviens Damien.'; renderTable(); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    tx(x => (!isMaster(x) || x.etat === 'encheres' || x.etat === 'jeu' ? null : { n: pick.n, bids: [], plays: [], moves: 0, etat: 'encheres', fin: null }));
  }

  // ───── Règles du jeu (tout est recalculé à partir des enchères et des cartes jouées)
  function parseHand(h) { return h.split('.').map(p => (p === '-' ? [] : p.split('').map(ch => 12 - RCH.indexOf(ch)))); }
  const bidRank = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + STRAINS.indexOf(m[2]) : -1; };
  function auction(t, deal) {
    let last = -1, lastBid = null, lastBy = null, dbl = 0, lastAct = null, lastActBy = null;
    const firstNamed = {};
    t.bids.forEach((b, i) => {
      const seat = SEATS[(SEATS.indexOf(deal.d) + i) % 4];
      if (bidRank(b) >= 0) {
        last = bidRank(b); lastBid = b; lastBy = seat; dbl = 0;
        const key = sideOf(seat) + b.slice(1); if (!firstNamed[key]) firstNamed[key] = seat;
      } else if (b === 'X') dbl = 1; else if (b === 'XX') dbl = 2;
      if (b !== 'P') { lastAct = b; lastActBy = seat; }
    });
    const n = t.bids.length, turn = SEATS[(SEATS.indexOf(deal.d) + n) % 4];
    const ended = (n >= 4 && t.bids.slice(-4).every(b => b === 'P') && !lastBid) || (lastBid && n >= 4 && t.bids.slice(-3).every(b => b === 'P'));
    const opp = s => s && sideOf(s) !== sideOf(turn);
    const canX = lastBid && dbl === 0 && opp(lastBy) && lastAct === lastBid;
    const canXX = lastBid && dbl === 1 && lastAct === 'X' && opp(lastActBy);
    const contract = lastBid ? { l: +lastBid[0], s: lastBid.slice(1), dbl, decl: firstNamed[sideOf(lastBy) + lastBid.slice(1)] } : null;
    return { last, turn, ended, canX, canXX, contract };
  }
  function playState(t, deal, c) {
    const hands = {}; SEATS.forEach(s => { hands[s] = parseHand(deal[s]); });
    const trump = c.s === 'SA' ? null : SUIT_OF[c.s];
    let leader = next(c.decl), trick = [], tricks = { NS: 0, EO: 0 }, last = null;
    for (const p of t.plays) {
      const s = +p[0], r = 12 - RCH.indexOf(p[1]);
      const seat = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
      hands[seat][s] = hands[seat][s].filter(x => x !== r);
      trick.push({ seat, s, r });
      if (trick.length === 4) {
        const w = winnerOf(trick, trump); tricks[sideOf(w.seat)]++; last = trick; leader = w.seat; trick = [];
      }
    }
    const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
    return { hands, trump, trick, tricks, last, turn, leader, done: t.plays.length === 52, dummy: partner(c.decl), shown: t.plays.length > 0 };
  }
  function winnerOf(trick, trump) {
    return trick.reduce((w, x) => {
      const wt = w.s === trump, xt = x.s === trump;
      if (xt && !wt) return x; if (wt && !xt) return w;
      if (x.s === w.s && x.r > w.r) return x; return w;
    });
  }
  function legal(ps, seat) {
    const h = ps.hands[seat], all = [];
    h.forEach((rs, s) => rs.forEach(r => all.push({ s, r })));
    if (!ps.trick.length) return all;
    const led = ps.trick[0].s;
    return h[led].length ? all.filter(c => c.s === led) : all;
  }
  // Marque duplicate
  function score(c, tricks, vulSide) {
    if (!c) return 0;
    const vul = vulSide, need = 6 + c.l, per = c.s === '♣' || c.s === '♦' ? 20 : 30;
    if (tricks >= need) {
      let base = c.s === 'SA' ? 40 + 30 * (c.l - 1) : per * c.l;
      base *= c.dbl === 2 ? 4 : c.dbl === 1 ? 2 : 1;
      let tot = base + (base >= 100 ? (vul ? 500 : 300) : 50);
      if (c.l === 6) tot += vul ? 750 : 500; if (c.l === 7) tot += vul ? 1500 : 1000;
      if (c.dbl) tot += c.dbl === 2 ? 100 : 50;
      const over = tricks - need;
      tot += c.dbl === 0 ? over * (c.s === 'SA' ? 30 : per) : over * (vul ? 200 : 100) * c.dbl;
      return tot;
    }
    const u = need - tricks;
    if (!c.dbl) return -u * (vul ? 100 : 50);
    let pen = 0;
    for (let k = 1; k <= u; k++) pen += vul ? (k === 1 ? 200 : 300) : (k === 1 ? 100 : k <= 3 ? 200 : 300);
    return -pen * c.dbl;
  }
  const isVul = (deal, side) => deal.v === 'all' || deal.v === side;
  function pctNS(deal, ns) {
    let below = 0, eq = 0, tot = 0;
    for (const [sc, k] of deal.freq) { tot += k; if (sc < ns) below += k; else if (sc === ns) eq += k; }
    return tot ? Math.round(((below + eq / 2) / tot) * 1000) / 10 : null;
  }
  const contractTxt = c => (!c ? 'Passe générale' : c.l + c.s + (c.dbl === 2 ? 'XX' : c.dbl ? 'X' : '') + ' par ' + NAMES[c.decl]);

  // ───── Après chaque changement : fin de donne, robots, maître absent
  function afterUpdate() {
    const t = current; if (!t) return;
    clearTimeout(robotTimer);
    // le maître est parti : le premier humain présent reprend la table
    if (t.maitre !== me() && !isFresh(t.maitre) && presence.length) {
      const firstHuman = SEATS.map(s => t.sieges[s]).find(x => x && x.uid && isFresh(x.uid));
      if (firstHuman && firstHuman.uid === me()) tx(x => (x.maitre === t.maitre ? { maitre: me() } : null));
    }
    if (t.etat === 'fin' && t.fin) {
      if ((t.fin.uids || []).includes(me())) markPlayed(t.fin.n);      // seulement ceux qui l'ont jouée
      // le maître enregistre le résultat (une seule fois par donne et par table)
      const k = 'raimon-res:' + curId + ':' + t.fin.n + ':' + (t.historique || []).length;
      let done = false; try { done = !!sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); } catch (e) { /* pas grave */ }
      if (isMaster(t) && !done) db.collection('resultats').add({ ...t.fin, table: curId, t: now() }).catch(() => {});
    }
    if (!t.n || (t.etat !== 'encheres' && t.etat !== 'jeu')) return;
    const deal = dealOf(t.n); if (!deal) return;
    const A = auction(t, deal);
    if (t.etat === 'encheres') {
      if (A.ended) { if (isMaster(t)) tx(x => endAuction(x, deal)); return; }
      if (isMaster(t) && t.sieges[A.turn] && t.sieges[A.turn].robot) robotTimer = setTimeout(() => move('bid', 'P', t.moves), 700);
      return;
    }
    const ps = playState(t, deal, A.contract);
    if (ps.done) { if (isMaster(t)) tx(x => endDeal(x, deal)); return; }
    const ctrl = ps.turn === ps.dummy ? A.contract.decl : ps.turn;
    if (isMaster(t) && t.sieges[ctrl] && t.sieges[ctrl].robot) robotTimer = setTimeout(() => move('card', robotCard(ps, ps.turn, A.contract), t.moves), ps.trick.length === 0 && t.plays.length ? 1400 : 800);
  }
  function endAuction(x, deal) {
    if (x.etat !== 'encheres') return null;
    const A = auction(x, deal); if (!A.ended) return null;
    if (!A.contract) return endDeal(x, deal);
    return { etat: 'jeu' };
  }
  function endDeal(x, deal) {
    if (x.etat === 'fin') return null;
    const A = auction(x, deal), c = A.contract;
    let tricksDecl = 0, ns = 0;
    if (c) {
      const ps = playState(x, deal, c); if (!ps.done) return null;
      tricksDecl = ps.tricks[sideOf(c.decl)];
      const sc = score(c, tricksDecl, isVul(deal, sideOf(c.decl)));
      ns = sideOf(c.decl) === 'NS' ? sc : -sc;
    }
    const p = pctNS(deal, ns);
    const robots = SEATS.filter(s => x.sieges[s] && x.sieges[s].robot).length;
    const fin = { n: deal.n, contrat: contractTxt(c), levees: tricksDecl, ns, pct: p, robots, joueurs: Object.fromEntries(SEATS.map(s => [s, x.sieges[s] ? (x.sieges[s].robot ? 'Robot' : x.sieges[s].nom) : '—'])),
      uids: SEATS.map(s => x.sieges[s] && x.sieges[s].uid).filter(Boolean) };
    return { etat: 'fin', fin, historique: [...(x.historique || []), fin] };
  }
  async function markPlayed(n) {
    const key = 'raimon-joue:' + me() + ':' + n;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* pas grave */ }
    db.collection('joues').doc(me()).set({ nom: getPlayer(), liste: firebase.firestore.FieldValue.arrayUnion(n) }, { merge: true }).catch(() => {});
  }
  // Une enchère ou une carte : transaction (vérifie que c'est bien le tour et que rien n'a bougé entre-temps)
  function move(kind, val, expected) {
    return tx(x => {
      if (x.moves !== expected) return null;
      const deal = dealOf(x.n); if (!deal) return null;
      if (kind === 'bid') {
        if (x.etat !== 'encheres') return null;
        const A = auction(x, deal); if (A.ended) return null;
        if (bidRank(val) >= 0 && bidRank(val) <= A.last) return null;
        if ((val === 'X' && !A.canX) || (val === 'XX' && !A.canXX)) return null;
        const bids = [...x.bids, val], upd = { bids, moves: x.moves + 1 };
        const A2 = auction({ ...x, bids }, deal);
        if (A2.ended && !A2.contract) return { ...upd, ...endDeal({ ...x, ...upd }, deal) };
        if (A2.ended) upd.etat = 'jeu';
        return upd;
      }
      if (x.etat !== 'jeu') return null;
      const A = auction(x, deal), ps = playState(x, deal, A.contract);
      const ok = legal(ps, ps.turn).some(c => c.s === val.s && c.r === val.r); if (!ok) return null;
      const plays = [...x.plays, val.s + RCH[12 - val.r]], upd = { plays, moves: x.moves + 1 };
      if (plays.length === 52) return { ...upd, ...endDeal({ ...x, ...upd }, deal) };
      return upd;
    });
  }

  // ───── Robot provisoire : passe aux enchères ; au jeu, règles simples (entame 4e meilleure / tête de séquence,
  // 2e joue bas, 3e joue haut, ne surprend pas son partenaire maître, défausse la plus petite).
  function robotCard(ps, seat, c) {
    const L = legal(ps, seat), trump = ps.trump;
    const low = arr => arr.reduce((a, b) => (b.r < a.r ? b : a));
    if (!ps.trick.length) {
      const h = ps.hands[seat];
      const suitsOk = [0, 1, 2, 3].filter(s => h[s].length && s !== trump);
      const s = (suitsOk.length ? suitsOk : [0, 1, 2, 3].filter(x => h[x].length)).sort((a, b) => h[b].length - h[a].length)[0];
      const rs = [...h[s]].sort((a, b) => b - a);
      if (rs.length >= 2 && rs[0] >= 10 && rs[0] - rs[1] === 1) return { s, r: rs[0] };       // tête de séquence
      if (rs.length >= 4) return { s, r: rs[3] };                                              // 4e meilleure
      return { s, r: rs[0] };                                                                  // courte : la plus haute
    }
    const w = winnerOf(ps.trick, trump), pos = ps.trick.length;
    const partnerWins = w.seat === partner(seat);
    const beats = x => winnerOf([...ps.trick, { seat, ...x }], trump).seat === seat;
    const winners = L.filter(beats);
    if (L.every(x => x.s === ps.trick[0].s)) {                       // il fournit
      if (partnerWins || pos === 1) return low(L);
      return winners.length ? low(winners) : low(L);
    }
    if (!partnerWins && trump !== null && winners.length) return low(winners);   // il coupe
    const nonTrump = L.filter(x => x.s !== trump);
    void c;
    return low(nonTrump.length ? nonTrump : L);
  }

  // ───── Affichage de la table (ta place toujours en bas)
  const cardBtn = (s, r, cls, attrs) => cardHtml(s, RLAB[r], cls, attrs);
  function renderTable() {
    const t = current; if (!t || !curId) return;
    document.body.classList.add('tablemode');
    const my = mySeat(t), deal = t.n ? dealOf(t.n) : null;
    const draft = (document.getElementById('chatin') || {}).value || '';
    const bottom = my || 'S', top = partner(bottom), left = next(bottom), right = next(top);
    let body = '';
    if (t.etat === 'attente' || t.etat === 'fin' || !deal) body = lobbyHtml(t, my);
    else {
      const A = auction(t, deal);
      if (t.etat === 'encheres') body = biddingHtml(t, deal, A, my, { top, left, right, bottom });
      else body = playHtml(t, deal, A, my, { top, left, right, bottom });
    }
    app.innerHTML = topbar(esc(t.nom) + (t.n ? ' · ' + t.n : ''), 'Salon', `<button class="tobtn" data-act="chat">💬</button>`) + body
      + (ui.msg ? `<div class="notice">${ui.msg}</div>` : '')
      + (ui.chatOpen ? `<div class="tchat">${chatHtml(draft)}</div>` : '');
    ui.msg = '';
    on('back', () => { if (t.etat === 'jeu' || t.etat === 'encheres') { if (!confirm('Quitter la table en pleine donne ?')) return; } leaveTable(); });
    on('chat', () => { ui.chatOpen = !ui.chatOpen; renderTable(); });
    if (ui.chatOpen) wireChat();
    app.querySelectorAll('[data-sit]').forEach(b => b.addEventListener('click', () => sit(b.dataset.sit)));
    app.querySelectorAll('[data-robot]').forEach(b => b.addEventListener('click', () => setRobot(b.dataset.robot, true)));
    app.querySelectorAll('[data-free]').forEach(b => b.addEventListener('click', () => freeSeat(b.dataset.free)));
    on('deal', nextDeal);
    on('resetscore', () => { if (confirm('Remettre à zéro les scores de cette table ?')) tx(x => (isMaster(x) ? { historique: [], fin: null, etat: x.etat === 'fin' ? 'attente' : x.etat } : null)); });
    app.querySelectorAll('[data-bid]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.bid;
      if (ui.choice !== v) { ui.choice = v; renderTable(); return; }
      ui.choice = null; move('bid', v, t.moves);
    }));
    app.querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => {
      const [s, r] = b.dataset.card.split(':').map(Number);
      if (ui.sel !== s && b.dataset.multi === '1') { ui.sel = s; renderTable(); return; }
      ui.sel = null; move('card', { s, r }, t.moves);
    }));
  }
  function lobbyHtml(t, my) {
    const master = isMaster(t);
    const seatsHtml = SEATS.map(s => {
      const st = t.sieges[s];
      let act = '';
      if (!st) act = `${!my || my !== s ? `<button class="btn center sm" data-sit="${s}">M’asseoir</button>` : ''}${master ? `<button class="btn center sm" data-robot="${s}">＋ Robot</button>` : ''}`;
      else if (master && (st.robot || (st.uid !== me() && !isFresh(st.uid)))) act = `<button class="btn center sm" data-free="${s}">Libérer</button>`;
      return `<div class="tseat"><b>${NAMES[s]}</b><div>${seatLabel(st)}${st && st.uid === t.maitre ? ' 👑' : ''}</div>${act}</div>`;
    }).join('');
    const full = SEATS.every(s => t.sieges[s]);
    const fin = t.etat === 'fin' && t.fin ? resultHtml(t) : '';
    const hist = (t.historique || []);
    const avg = hist.filter(h => h.pct !== null);
    const mean = avg.length ? Math.round(avg.reduce((s, h) => s + h.pct, 0) / avg.length * 10) / 10 : null;
    const pts = hist.reduce((s, h) => s + h.ns, 0);
    return `${fin}
      <div class="tseats">${seatsHtml}</div>
      ${master ? (full ? `<button class="btn primary center" data-act="deal">${t.etat === 'fin' ? 'Donne suivante' : 'Distribuer la première donne'}</button>` : '<p class="center feltnote">Il faut 4 joueurs (ou robots) pour distribuer.</p>')
        : `<p class="center feltnote">${full ? 'Le maître de table 👑 va distribuer.' : 'En attente de joueurs…'}</p>`}
      ${hist.length ? `<div class="card"><b>Score de la table : ${hist.length} donne(s)</b>
        <div class="tscore"><div><small>NS</small><b>${mean ?? '—'} %</b><small>${pts > 0 ? '+' : ''}${pts} pts</small></div><div><small>EO</small><b>${mean === null ? '—' : Math.round((100 - mean) * 10) / 10} %</b><small>${-pts > 0 ? '+' : ''}${-pts} pts</small></div></div>
        <div class="hist">${hist.map(h => `<div><span>${h.n}</span><span>${fmt(h.contrat)}</span><span>${h.ns > 0 ? '+' : ''}${h.ns}</span><span>${h.pct === null ? '—' : h.pct + ' %'}</span></div>`).join('')}</div>
        ${master && t.etat !== 'encheres' && t.etat !== 'jeu' ? '<button class="link" data-act="resetscore" style="margin-top:8px">Remettre les scores à zéro</button>' : ''}</div>` : ''}`;
  }
  function resultHtml(t) {
    const f = t.fin, deal = dealOf(f.n); if (!deal) return '';
    const line = s => DISPLAY.map(x => `<span class="${red(x) ? 'red' : ''}">${SYM[x]}</span>${deal[s].split('.')[x].replace(/T/g, '10').replace(/-/g, '—').replace(/J/g, 'V').replace(/Q/g, 'D').replace(/K/g, 'R') || '—'}`).join(' ');
    const total = deal.freq.reduce((s, x) => s + x[1], 0);
    const near = [...deal.freq].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `<div class="card">
      <b>Donne ${f.n}</b> <small class="muted">(${deal.src.simu} du ${deal.src.date.split('-').reverse().join('/')}, donne ${deal.src.num})</small>
      <p style="margin:6px 0">${fmt(f.contrat)}${f.contrat !== 'Passe générale' ? ` · ${f.levees} levées` : ''} · <b>NS ${f.ns > 0 ? '+' : ''}${f.ns}</b></p>
      <p style="margin:6px 0;font-size:18px"><b>NS ${f.pct ?? '—'} %</b> · EO ${f.pct === null ? '—' : Math.round((100 - f.pct) * 10) / 10} % <small class="muted">face à ${total} tables</small></p>
      ${f.robots ? '<p class="muted" style="font-size:13px;margin:0 0 6px">Avec des robots à la table, ce pourcentage est indicatif.</p>' : ''}
      <div class="fhands">${SEATS.map(s => `<div><b>${NAMES[s]}</b> <small class="muted">${esc(f.joueurs[s])}</small><br>${line(s)}</div>`).join('')}</div>
      <details style="margin-top:8px"><summary class="muted">Résultats de la salle</summary><div class="hist">${near.map(([sc, k]) => `<div><span>NS ${sc > 0 ? '+' : ''}${sc}</span><span>${k} table(s)</span></div>`).join('')}</div></details></div>`;
  }
  function plate(t, deal, s, pos, extra, turn) {
    const st = t.sieges[s], vul = isVul(deal, sideOf(s));
    return `<div class="plate ${pos} ${turn === s ? 'turn' : ''}"><span class="seat ${vul ? '' : 'nv'}">${s}</span>${st ? (st.robot ? '🤖' : esc(st.nom)) : '—'}${deal.d === s ? '<span class="dealer">D</span>' : ''}${extra || ''}</div>`;
  }
  function auctionTable(t, deal) {
    const order = ['O', 'N', 'E', 'S'], start = order.indexOf(deal.d), cells = [];
    for (let i = 0; i < start; i++) cells.push('<span></span>');
    t.bids.forEach((b, i) => cells.push(bidCard(b, i === t.bids.length - 1 ? 'last' : '')));
    return `<div class="atab">${order.map(s => `<b>${NAMES[s]}</b>`).join('')}${cells.join('')}</div>`;
  }
  function handHtml(hand, seat, clickable, L) {
    const cards = DISPLAY.flatMap(s => [...hand[s]].sort((a, b) => b - a).map(r => ({ s, r })));
    const multiSuits = new Set(L.map(c => c.s)).size > 1;
    return `<div class="fan thand">${cards.map(c => {
      const ok = clickable && L.some(x => x.s === c.s && x.r === c.r);
      const cls = 'md ' + (ok ? (ui.sel === c.s ? 'play' : 'can') : clickable ? 'dim' : '');
      return cardBtn(c.s, c.r, cls, ok ? `data-card="${c.s}:${c.r}" data-multi="${multiSuits && ui.sel !== c.s ? 1 : 0}"` : '');
    }).join('')}</div>`;
  }
  function biddingHtml(t, deal, A, my, P) {
    const myTurn = my && A.turn === my;
    const hand = my ? parseHand(deal[my]) : null;
    const cols = ['SA', '♠', '♥', '♦', '♣'];
    let rows = '';
    if (myTurn) for (let l = 1; l <= 7; l++) if (bidRank(l + 'SA') > A.last) rows += cols.map((c, k) => { const b = l + c, ok = bidRank(b) > A.last; return `<button class="gb g${k} ${ui.choice === b ? 'sel' : ''}" ${ok ? `data-bid="${b}"` : 'disabled'}>${l}<span>${c === 'SA' ? 'SA' : fmt(c)}</span></button>`; }).join('');
    const box = myTurn ? `<div class="gridwrap"><div class="gridbox">${rows}</div>
      <div class="gspecial"><button class="gb gpass ${ui.choice === 'P' ? 'sel' : ''}" data-bid="P">PASSE</button><button class="gb gx ${ui.choice === 'X' ? 'sel' : ''}" ${A.canX ? 'data-bid="X"' : 'disabled'}>X</button><button class="gb gxx ${ui.choice === 'XX' ? 'sel' : ''}" ${A.canXX ? 'data-bid="XX"' : 'disabled'}>XX</button></div></div>
      <p class="gridhint">${ui.choice ? `Touche encore ${ui.choice === 'P' ? 'PASSE' : fmt(ui.choice)} pour l’annoncer` : 'À toi : touche ton enchère'}</p>`
      : `<p class="center feltnote">${A.turn ? 'Au tour de ' + NAMES[A.turn] + (t.sieges[A.turn] && t.sieges[A.turn].robot ? ' (robot)' : '') : ''}</p>`;
    return `<div class="frame">${plate(t, deal, P.top, 'top', '', A.turn)}${plate(t, deal, P.left, 'left', '', A.turn)}${plate(t, deal, P.right, 'right', '', A.turn)}${plate(t, deal, P.bottom, 'bottom', '', A.turn)}
      ${auctionTable(t, deal)}</div>
      ${box}
      ${hand ? handHtml(hand, my, false, []) : ''}`;
  }
  function playHtml(t, deal, A, my, P) {
    const c = A.contract, ps = playState(t, deal, c);
    const ctrlOf = s => (s === ps.dummy ? c.decl : s);
    const iControl = my && ctrlOf(ps.turn) === my;
    const L = iControl ? legal(ps, ps.turn) : [];
    const pos = { [P.top]: 'top', [P.left]: 'left', [P.right]: 'right', [P.bottom]: 'bottom' };
    const w = ps.trick.length === 4 ? winnerOf(ps.trick, ps.trump) : null;
    const shownTrick = ps.trick.length ? ps.trick : (ps.last || []);
    const w2 = !ps.trick.length && ps.last ? winnerOf(ps.last, ps.trump) : null;
    const slots = SEATS.map(s => { const x = shownTrick.find(k => k.seat === s); return `<div class="slot ${pos[s]}">${x ? cardBtn(x.s, x.r, 'md ' + ((w && w.seat === s) || (w2 && w2.seat === s) ? 'win' : '')) : ''}</div>`; }).join('');
    const count = s => ps.hands[s].reduce((n, x) => n + x.length, 0);
    const dummyBlock = ps.shown && ps.dummy !== my ? (() => {
      const clickable = iControl && ps.turn === ps.dummy;
      const cols = DISPLAY.filter(s => ps.hands[ps.dummy][s].length).map(s => `<div class="dcol">${[...ps.hands[ps.dummy][s]].sort((a, b) => b - a).map(r => {
        const ok = clickable && L.some(x => x.s === s && x.r === r);
        return cardBtn(s, r, 'md ' + (ok ? 'can' : ''), ok ? `data-card="${s}:${r}" data-multi="0"` : '');
      }).join('')}</div>`).join('');
      return `<p class="feltnote center" style="margin:4px 0">Mort : ${NAMES[ps.dummy]}${clickable ? ' — à toi de jouer pour lui' : ''}</p><div class="dummy">${cols}</div>`;
    })() : '';
    const myHand = my ? handHtml(ps.hands[my], my, iControl && ps.turn === my, iControl && ps.turn === my ? L : []) : '';
    const turnTxt = ps.done ? '' : iControl ? (ps.turn === my ? 'À toi de jouer' : 'À toi de jouer le mort') : 'Au tour de ' + NAMES[ps.turn];
    return `${dummyBlock}
      <div class="frame">${[P.top, P.left, P.right, P.bottom].map(s => plate(t, deal, s, pos[s], ` · ${count(s)}${s === c.decl ? ' <span class="contract">' + c.l + fmt(c.s) + (c.dbl === 2 ? 'XX' : c.dbl ? 'X' : '') + '</span>' : ''}`, ps.turn)).join('')}
        <div class="corner cl">NS<br><b>${ps.tricks.NS}</b></div><div class="corner cr">EO<br><b>${ps.tricks.EO}</b></div>
        <div class="trick">${slots}</div></div>
      <p class="center feltnote" style="margin:4px 0">${turnTxt}</p>
      ${myHand}
      `;
  }

  return { open, stop: () => { stopAll(); stopBeat(); } , _test: { auction, score, pctNS, weekStart } };
}
