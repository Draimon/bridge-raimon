// Système Raimon — salon de bridge : joueurs connectés, chat général, tables de 4 (humains ou robots),
// enchères et jeu de la carte en direct (Firestore temps réel), marque par paires en % face à la salle FFB.
// Données : presence/{uid}, chat/{id}, tables/{id} (tout l'état d'une table dans un seul document),
// joues/{uid} (donnes déjà jouées), resultats/{id}. Les donnes viennent des simultanés FFB (FFB_DEALS).

function createSalon(env) {
  'use strict';
  const { app, topbar, on, fmt, esc, bidCard, home, getPlayer, isGuest } = env;
  const db = firebase.firestore();
  const MAX = 16;                                    // joueurs connectés en même temps (quota gratuit Firebase)
  const FRESH = 300000;                              // présence : vu il y a moins de 5 min (absence tolérée avant de perdre la main)
  const SEATS = ['N', 'E', 'S', 'O'];
  const NAMES = { N: 'Nord', E: 'Est', S: 'Sud', O: 'Ouest' };
  const STRAINS = ['♣', '♦', '♥', '♠', 'SA'];
  const SUIT_OF = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  const SYM = ['♠', '♥', '♦', '♣'], RCH = 'AKQJT98765432';
  const RLAB = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const DISPLAY = [0, 1, 3, 2];
  let TRUMP = null;                                                 // au jeu : l'atout à gauche, puis noir / rouge en alternance
  const ord = hand => window.suitOrder([0, 1, 2, 3].map(s => hand[s].length), TRUMP);
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
  let ui = { sel: null, choice: null, msg: '' };
  let tab = 'main', since = null, histCache = null, autoKey = null, autoTimer = null;
  const seenKey = () => 'raimon-chat-vu:' + me();
  const getSeen = () => { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } };
  const setSeen = () => { try { localStorage.setItem(seenKey(), String(now())); } catch (e) { /* stockage indisponible */ } };
  const unread = () => chat.some(m => m.uid !== me() && m.t > getSeen());
  function markChatTab() { const b = document.getElementById('tabchat'); if (b) b.classList.toggle('dotted', tab !== 'chat' && unread()); }

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
    try { await db.collection('presence').doc(uid).set({ nom: getPlayer(), invite: isGuest(), ou: where, t: now(), depuis: since }); } catch (e) { /* hors ligne */ }
  }
  function startBeat(w) {
    where = w; if (!since) since = now(); heartbeat();
    if (!beat) beat = setInterval(heartbeat, 60000);
  }
  function stopBeat() {
    clearInterval(beat); beat = null; where = null; since = null;
    const uid = me(); if (uid) db.collection('presence').doc(uid).delete().catch(() => {});
  }
  window.addEventListener('raimon-update', () => { if (curId && current) { afterUpdate(); if (tab === 'main') renderTable(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !where) return;
    heartbeat();
    if (curId && current) { afterUpdate(); if (tab === 'main') renderTable(); }   // les robots repartent depuis ce téléphone
  });
  // Table en cours gardée sur le téléphone : si l'appli a été fermée ou rechargée, on y revient tout seul
  const tableKey = () => 'raimon-table:' + me();
  const rememberTable = id => { try { if (id) localStorage.setItem(tableKey(), id); else localStorage.removeItem(tableKey()); } catch (e) { /* stockage indisponible */ } };
  async function resumeTable() {
    let id = null; try { id = localStorage.getItem(tableKey()); } catch (e) { id = null; }
    if (!id) return false;
    try {
      const d = await db.collection('tables').doc(id).get();
      const t = d.exists && d.data();
      if (!t || t.etat === 'fermee' || !SEATS.some(k => t.sieges[k] && t.sieges[k].uid === me())) { rememberTable(null); return false; }
      enterTable(id); return true;
    } catch (e) { return false; }
  }
  const fresh = () => presence.filter(p => p.t > now() - FRESH);
  const isFresh = uid => fresh().some(p => p.id === uid);
  // Présences reçues : si la famille a eu besoin de ma place, je sors du salon
  function onPresence(snap) {
    presence = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const mine = presence.find(p => p.id === me());
    if (mine && mine.kick) { kicked(); return true; }
    return false;
  }
  function kicked() {
    rememberTable(null);
    stopAll(); clearTimeout(robotTimer); clearInterval(beat); beat = null; where = null; since = null; curId = null; current = null;
    db.collection('presence').doc(me()).delete().catch(() => {});
    document.body.classList.remove('tablemode', 'salonmode', 'inplay');
    app.innerHTML = topbar('Salon de bridge', 'Quitter') + `<div class="card center"><h3>Salon complet</h3><p>Le salon est limité à ${MAX} joueurs et un membre de la famille Raimon vient d’arriver : tu as cédé ta place. Reviens un peu plus tard !</p></div>`;
    on('back', leave);
  }

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
  async function open(startTab) {
    stopAll(); current = null; curId = null; tab = 'main';
    document.body.classList.remove('tablemode', 'inplay'); document.body.classList.add('salonmode');
    app.innerHTML = topbar('Salon de bridge', isGuest() ? 'Quitter' : 'Accueil') + '<p class="center muted">Entrée dans le salon…</p>';
    on('back', leave);
    let snap;
    try { snap = await db.collection('presence').get(); } catch (e) { app.innerHTML += '<p class="center">Connexion au salon impossible.</p>'; return; }
    presence = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!isFresh(me()) && fresh().length >= MAX && !isGuest()) {
      // Famille prioritaire : l'invité arrivé en dernier cède sa place
      const victim = fresh().filter(p => p.invite).sort((a, b) => (b.depuis || b.t) - (a.depuis || a.t))[0];
      if (victim) await db.collection('presence').doc(victim.id).update({ kick: true }).catch(() => {});
    } else if (!isFresh(me()) && fresh().length >= MAX) {
      app.innerHTML = topbar('Salon de bridge', isGuest() ? 'Quitter' : 'Accueil') + `<div class="card center"><h3>Salon complet</h3><p>${MAX} joueurs sont déjà connectés (maximum pour rester dans l’offre gratuite). Réessaie un peu plus tard.</p></div>`;
      on('back', leave); return;
    }
    startBeat('salon');
    cleanup();
    unsubs.push(db.collection('presence').onSnapshot(s => { if (!onPresence(s)) renderSalon(); }));
    unsubs.push(db.collection('tables').where('maj', '>', now() - 12 * 3600000).onSnapshot(s => { tables = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSalon(); checkInvites(); }));
    listenChat(); listenPending();
    if (startTab) tab = startTab;
    if (!startTab && await resumeTable()) return;
    render();
  }
  function listenChat() {
    unsubs.push(db.collection('chat').where('t', '>=', weekStart()).orderBy('t', 'desc').limit(50).onSnapshot(s => {
      chat = s.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      const box = document.getElementById('chatlog'); if (box) { box.innerHTML = chatLog(); box.scrollTop = box.scrollHeight; }
      if (tab === 'chat') setSeen();
      markChatTab();
    }, () => {}));
  }
  function leave() {
    stopAll(); stopBeat(); clearTimeout(robotTimer);
    document.body.classList.remove('tablemode', 'salonmode', 'inplay');
    if (isGuest()) { firebase.auth().signOut().catch(() => {}); location.reload(); } else home();
  }
  const seatLabel = st => (!st ? '<i class="muted">libre</i>' : st.robot ? '🤖 Robot ' + (st.sys === 'raimon' ? 'Raimon' : 'SEF') : esc(st.nom) + (isFresh(st.uid) ? '' : ' <span class="muted">(absent)</span>'));
  function renderSalon() {
    if (curId || tab !== 'main') return;
    const ps = fresh().sort((a, b) => a.nom.localeCompare(b.nom));
    const live = tables.filter(t => t.etat !== 'fermee');
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
      <p class="center"><button class="link" data-act="news">✨ Quoi de neuf ?</button></p>${tabBar()}`;
    on('back', leave);
    on('create', createTable);
    on('news', () => showNews(getPlayer(), isGuest(), true));
    app.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => enterTable(b.dataset.join)));
    wireTabs();
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
    rememberTable(id);
    stopAll(); curId = id; tab = 'main'; ui = { sel: null, choice: null, msg: '', noAuto: false, lastAt: null }; clearTimeout(autoTimer); autoKey = null;
    startBeat('table:' + id);
    unsubs.push(db.collection('presence').onSnapshot(s => { onPresence(s); }));
    unsubs.push(db.collection('tables').doc(id).onSnapshot(d => {
      if (!d.exists || d.data().etat === 'fermee') { rememberTable(null); curId = null; open(); return; }
      current = { id: d.id, ...d.data() };
      afterUpdate();
      if (tab === 'main') renderTable(); else markTableTab();
    }));
    listenChat(); listenPending();
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
  // Robot SEF ou Raimon ; deux robots partenaires jouent forcément le même système
  function setRobot(seat, sys) {
    tx(t => {
      if (!isMaster(t) || t.sieges[seat]) return null;
      const mate = t.sieges[partner(seat)];
      const final = mate && mate.robot && mate.sys && mate.sys !== sys ? mate.sys : sys;
      if (final !== sys) ui.msg = 'Son partenaire est un robot ' + (final === 'raimon' ? 'Raimon' : 'SEF') + ' : il joue le même système.';
      return { sieges: { ...t.sieges, [seat]: { robot: true, sys: final } } };
    });
  }
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
    }).then(() => { rememberTable(null); if (curId === id) { curId = null; open(); } });
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
    tx(x => (!isMaster(x) || x.etat === 'encheres' || x.etat === 'jeu' ? null : { n: pick.n, bids: [], notes: [], plays: [], moves: 0, etat: 'encheres', fin: null, claim: null }));
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
  // Le partenaire robot est déclarant et je suis son mort : c'est moi qui joue le contrat (les deux mains)
  function swapOf(t, c) {
    if (!c) return null;
    const d = t.sieges[c.decl], m = t.sieges[partner(c.decl)];
    return d && d.robot && m && m.uid ? { human: partner(c.decl), uid: m.uid } : null;
  }
  function playState(t, deal, c) {
    const hands = {}; SEATS.forEach(s => { hands[s] = parseHand(deal[s]); });
    const trump = c.s === 'SA' ? null : SUIT_OF[c.s];
    let leader = next(c.decl), trick = [], tricks = { NS: 0, EO: 0 }, last = null;
    const played = [], voids = { N: [], E: [], S: [], O: [] }, firstLed = {};
    for (const p of t.plays) {
      const s = +p[0], r = 12 - RCH.indexOf(p[1]);
      const seat = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
      hands[seat][s] = hands[seat][s].filter(x => x !== r);
      if (trick.length && s !== trick[0].s && !voids[seat].includes(trick[0].s)) voids[seat].push(trick[0].s);
      if (!trick.length && firstLed[seat] === undefined) firstLed[seat] = s;
      trick.push({ seat, s, r });
      if (trick.length === 4) {
        const w = winnerOf(trick, trump); tricks[sideOf(w.seat)]++; last = trick; leader = w.seat; played.push(...trick); trick = [];
      }
    }
    const turn = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
    return { hands, trump, trick, tricks, last, turn, leader, played, voids, firstLed, done: t.plays.length === 52, dummy: partner(c.decl), shown: t.plays.length > 0 };
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
  function actingSeat(t) {
    const deal = t.n && dealOf(t.n); if (!deal || (t.etat !== 'encheres' && t.etat !== 'jeu')) return null;
    const A = auction(t, deal);
    if (t.etat === 'encheres') return A.ended ? null : A.turn;
    const ps = playState(t, deal, A.contract); if (ps.done) return null;
    const sw = swapOf(t, A.contract);
    return sw && (ps.turn === A.contract.decl || ps.turn === ps.dummy) ? sw.human : ps.turn === ps.dummy ? A.contract.decl : ps.turn;
  }
  const SLOW = 60000;                                                    // au-delà (1 min sans jouer) : « ne répond plus »
  // Un joueur ne répond plus (absent, ou rien joué depuis 1 min) : le maître peut le remplacer par un robot
  function stuckSeat(t) {
    const seat = actingSeat(t), st = seat && t.sieges[seat];
    if (!st || !st.uid || st.uid === me()) return null;
    return !isFresh(st.uid) || now() - (t.maj || 0) > SLOW ? seat : null;
  }
  function replaceByRobot(seat) {
    tx(x => {
      if (!isMaster(x) || !x.sieges[seat] || !x.sieges[seat].uid) return null;
      const mate = x.sieges[partner(seat)];
      return { sieges: { ...x.sieges, [seat]: { robot: true, sys: mate && mate.robot && mate.sys ? mate.sys : 'sef' } } };
    });
  }
  let slowTimer = null;
  function afterUpdate() {
    const t = current; if (!t) return;
    clearTimeout(robotTimer); clearTimeout(slowTimer);
    // maître : réafficher la table au bout d’1 min si un joueur tarde, pour proposer de le remplacer
    if (isMaster(t)) { const seat = actingSeat(t), st = seat && t.sieges[seat]; if (st && st.uid && st.uid !== me()) slowTimer = setTimeout(() => { if (tab === 'main') renderTable(); }, Math.max(1000, SLOW - (now() - (t.maj || now())) + 500)); }
    // le maître est parti : le premier humain présent reprend la table
    if (t.maitre !== me() && !isFresh(t.maitre) && presence.length) {
      const firstHuman = SEATS.map(s => t.sieges[s]).find(x => x && x.uid && isFresh(x.uid));
      if (firstHuman && firstHuman.uid === me()) tx(x => (x.maitre === t.maitre ? { maitre: me() } : null));
    }
    // Nouvelle version publiée : on recharge pendant le résultat (jamais en pleine donne) ; on revient tout seul à la table
    if ((t.etat === 'fin' || t.etat === 'attente') && window.__raimonUpdate && !ui.reloading) {
      ui.reloading = true; ui.msg = '🔄 Mise à jour de l’appli…';
      setTimeout(() => location.reload(), 2500);
    }
    if (t.etat === 'fin' && t.fin && isMaster(t) && SEATS.every(k => t.sieges[k]) && !ui.noAuto) {
      const key = curId + ':' + (t.historique || []).length;
      if (autoKey !== key) { autoKey = key; clearTimeout(autoTimer); autoTimer = setTimeout(() => { if (current && current.etat === 'fin' && !ui.noAuto) nextDeal(); }, 9000); }
    }
    if (t.etat === 'fin' && t.fin) {
      if ((t.fin.uids || []).includes(me())) markPlayed(t.fin.n);      // seulement ceux qui l'ont jouée
      // le maître enregistre le résultat (une seule fois par donne et par table)
      const k = 'raimon-res:' + curId + ':' + t.fin.n + ':' + (t.historique || []).length;
      let done = false; try { done = !!sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); } catch (e) { /* pas grave */ }
      if (isMaster(t) && !done) db.collection('resultats').add({ ...t.fin, table: curId, t: now() }).catch(() => {});
    }
    if (t.etat === 'jeu' && t.claim && isMaster(t)) robotCheckClaim(t);
    if (t.claim || t.undo) return;                                      // rien ne bouge pendant une revendication ou une demande d'annulation
    if (!t.n || (t.etat !== 'encheres' && t.etat !== 'jeu')) return;
    const deal = dealOf(t.n); if (!deal) return;
    const A = auction(t, deal);
    if (t.etat === 'encheres') {
      if (A.ended) { if (isMaster(t)) tx(x => endAuction(x, deal)); return; }
      if (isMaster(t) && t.sieges[A.turn] && t.sieges[A.turn].robot) robotTimer = setTimeout(() => { const r = RaimonBid.bid(deal[A.turn], t.bids, deal.d, deal.v, A.turn, t.sieges[A.turn].sys); move('bid', r.bid, t.moves, { e: r.expl, a: r.alert }); }, 450);
      return;
    }
    const ps = playState(t, deal, A.contract);
    if (ps.done) { if (isMaster(t)) tx(x => endDeal(x, deal)); return; }
    const sw = swapOf(t, A.contract);
    const ctrl = sw && (ps.turn === A.contract.decl || ps.turn === ps.dummy) ? sw.human : ps.turn === ps.dummy ? A.contract.decl : ps.turn;
    if (isMaster(t) && t.sieges[ctrl] && t.sieges[ctrl].robot) robotTimer = setTimeout(() => move('card', robotPlay(t, deal, A, ps, ctrl), t.moves), ps.trick.length === 0 && t.plays.length ? 3000 : 350);
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
      const ps = playState(x, deal, c);
      const cl = x.claim && x.claim.accepted ? x.claim : null;
      if (!ps.done && !cl) return null;
      tricksDecl = ps.tricks[sideOf(c.decl)] + (cl ? (cl.side === sideOf(c.decl) ? cl.k : cl.r - cl.k) : 0);
      const sc = score(c, tricksDecl, isVul(deal, sideOf(c.decl)));
      ns = sideOf(c.decl) === 'NS' ? sc : -sc;
    }
    const p = pctNS(deal, ns);
    const robots = SEATS.filter(s => x.sieges[s] && x.sieges[s].robot).length;
    const fin = { n: deal.n, contrat: contractTxt(c), levees: tricksDecl, ns, pct: p, robots, joueurs: Object.fromEntries(SEATS.map(s => [s, x.sieges[s] ? (x.sieges[s].robot ? 'Robot' : x.sieges[s].nom) : '—'])),
      uids: SEATS.map(s => x.sieges[s] && x.sieges[s].uid).filter(Boolean),
      places: Object.fromEntries(SEATS.map(s => [s, (x.sieges[s] && x.sieges[s].uid) || null])),
      systemes: Object.fromEntries(SEATS.map(s => [s, x.sieges[s] && x.sieges[s].robot ? (x.sieges[s].sys || 'sef') : null])), bids: x.bids, notes: x.notes || [], plays: x.plays || [] };
    const { bids: _b, plays: _p, notes: _n, ...light } = fin; void _b; void _p; void _n;
    return { etat: 'fin', fin, historique: [...(x.historique || []), light] };
  }
  async function markPlayed(n) {
    const key = 'raimon-joue:' + me() + ':' + n;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* pas grave */ }
    db.collection('joues').doc(me()).set({ nom: getPlayer(), liste: firebase.firestore.FieldValue.arrayUnion(n) }, { merge: true }).catch(() => {});
    // compteur public des donnes jouées (numéros seulement) : sert au réassort automatique des donnes FFB
    db.collection('stats').doc('ffb').set({ joues: firebase.firestore.FieldValue.arrayUnion(n) }, { merge: true }).catch(() => {});
  }
  // Une enchère ou une carte : transaction (vérifie que c'est bien le tour et que rien n'a bougé entre-temps)
  function move(kind, val, expected, note) {
    return tx(x => {
      if (x.moves !== expected || x.undo) return null;
      const deal = dealOf(x.n); if (!deal) return null;
      if (kind === 'bid') {
        if (x.etat !== 'encheres') return null;
        const A = auction(x, deal); if (A.ended) return null;
        if (bidRank(val) >= 0 && bidRank(val) <= A.last) return null;
        if ((val === 'X' && !A.canX) || (val === 'XX' && !A.canXX)) return null;
        const bids = [...x.bids, val], notes = [...(x.notes || []), ...Array(Math.max(0, x.bids.length - (x.notes || []).length)).fill(null), note || null].slice(0, bids.length);
        const upd = { bids, notes, moves: x.moves + 1 };
        const A2 = auction({ ...x, bids }, deal);
        if (A2.ended && !A2.contract) return { ...upd, ...endDeal({ ...x, ...upd }, deal) };
        if (A2.ended) upd.etat = 'jeu';
        return upd;
      }
      if (x.etat !== 'jeu' || x.claim) return null;
      const A = auction(x, deal), ps = playState(x, deal, A.contract);
      const ok = legal(ps, ps.turn).some(c => c.s === val.s && c.r === val.r); if (!ok) return null;
      const plays = [...x.plays, val.s + RCH[12 - val.r]], upd = { plays, moves: x.moves + 1 };
      if (plays.length === 52) return { ...upd, ...endDeal({ ...x, ...upd }, deal) };
      return upd;
    });
  }

  // ───── Robot de jeu (player.js) : il reçoit seulement sa main, le mort une fois étalé et les cartes jouées
  function robotPlay(t, deal, A, ps, ctrl) {
    const c = A.contract, turn = ps.turn;
    const visible = sideOf(ctrl) === sideOf(c.decl) ? [ctrl === turn ? partner(turn) : c.decl] : (ps.shown ? [ps.dummy] : []);
    const known = {}; SEATS.forEach(x => { known[x] = x === turn || visible.includes(x) ? ps.hands[x] : [[], [], [], []]; });
    const counts = {}; SEATS.forEach(x => { counts[x] = ps.hands[x].reduce((a, y) => a + y.length, 0); });
    const named = {}; t.bids.forEach((b, i) => { const x = SEATS[(SEATS.indexOf(deal.d) + i) % 4]; if (bidRank(b) >= 0 && b.slice(1) !== 'SA' && named[x] === undefined) named[x] = SUIT_OF[b.slice(1)]; });
    try {
      return RaimonPlay.choose({ me: turn, hands: known, visible, trick: ps.trick, played: ps.played, trump: ps.trump, decl: c.decl, counts, voids: ps.voids,
        partnerSuit: named[partner(turn)], partnerLed: ps.firstLed[partner(turn)], myLed: ps.firstLed[turn] }, 500);
    } catch (e) { return robotCard(ps, turn, c); }
  }
  // ───── Robot de secours : passe aux enchères ; au jeu, règles simples (entame 4e meilleure / tête de séquence,
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
  // Diagnostic de la mise en veille : chacun note son état sur la table (seulement quand il change)
  let wakeSent = '';
  function sendWake() {
    if (!curId || !window.__wakeState) return;
    const s = window.__wakeState(); if (s === wakeSent) return; wakeSent = s;
    db.collection('tables').doc(curId).update({ ['wake.' + me()]: getPlayer() + ' · ' + s }).catch(() => {});
  }
  setInterval(sendWake, 20000);
  function renderTable() {
    const t = current; if (!t || !curId || tab !== 'main') return;
    document.body.classList.add('tablemode');
    document.body.classList.toggle('inplay', (t.etat === 'encheres' || t.etat === 'jeu') && tab === 'main');
    const my = mySeat(t), deal = t.n ? dealOf(t.n) : null;
    let bottom = my || 'S';
    if (t.etat === 'jeu' && deal && my) { const A0 = auction(t, deal), sw0 = swapOf(t, A0.contract); if (sw0 && sw0.human === my) bottom = A0.contract.decl; }   // table inversée : le déclarant en bas
    const top = partner(bottom), left = next(bottom), right = next(top);
    let body = '';
    if (t.etat === 'attente' || t.etat === 'fin' || !deal) body = lobbyHtml(t, my);
    else {
      const A = auction(t, deal);
      if (t.etat === 'encheres') body = biddingHtml(t, deal, A, my, { top, left, right, bottom });
      else body = playHtml(t, deal, A, my, { top, left, right, bottom });
    }
    // score de la table en cours, toujours visible en haut (moyenne des % et points, NS / EO ; ton camp en jaune)
    const hist = (t.historique || []), pv = hist.filter(h => h.pct !== null && h.pct !== undefined);
    const mean = pv.length ? Math.round(pv.reduce((a2, h) => a2 + h.pct, 0) / pv.length) : null, pts = hist.reduce((a2, h) => a2 + h.ns, 0);
    const mySd = my ? sideOf(my) : 'NS';
    const chip = hist.length ? `<span class="tchip" title="Score de la table" data-act="showscores"><span><b class="${mySd === 'NS' ? 'me' : ''}">NS ${mean ?? '—'}%</b><b class="${mySd === 'EO' ? 'me' : ''}">EO ${mean === null ? '—' : 100 - mean}%</b></span><small>${hist.length} donne${hist.length > 1 ? 's' : ''} · NS ${pts > 0 ? '+' : ''}${pts}</small></span>` : '';
    const spop = ui.showScores ? scoresPop(t, my) : '';
    let head = chip;
    if (t.etat === 'jeu' && deal) {
      const c0 = auction(t, deal).contract;
      if (c0) head = `<button class="cchip" data-act="showauction"><b>${c0.l}${fmt(c0.s)}${c0.dbl === 2 ? 'XX' : c0.dbl ? 'X' : ''}</b><small>par ${NAMES[c0.decl]} ▾</small></button>`;
    }
    const seatsPop = ui.showSeats && (t.etat === 'jeu' || t.etat === 'encheres') ? `<div class="popveil" data-act="hideseats"><div class="pop seatspop"><h3>👥 Places</h3><div class="tseats">${seatsGrid(t, my)}</div><p class="muted" style="font-size:12px">Tu peux échanger deux places pendant la donne (ex. remettre un joueur revenu à sa place) : chacun retrouve la main de la place où il est assis.</p><button class="btn primary center" data-act="hideseats">Fermer</button></div></div>` : '';
    const pop = ui.showAuction && deal ? `<div class="popveil" data-act="hideauction"><div class="pop auctionpop"><h3>Enchères · ${t.n}</h3>
      <div class="felt" style="padding:8px">${auctionTable(t, deal)}</div>
      <p class="muted" style="font-size:13px;margin:4px 0">Donneur : ${NAMES[deal.d]} · ${{ none: 'personne vulnérable', NS: 'vulnérables N/S', EO: 'vulnérables E/O', all: 'tous vulnérables' }[deal.v || 'none']}</p>
      <div id="notebox"></div>${hist.length ? '<button class="btn center" data-act="showscores">📊 Scores de la table et des autres tables</button>' : ''}
      <button class="btn primary center" data-act="hideauction">Fermer</button></div></div>` : '';
    app.innerHTML = topbar(t.n ? t.n : esc(t.nom), 'Salon', head) + body + pop + spop + seatsPop
      + (isMaster(t) && (t.etat === 'jeu' || t.etat === 'encheres') ? '<button class="seatsbtn" data-act="showseats">👥 Places</button>' : '')
      + (!isGuest() ? '<button class="seatsbtn sysfab" data-sys>📖 Système</button>' : '')
      + ((t.etat === 'jeu' || t.etat === 'encheres') ? SEATS.filter(k => !t.sieges[k]).map(k => `<div class="notice">Place ${NAMES[k]} libre. ${!my ? `<button class="btn primary center sm" data-sit="${k}">M’asseoir en ${NAMES[k]}</button>` : ''}${isMaster(t) ? `<button class="btn center sm" data-robot="${k}:${(t.sieges[partner(k)] && t.sieges[partner(k)].sys) || 'sef'}">🤖 Mettre un robot</button>` : ''}</div>`).join('') : '')
      + (isMaster(t) && stuckSeat(t) ? `<div class="notice">${esc(t.sieges[stuckSeat(t)].nom)} (${NAMES[stuckSeat(t)]}) ne répond plus. <button class="btn primary center sm" data-act="replacebot" data-seat="${stuckSeat(t)}">🤖 Le remplacer par un robot</button></div>` : '')
      + undoHtml(t, my)
      + (ui.msg ? `<div class="notice">${ui.msg}</div>` : '') + tabBar();
    ui.msg = '';
    on('back', () => {
      if (t.etat === 'jeu' || t.etat === 'encheres') { stopAll(); curId = null; current = null; open('main'); return; }   // la place reste à toi : « Revenir à la table » depuis le salon
      leaveTable();
    });
    wireTabs();
    on('replay', () => replayView({ ...t.fin, t: now() }, 0, 'main'));
    app.querySelectorAll('[data-sit]').forEach(b => b.addEventListener('click', () => sit(b.dataset.sit)));
    app.querySelectorAll('[data-robot]').forEach(b => b.addEventListener('click', () => { const [seat, sys] = b.dataset.robot.split(':'); setRobot(seat, sys || 'sef'); }));
    app.querySelectorAll('[data-free]').forEach(b => b.addEventListener('click', () => { if (b.dataset.human && !confirm('Sortir ce joueur de la table ?')) return; freeSeat(b.dataset.free); }));
    on('deal', () => { clearTimeout(autoTimer); nextDeal(); });
    app.querySelectorAll('[data-act="replacebot"]').forEach(b => b.addEventListener('click', () => { if (confirm('Remplacer ce joueur par un robot ? Il pourra revenir à une place libre.')) replaceByRobot(b.dataset.seat); }));
    on('autooff', () => { ui.noAuto = true; clearTimeout(autoTimer); renderTable(); });
    on('autoon', () => { ui.noAuto = false; autoKey = null; afterUpdate(); renderTable(); });
    on('fixbot', () => openFix(t.fin));
    app.querySelectorAll('[data-invite]').forEach(x => x.addEventListener('change', () => { if (x.value) invite(x.dataset.invite, x.value); }));
    app.querySelectorAll('[data-move]').forEach(x => x.addEventListener('change', () => { if (x.value) moveSeat(x.dataset.move, x.value); }));
    on('resetscore', () => { if (confirm('Remettre à zéro les scores de cette table ?')) tx(x => (isMaster(x) ? { historique: [], fin: null, etat: x.etat === 'fin' ? 'attente' : x.etat } : null)); });
    wireNotes(t.notes || [], t.bids);
    const announce = v => {
      const txtEl = document.getElementById('alerttxt');
      const note = ui.alert ? { e: ((txtEl && txtEl.value) || ui.alertTxt || '').trim() || 'Enchère alertée (sans explication)', a: true, h: getPlayer() } : null;
      ui.choice = null; ui.alert = false; ui.alertTxt = '';
      move('bid', v, t.moves, note);
    };
    app.querySelectorAll('[data-gb]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.gb;
      if (ui.choice === v) { announce(v); return; }
      ui.choice = v; ui.alert = false; renderTable();
    }));
    on('announce', () => { if (ui.choice) announce(ui.choice); });
    on('unpick', () => { ui.choice = null; ui.alert = false; renderTable(); });
    on('alerton', () => { ui.alert = true; renderTable(); const el = document.getElementById('alerttxt'); if (el) el.focus(); });
    on('alertoff', () => { ui.alert = false; ui.alertTxt = ''; renderTable(); });
    const at = document.getElementById('alerttxt'); if (at) at.addEventListener('input', () => { ui.alertTxt = at.value; });
    on('lasttrick', () => { ui.lastAt = ui.lastAt === t.moves ? null : t.moves; renderTable(); });
    on('cleartrick', () => { ui.clearedAt = t.moves; renderTable(); });
    on('showauction', () => { ui.showAuction = true; renderTable(); });
    on('showseats', () => { ui.showSeats = true; renderTable(); });
    app.querySelectorAll('[data-act="hideseats"]').forEach(x => x.addEventListener('click', e => { if (e.target === x) { ui.showSeats = false; renderTable(); } }));
    on('showscores', () => { ui.showAuction = false; ui.showScores = true; ui.openRow = null; renderTable(); loadSalonResults(t); });
    app.querySelectorAll('[data-act="hidescores"]').forEach(x => x.addEventListener('click', e => { if (e.target === x) { ui.showScores = false; renderTable(); } }));
    app.querySelectorAll('[data-row]').forEach(x => x.addEventListener('click', () => { ui.openRow = ui.openRow === x.dataset.row ? null : x.dataset.row; renderTable(); }));
    app.querySelectorAll('[data-act="hideauction"]').forEach(x => x.addEventListener('click', e => { if (e.target === x) { ui.showAuction = false; renderTable(); } }));
    on('undo', () => requestUndo());
    on('undocancel', () => tx(x => (x.undo && x.undo.by === me() ? { undo: null } : null)));
    on('undoyes', () => answerUndo(true));
    on('undono', () => answerUndo(false));
    on('claimopen', () => openClaim(t));
    on('claimcancel', () => tx(x => (x.claim && x.claim.by === me() ? { claim: null } : null)));
    on('claimyes', () => answerClaim(true));
    on('claimno', () => answerClaim(false));
    app.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => {
      const [s2, r] = b.dataset.play.split(':').map(Number);
      const deal = dealOf(t.n), A = auction(t, deal), ps = playState(t, deal, A.contract);
      const L = legal(ps, ps.turn);
      if (selSuit(L) !== s2) { ui.sel = s2; renderTable(); return; }
      ui.sel = null; move('card', { s: s2, r }, t.moves);
    }));
  }
  function seatsGrid(t, my) {
    const master = isMaster(t);
    return SEATS.map(s => {
      const st = t.sieges[s];
      let act = '';
      const seated = SEATS.map(k => t.sieges[k] && t.sieges[k].uid).filter(Boolean);
      const guests = fresh().filter(p => p.ou === 'salon' && !seated.includes(p.id) && p.id !== me());
      const pend = Object.entries(t.invits || {}).filter(([, v]) => v.seat === s && v.t > now() - 10 * 60000);
      if (!st) {
        act = `${!my || my !== s ? `<button class="btn center sm" data-sit="${s}">M’asseoir</button>` : ''}${master ? `<button class="btn center sm" data-robot="${s}:sef">＋ Robot SEF</button><button class="btn center sm" data-robot="${s}:raimon">＋ Robot Raimon</button>` : ''}`;
        if (master && guests.length) act += `<select class="tsel" data-invite="${s}"><option value="">✉️ Inviter…</option>${guests.map(p => `<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</select>`;
        if (pend.length) act += `<div class="feltnote" style="font-size:12px">Invité : ${pend.map(([, v]) => esc(v.nom)).join(', ')}…</div>`;
      } else {
        if (master && st.robot) act = `<button class="btn center sm" data-free="${s}">Libérer</button>`;
        else if (master && st.uid !== me()) act = `<button class="btn center sm" data-free="${s}" data-human="1">Sortir${isFresh(st.uid) ? '' : ' (absent)'}</button>`;
        if (master) act += `<select class="tsel" data-move="${s}"><option value="">↔ Déplacer…</option>${SEATS.filter(k => k !== s).map(k => `<option value="${k}">vers ${NAMES[k]}${t.sieges[k] ? ' (échange)' : ''}</option>`).join('')}</select>`;
      }
      return `<div class="tseat"><b>${NAMES[s]}</b><div>${seatLabel(st)}${st && st.uid === t.maitre ? ' 👑' : ''}</div>${act}</div>`;
    }).join('');
  }
  function lobbyHtml(t, my) {
    const master = isMaster(t);
    const seatsHtml = seatsGrid(t, my);
    const full = SEATS.every(s => t.sieges[s]);
    const fin = t.etat === 'fin' && t.fin ? resultHtml(t, my) : '';
    const hist = (t.historique || []);
    const avg = hist.filter(h => h.pct !== null);
    const mean = avg.length ? Math.round(avg.reduce((s, h) => s + h.pct, 0) / avg.length * 10) / 10 : null;
    const pts = hist.reduce((s, h) => s + h.ns, 0);
    return `${fin}
      <div class="tseats">${seatsHtml}</div>
      ${master ? (full ? `<button class="btn primary center" data-act="deal">${t.etat === 'fin' ? 'Donne suivante' : 'Distribuer la première donne'}</button>${t.etat === 'fin' ? `<p class="center feltnote" style="font-size:13px">${ui.noAuto ? 'Donne suivante automatique en pause · <button class="link" data-act="autoon">reprendre</button>' : 'Donne suivante automatique dans quelques secondes · <button class="link" data-act="autooff">⏸ pause</button>'}</p>` : ''}` : '<p class="center feltnote">Il faut 4 joueurs (ou robots) pour distribuer.</p>')
        : `<p class="center feltnote">${full ? 'Le maître de table 👑 va distribuer.' : 'En attente de joueurs…'}</p>`}
      ${hist.length ? `<div class="card"><b>Score de la table : ${hist.length} donne(s)</b>
        <div class="tscore"><div><small>NS</small><b>${mean ?? '—'} %</b><small>${pts > 0 ? '+' : ''}${pts} pts</small></div><div><small>EO</small><b>${mean === null ? '—' : Math.round((100 - mean) * 10) / 10} %</b><small>${-pts > 0 ? '+' : ''}${-pts} pts</small></div></div>
        <div class="hist">${hist.map(h => `<div><span>${h.n}</span><span>${fmt(h.contrat)}</span><span>${h.ns > 0 ? '+' : ''}${h.ns}</span><span>${h.pct === null ? '—' : h.pct + ' %'}</span></div>`).join('')}</div>
        ${master && t.etat !== 'encheres' && t.etat !== 'jeu' ? '<button class="link" data-act="resetscore" style="margin-top:8px">Remettre les scores à zéro</button>' : ''}</div>` : ''}`;
  }
  function resultHtml(t, my) {
    const f = t.fin, deal = dealOf(f.n); if (!deal) return '';
    const line = s => DISPLAY.map(x => `<span class="${red(x) ? 'red' : ''}">${SYM[x]}</span>${deal[s].split('.')[x].replace(/T/g, '10').replace(/-/g, '—').replace(/J/g, 'V').replace(/Q/g, 'D').replace(/K/g, 'R') || '—'}`).join(' ');
    const total = deal.freq.reduce((s, x) => s + x[1], 0);
    const near = [...deal.freq].sort((a, b) => b[1] - a[1]).slice(0, 6);
    // Bandeau du résultat : ton % en gros (vert si au-dessus de la moyenne, rouge sinon), puis le contrat et les points
    const side = my ? sideOf(my) : 'NS';
    const mine = f.pct === null || f.pct === undefined ? null : side === 'NS' ? f.pct : Math.round((100 - f.pct) * 10) / 10;
    const pts = side === 'NS' ? f.ns : -f.ns;
    const banner = `<div class="resbanner ${mine === null ? '' : mine >= 50 ? 'good' : 'bad'}">
      <div class="respct">${mine === null ? '—' : mine + ' %'}</div>
      <div class="resline">${my ? 'Ton score' : 'Score ' + side} · ${fmt(f.contrat)}${f.contrat !== 'Passe générale' ? ` · ${f.levees} levées` : ''} · <b>${pts > 0 ? '+' : ''}${pts}</b></div></div>`;
    return `${banner}<div class="card">
      <b>Donne ${f.n}</b> <small class="muted">(${deal.src.simu} du ${deal.src.date.split('-').reverse().join('/')}, donne ${deal.src.num})</small>
      <p style="margin:6px 0">${fmt(f.contrat)}${f.contrat !== 'Passe générale' ? ` · ${f.levees} levées` : ''} · <b>NS ${f.ns > 0 ? '+' : ''}${f.ns}</b></p>
      <p style="margin:6px 0;font-size:18px"><b>NS ${f.pct ?? '—'} %</b> · EO ${f.pct === null ? '—' : Math.round((100 - f.pct) * 10) / 10} % <small class="muted">face à ${total} tables</small></p>
      ${f.robots ? '<p class="muted" style="font-size:13px;margin:0 0 6px">Avec des robots à la table, ce pourcentage est indicatif.</p>' : ''}
      <div class="fhands">${SEATS.map(s => `<div><b>${NAMES[s]}</b> <small class="muted">${esc(f.joueurs[s])} · ${hcpOf(deal[s])}H</small><br>${line(s)}</div>`).join('')}</div>
      ${f.plays ? '<button class="btn center" data-act="replay" style="margin-top:8px">▶ Revoir la donne carte par carte</button>' : ''}
      ${f.robots ? '<button class="btn center" data-act="fixbot">🛠️ Corriger le bot</button>' : ''}
      <details style="margin-top:8px"><summary class="muted">Résultats de la salle</summary><div class="hist">${near.map(([sc, k]) => `<div><span>NS ${sc > 0 ? '+' : ''}${sc}</span><span>${k} table(s)</span></div>`).join('')}</div></details></div>`;
  }
  const hcpOf = h => h.replace(/[^AKQJ]/g, '').split('').reduce((n, c) => n + { A: 4, K: 3, Q: 2, J: 1 }[c], 0);
  function plate(t, deal, s, pos, extra, turn) {
    const st = t.sieges[s], vul = isVul(deal, sideOf(s));
    if (st && st.uid === me()) extra = ` <span class="hcp">${hcpOf(deal[s])}H</span>` + (extra || '');
    return `<div class="plate ${pos} ${turn === s ? 'turn' : ''}"><span class="seat ${vul ? '' : 'nv'}">${s}</span>${st ? (st.robot ? '🤖' : esc(st.nom)) : '—'}${deal.d === s ? '<span class="dealer">D</span>' : ''}${extra || ''}</div>`;
  }
  function auctionTable(t, deal) {
    const order = ['O', 'N', 'E', 'S'], start = order.indexOf(deal.d), cells = [];
    for (let i = 0; i < start; i++) cells.push('<span></span>');
    const notes = t.notes || [];
    t.bids.forEach((b, i) => { const n = notes[i]; cells.push(n ? `<span class="bwrap" data-note="${i}">${bidCard(b, (i === t.bids.length - 1 ? 'last ' : '') + (n.a ? 'alerted' : ''))}${n.a ? '<sup class="alertmark">!</sup>' : ''}</span>` : bidCard(b, i === t.bids.length - 1 ? 'last' : '')); });
    return `<div class="atab">${order.map(s => `<b>${NAMES[s]}</b>`).join('')}${cells.join('')}</div>`;
  }
  // ═════ Affichage de la table, repris du mode solo : boîte d'enchères dans le cadre, cartons des enchères près
  // de chaque joueur (STOP devant un saut), grande carte au centre pour confirmer ; au jeu, le mort en colonnes,
  // la couleur choisie qui sort de la main, les mains cachées en dos de cartes.
  const GCOLS = ['SA', '♠', '♥', '♦', '♣'];
  const bidTxt = b => (b === 'P' ? 'PASSE' : b === 'X' || b === 'XX' ? b : b[0] + `<span>${b.slice(1) === 'SA' ? 'SA' : fmt(b.slice(1))}</span>`);
  const bidKind = b => (b === 'P' ? 'gpass' : b === 'X' ? 'gx' : b === 'XX' ? 'gxx' : 'g' + GCOLS.indexOf(b.slice(1)));
  function stacksHtml(t, deal, P) {
    const stacks = { N: [], E: [], S: [], O: [] }, notes = t.notes || [];
    let lastRank = -1;
    t.bids.forEach((b, k) => {
      const seat = SEATS[(SEATS.indexOf(deal.d) + k) % 4], rk = bidRank(b);
      if (rk >= 0) {
        let minLevel = 1; while (bidRank(minLevel + b.slice(1)) <= lastRank) minLevel++;
        if (+b[0] > minLevel) stacks[seat].push('<div class="gb stack stop">STOP</div>');
        lastRank = rk;
      }
      const n = notes[k];
      stacks[seat].push(`<div class="gb stack ${bidKind(b)} ${k === t.bids.length - 1 ? 'last' : ''} ${n ? 'bwrap' : ''}" ${n ? `data-note="${k}"` : ''}>${bidTxt(b)}${n && n.a ? '<sup class="alertmark">!</sup>' : ''}</div>`);
    });
    // position à l'écran : ma place en bas
    const cls = { [P.top]: 'N', [P.bottom]: 'S', [P.left]: 'O', [P.right]: 'E' };
    return SEATS.map(s => (stacks[s].length ? `<div class="bidstack ${cls[s]}">${stacks[s].join('')}</div>` : '')).join('');
  }
  // Pas mon tour : la boîte d'enchères reste au centre (grisée), pour que le tapis ne bouge pas
  function waitGrid(A, t) {
    let rows = '';
    for (let l = 1; l <= 7; l++) if (bidRank(l + 'SA') > A.last) rows += GCOLS.map((c, k) => { const b = l + c; return `<button class="gb g${k}" ${bidRank(b) > A.last ? '' : 'disabled'} tabindex="-1">${l}<span>${c === 'SA' ? 'SA' : fmt(c)}</span></button>`; }).join('');
    const who = A.turn ? `Au tour de ${NAMES[A.turn]}${t.sieges[A.turn] && t.sieges[A.turn].robot ? ' (robot)' : ''}…` : '';
    return `<div class="gridwrap gridwait"><div class="gridbox">${rows}</div>
      <div class="gspecial"><button class="gb gpass" tabindex="-1">PASSE</button><button class="gb gx" disabled>X</button><button class="gb gxx" disabled>XX</button></div></div>
      <p class="gridhint">${who}</p>`;
  }
  function gridHtml(A) {
    let rows = '';
    for (let l = 1; l <= 7; l++) if (bidRank(l + 'SA') > A.last) rows += GCOLS.map((c, k) => { const b = l + c; const ok = bidRank(b) > A.last; return `<button class="gb g${k} ${ui.choice === b ? 'sel' : ''}" ${ok ? `data-gb="${b}"` : 'disabled'}>${l}<span>${c === 'SA' ? 'SA' : fmt(c)}</span></button>`; }).join('');
    const big = ui.choice ? `<div class="pickveil" data-act="unpick"></div><div class="bigbid-veil" data-act="unpick"></div>${ui.alert ? '<div class="gb galert bigalert">ALERTE</div>' : ''}<button class="gb bigbid ${bidKind(ui.choice)} ${ui.alert ? 'withalert' : ''}" data-act="announce">${bidTxt(ui.choice)}<small>Touche pour annoncer</small></button>
      <div class="alertbar">${ui.alert
        ? `<input id="alerttxt" maxlength="80" placeholder="Que montre ton enchère ? (ex. Texas ♥)" value="${esc(ui.alertTxt || '')}"><button class="link" data-act="alertoff">sans alerte</button>`
        : '<button class="gb galert" data-act="alerton">ALERTE</button><small>Enchère conventionnelle ? Pose le carton bleu.</small>'}</div>` : '';
    return `<div class="gridwrap"><div class="gridbox">${rows}</div>
      <div class="gspecial"><button class="gb gpass ${ui.choice === 'P' ? 'sel' : ''}" data-gb="P">PASSE</button><button class="gb gx ${ui.choice === 'X' ? 'sel' : ''}" ${A.canX ? 'data-gb="X"' : 'disabled'}>X</button><button class="gb gxx ${ui.choice === 'XX' ? 'sel' : ''}" ${A.canXX ? 'data-gb="XX"' : 'disabled'}>XX</button></div>
      ${big}</div>
      <p class="gridhint">${ui.choice ? 'Touche l’enchère au centre pour l’annoncer' : 'À toi : touche ton enchère'}</p>`;
  }
  const nameOf = (t, s) => { const st = t.sieges[s]; return st ? (st.robot ? '🤖 ' + (st.sys === 'raimon' ? 'Raimon' : 'SEF') : esc(st.nom)) : '—'; };
  function plateB(t, deal, s, pos, turn, extra) {
    const st = t.sieges[s];
    const mine = st && st.uid === me();
    return `<div class="plate ${pos} ${turn === s ? 'turn' : ''}"><span class="seat ${isVul(deal, sideOf(s)) ? '' : 'nv'}">${s}</span>${nameOf(t, s)}${mine ? ` · <span class="hcp">${hcpOf(deal[s])}H</span>` : ''}${deal.d === s ? '<span class="dealer" title="Donneur">D</span>' : ''}${extra || ''}</div>`;
  }
  function biddingHtml(t, deal, A, my, P) {
    const myTurn = my && A.turn === my;
    const vul = 'Donneur : ' + NAMES[deal.d] + ' · ' + { none: 'personne vulnérable', NS: 'vulnérables N/S', EO: 'vulnérables E/O', all: 'tous vulnérables' }[deal.v || 'none'];
    const waitTxt = !myTurn && A.turn ? `<p class="gridhint" style="margin:30px 0">Au tour de ${NAMES[A.turn]}${t.sieges[A.turn] && t.sieges[A.turn].robot ? ' (robot)' : ''}…</p>` : '';
    const hand = my ? parseHand(deal[my]) : null;
    return `<div class="frame bidframe sframe">
        ${plateB(t, deal, P.top, 'top', A.turn)}${plateB(t, deal, P.left, 'left', A.turn)}${plateB(t, deal, P.right, 'right', A.turn)}${plateB(t, deal, P.bottom, 'bottom', A.turn)}
        ${stacksHtml(t, deal, P)}
        <div class="bidcenter" id="fb">${myTurn ? gridHtml(A) : waitGrid(A, t)}</div>
        <div class="vulnote">${vul}</div>
      </div>
      ${undoBtn(t, my) ? `<p class="center" style="margin:4px 0">${undoBtn(t, my)}</p>` : ''}
      <div id="notebox"></div>
      ${hand ? arcHtml(window.suitOrder([0, 1, 2, 3].map(s => hand[s].length), null).flatMap(s => [...hand[s]].sort((a, b) => b - a).map(r => ({ s, label: RLAB[r] })))) : ''}`;
  }
  // ── Jeu de la carte
  function selSuit(L) { const ss = [...new Set(L.map(c => c.s))]; return ss.length === 1 ? ss[0] : (ss.includes(ui.sel) ? ui.sel : null); }
  function fanHtml(hand, clickable, L) {
    const open = clickable ? selSuit(L) : null;
    const hasOpen = open !== null && hand[open].length;
    const attrs = (s, r) => (clickable && L.some(x => x.s === s && x.r === r) ? `data-play="${s}:${r}"` : '');
    const cls = (s, r) => { const ok = clickable && L.some(x => x.s === s && x.r === r); return !clickable ? '' : !ok ? 'dim' : open === s ? 'can sel' : open === null ? 'can' : 'can off'; };
    const cards = ord(hand).flatMap(s => [...hand[s]].sort((a, b) => b - a).map(r => ({ s, r })));
    const arc = arcHtml(cards.map(c => (hasOpen && c.s === open ? { s: c.s, label: RLAB[c.r], cls: 'ghost' } : { s: c.s, label: RLAB[c.r], cls: cls(c.s, c.r), attrs: attrs(c.s, c.r) })));
    const row = hasOpen ? `<div class="hpick ${hand[open].length > 5 ? 'tight' : ''}">${[...hand[open]].sort((a, b) => b - a).map(r => cardHtml(open, RLAB[r], 'md can sel', attrs(open, r))).join('')}</div>` : '';
    return `<div class="handwrap">${row}${arc}</div>`;
  }
  function columnsHtml(hand, clickable, L, label) {
    const open = clickable ? selSuit(L) : null;
    const attrs = (s, r) => (clickable && L.some(x => x.s === s && x.r === r) ? `data-play="${s}:${r}"` : '');
    const cols = ord(hand).filter(s => hand[s].length).map(s => `<div class="dcol ${open === s ? 'ghost' : ''}">${[...hand[s]].sort((a, b) => b - a).map(r => {
      const ok = clickable && L.some(x => x.s === s && x.r === r);
      return cardHtml(s, RLAB[r], 'md ' + (clickable ? (ok ? (open === null ? 'can' : open === s ? '' : 'can off') : 'dim') : ''), open === s ? '' : attrs(s, r));
    }).join('')}</div>`).join('');
    const row = open !== null && hand[open].length ? `<div class="dpick ${hand[open].length > 5 ? 'tight' : ''}">${[...hand[open]].sort((a, b) => b - a).map(r => cardHtml(open, RLAB[r], 'md can sel', attrs(open, r))).join('')}</div>` : '';
    return `<p class="feltnote center" style="margin:2px 0">${label}</p><div class="dummywrap"><div class="dummy">${cols}</div>${row}</div>`;
  }
  // Le mort sur le côté : une ligne par couleur, petites cartes (lecture seule : en défense, on ne le joue pas)
  function sideDummy(hand, side) {
    // comme sur une vraie table : l'atout du côté du déclarant → en haut si le mort est à ta droite, en bas s'il est à ta gauche
    const o = ord(hand); if (side === 'left') o.reverse();
    const rows = o.map(k => `<div class="sdrow">${[...hand[k]].sort((a, b) => b - a).map(r => cardHtml(k, RLAB[r], 'xs')).join('') || '<span class="sdvoid">—</span>'}</div>`).join('');
    return `<div class="sdummy ${side}">${rows}</div>`;
  }
  const backsHtml = n => (n ? `<span class="mbacks">${'<i></i>'.repeat(n)}</span>` : '');
  function playHtml(t, deal, A, my, P) {
    const c = A.contract, ps = playState(t, deal, c);
    TRUMP = ps.trump;
    const sw = swapOf(t, c), swapped = sw && sw.human === my;
    const ctrlOf = s => (sw && (s === c.decl || s === ps.dummy) ? sw.human : s === ps.dummy ? c.decl : s);
    const iControl = my && !ps.done && ctrlOf(ps.turn) === my;
    const handSeat = swapped ? c.decl : my;                              // la main en bas (éventail)
    const L = iControl ? legal(ps, ps.turn) : [];
    const pos = { [P.top]: 'top', [P.left]: 'left', [P.right]: 'right', [P.bottom]: 'bottom' };
    const count = s => ps.hands[s].reduce((n, x) => n + x.length, 0);
    // le pli au centre ; le pli précédent se revoit en touchant le bouton, jusqu'à la carte suivante
    // pli terminé : il reste au centre tant qu'on n'a pas touché le tapis et que la carte suivante n'est pas jouée
    const doneTrick = !ps.trick.length && ps.last && ui.clearedAt !== t.moves;
    const showLast = (ui.lastAt === t.moves && ps.last) || doneTrick;
    const shown = showLast ? ps.last : ps.trick;
    const w = shown.length === 4 ? winnerOf(shown, ps.trump) : null;
    const slots = SEATS.map(s => { const x = shown.find(k => k.seat === s); return `<div class="slot ${pos[s]}">${x ? cardHtml(x.s, RLAB[x.r], 'md ' + (w && w.seat === s ? 'win' : '')) : ''}</div>`; }).join('');
    // en haut : le mort (ou, si je suis le mort, le jeu de mon partenaire déclarant)
    let topBlock = '';
    if (swapped) topBlock = ps.shown ? columnsHtml(ps.hands[ps.dummy], iControl && ps.turn === ps.dummy, L, `Ton jeu, le mort (${NAMES[ps.dummy]}) · ${hcpOf(deal[ps.dummy])}H${iControl && ps.turn === ps.dummy ? ' — à toi' : ''}`) : '<p class="feltnote">Ton partenaire robot a gagné le contrat : c’est toi qui le joues. Ton jeu sera le mort.</p>';
    else if (my === ps.dummy) topBlock = columnsHtml(ps.hands[c.decl], false, [], `Jeu de ton partenaire (${NAMES[c.decl]}, déclarant) · ${hcpOf(deal[c.decl])}H`);
    else if (ps.shown && (pos[ps.dummy] === 'left' || pos[ps.dummy] === 'right')) topBlock = `<p class="feltnote center" style="margin:2px 0">Mort : ${NAMES[ps.dummy]} · ${hcpOf(deal[ps.dummy])}H (à ${pos[ps.dummy] === 'left' ? 'gauche' : 'droite'})</p>`;
    else if (ps.shown) topBlock = columnsHtml(ps.hands[ps.dummy], iControl && ps.turn === ps.dummy, L, `Mort : ${NAMES[ps.dummy]} · ${hcpOf(deal[ps.dummy])}H${iControl && ps.turn === ps.dummy ? ' — à toi de jouer pour lui' : ''}`);
    else topBlock = '<p class="feltnote">Le mort sera étalé après l’entame</p>';
    const visible = s => s === my || (ps.shown && s === ps.dummy) || (my === ps.dummy && s === c.decl) || (swapped && s === c.decl);
    const declSide = sideOf(c.decl), need = 6 + c.l;
    const ctr = side => `${ps.tricks[side]}${side === declSide ? '/' + need : ''}`;
    const turnTxt = ps.done ? '' : iControl ? (ps.turn === handSeat ? (swapped ? 'À toi de jouer (déclarant)' : 'À toi de jouer') : 'À toi de jouer le mort') : 'Au tour de ' + NAMES[ps.turn] + (t.sieges[ctrlOf(ps.turn)] && t.sieges[ctrlOf(ps.turn)].robot ? ' (robot)' : '');
    return `${topBlock}
      <div class="frame sframe">${[P.top, P.left, P.right, P.bottom].map(s => plateB(t, deal, s, pos[s], ps.turn, (ps.shown && s === ps.dummy && t.sieges[s] && t.sieges[s].uid !== me() ? ' <span class="hcp">' + hcpOf(deal[s]) + 'H</span>' : '') + (visible(s) ? '' : backsHtml(count(s))))).join('')}
        ${ps.shown && ps.dummy !== my && (pos[ps.dummy] === 'left' || pos[ps.dummy] === 'right') ? sideDummy(ps.hands[ps.dummy], pos[ps.dummy]) : ''}
        <div class="corner cl">NS<br><b>${ctr('NS')}</b></div><div class="corner cr">EO<br><b>${ctr('EO')}</b></div>
        <div class="trick ${ps.shown && ps.dummy !== my && pos[ps.dummy] === 'left' ? 'sdl' : ps.shown && ps.dummy !== my && pos[ps.dummy] === 'right' ? 'sdr' : ''}" ${doneTrick ? 'data-act="cleartrick"' : ps.last ? 'data-act="lasttrick"' : ''}>${slots}</div>
        ${showLast && !doneTrick ? '<div class="lastlabel">Pli précédent</div>' : ''}</div>
      <p class="center feltnote" style="margin:4px 0">${turnTxt}${ps.last && !showLast ? ' · <button class="link lastbtn" data-act="lasttrick">👁 Pli précédent</button>' : ''}${doneTrick ? ' · <small>touche le tapis pour le ranger</small>' : ''}</p>
      ${claimRow(claimBar(t, deal, c, ps, my), undoBtn(t, my))}
      ${my ? fanHtml(ps.hands[handSeat], iControl && ps.turn === handSeat, iControl && ps.turn === handSeat ? L : []) : ''}`;
  }

  // ═════ Revendiquer (camp du déclarant) / Céder (défense) — comme sur BBO
  // Les adversaires humains acceptent ou refusent ; s'il y a un robot en face, il vérifie en double mort.
  function controllers(t, c, side) {
    const sw = swapOf(t, c), out = [];
    SEATS.filter(x => sideOf(x) === side).forEach(x => {
      const ctl = sw && (x === c.decl || x === partner(c.decl)) ? sw.human : x === partner(c.decl) ? c.decl : x;
      const st = t.sieges[ctl]; if (st) out.push(st);
    });
    return out;
  }
  const otherSide = sd => (sd === 'NS' ? 'EO' : 'NS');
  // ═════ Annuler (undo) : sa dernière enchère ou sa dernière carte (et ce qui a suivi).
  // Adversaires robots : immédiat. Un adversaire humain à la table : il doit accepter.
  function ctrlSeat(t, c, s) { const sw = swapOf(t, c), dummy = partner(c.decl); return sw && (s === c.decl || s === dummy) ? sw.human : s === dummy ? c.decl : s; }
  function lastMine(t, my) {
    const deal = t.n && dealOf(t.n); if (!deal || !my) return null;
    const lastBid = () => {
      let idx = -1; t.bids.forEach((b, i) => { if (SEATS[(SEATS.indexOf(deal.d) + i) % 4] === my) idx = i; });
      return idx < 0 ? null : { kind: 'b', idx, what: t.bids[idx] };
    };
    if (t.etat === 'encheres') return lastBid();
    if (t.etat === 'jeu' && t.plays.length < 52) {
      const c = auction(t, deal).contract; let idx = -1;
      for (let i = 0; i < t.plays.length; i++) { const seat = playState({ ...t, plays: t.plays.slice(0, i) }, deal, c).turn; if (ctrlSeat(t, c, seat) === my) idx = i; }
      if (idx < 0) return lastBid();                                  // enchères tout juste finies (pas encore joué de carte) : on revient aux enchères
      return { kind: 'c', idx, what: t.plays[idx] };
    }
    return null;
  }
  const humanOpps = (t, my) => SEATS.filter(s => sideOf(s) !== sideOf(my) && t.sieges[s] && !t.sieges[s].robot);
  function applyUndo(x, u) {
    if (u.kind === 'b') return { bids: x.bids.slice(0, u.idx), notes: (x.notes || []).slice(0, u.idx), moves: x.moves + 1, undo: null, ...(x.etat === 'jeu' ? { etat: 'encheres', plays: [], claim: null } : {}) };
    return { plays: x.plays.slice(0, u.idx), moves: x.moves + 1, undo: null };
  }
  function requestUndo() {
    tx(x => {
      if (x.undo || x.claim) return null;
      const my = mySeat(x), u = lastMine(x, my); if (!u) return null;
      if (!humanOpps(x, my).length) return applyUndo(x, u);
      return { undo: { kind: u.kind, idx: u.idx, what: u.what, by: me(), nom: getPlayer(), seat: my, moves: x.moves } };
    });
  }
  function answerUndo(yes) {
    tx(x => {
      const u = x.undo; if (!u) return null;
      const my = mySeat(x); if (!my || sideOf(my) === sideOf(u.seat)) return null;     // seul un adversaire répond
      if (!yes || x.moves !== u.moves) return { undo: null };
      return applyUndo(x, u);
    });
  }
  // ce qu'on annule, affiché sans jamais injecter le texte stocké (enchère ou carte brute, vérifiée)
  function undoWhat(u) {
    const w = String(u.what || '');
    if (u.kind === 'b') return /^(P|XX?|[1-7](SA|♠|♥|♦|♣))$/.test(w) ? bidTxt(w) : '';
    return /^[0-3][AKQJT2-9]$/.test(w) ? RLAB[12 - RCH.indexOf(w[1])] + SYM[+w[0]] : '';
  }
  function undoHtml(t, my) {
    if (t.etat !== 'encheres' && t.etat !== 'jeu') return '';
    const u = t.undo;
    if (u) {
      const toAnswer = my && sideOf(my) !== sideOf(u.seat) && !(t.sieges[my] || {}).robot;
      return `<div class="undobox"><b>${esc(u.nom)}</b> demande d’annuler ${u.kind === 'b' ? 'son enchère' : 'sa carte'} <b>${undoWhat(u)}</b>.
        ${u.by === me() ? '<p>En attente de la réponse des adversaires… <button class="link" data-act="undocancel">retirer la demande</button></p>' : toAnswer ? '<div class="row2"><button class="btn center sm" data-act="undono">✗ Refuser</button><button class="btn primary center sm" data-act="undoyes">✓ Accepter</button></div>' : '<p class="muted">En attente des adversaires…</p>'}</div>`;
    }
    return '';
  }
  const undoBtn = (t, my) => (t.undo || t.claim || !lastMine(t, my) ? '' : '<button class="btn sm undoinline" data-act="undo">↩️ Annuler</button>');
  function claimRow(cb, ub) {
    if (!ub) return cb;
    if (cb.startsWith('<p class="center">') && cb.endsWith('</p>')) return cb.slice(0, -4) + ' ' + ub + '</p>';
    return cb + `<p class="center" style="margin:4px 0">${ub}</p>`;
  }
  function claimBar(t, deal, c, ps, my) {
    if (ps.done || !my) return '';
    const mySide = sideOf(my), cl = t.claim;
    if (!cl) {
      const r = 13 - (ps.tricks.NS + ps.tricks.EO);
      if (r < 1) return '';
      const declSide = sideOf(c.decl) === mySide;
      return `<p class="center"><button class="btn center sm claimbtn" data-act="claimopen">${declSide ? '🏳️ Revendiquer' : '🤝 Céder'}</button></p>`;
    }
    const verb = cl.side === sideOf(c.decl) ? 'revendique' : 'cède';
    const what = cl.side === sideOf(c.decl) ? `${cl.k} levée(s) sur les ${cl.r} restantes` : `et ne demande que ${cl.k} levée(s) sur les ${cl.r} restantes`;
    // les cartes du camp qui revendique, visibles pour vérifier
    const cards = SEATS.filter(x => sideOf(x) === cl.side).map(x => `<div><b>${NAMES[x]}</b> ${DISPLAY.map(k => `<span class="${red(k) ? 'red' : ''}">${SYM[k]}</span>${[...ps.hands[x][k]].sort((a, b) => b - a).map(q => RLAB[q]).join('') || '—'}`).join(' ')}</div>`).join('');
    const mineToAnswer = mySide !== cl.side && controllers(t, c, otherSide(cl.side)).some(st => st.uid === me()) && !(cl.ok || {})[me()];
    return `<div class="notice claimbox"><b>${esc(cl.nom)} ${verb}</b> ${what}.<div class="claimcards">${cards}</div>
      ${cl.by === me() ? '<p>En attente de la réponse des adversaires… <button class="link" data-act="claimcancel">annuler</button></p>' : ''}
      ${mineToAnswer ? '<div class="row2"><button class="btn center" data-act="claimno">✗ Refuser</button><button class="btn primary center" data-act="claimyes">✓ Accepter</button></div>' : (cl.by !== me() ? '<p class="muted">En attente…</p>' : '')}</div>`;
  }
  function openClaim(t) {
    const deal = dealOf(t.n), A = auction(t, deal), c = A.contract, ps = playState(t, deal, c), my = mySeat(t);
    const r = 13 - (ps.tricks.NS + ps.tricks.EO), mySide = sideOf(my), declSide = sideOf(c.decl) === mySide;
    const veil = document.createElement('div'); veil.className = 'popveil';
    veil.innerHTML = `<div class="pop"><h3>${declSide ? '🏳️ Revendiquer' : '🤝 Céder'}</h3>
      <p>Combien de levées pour ton camp, sur les <b>${r}</b> restantes ?</p>
      <div class="claimgrid">${Array.from({ length: r + 1 }, (_, k) => r - k).map(k => `<button class="dcell" data-k="${k}">${k}</button>`).join('')}</div>
      <p class="muted" style="font-size:13px">Les adversaires voient tes cartes et acceptent ou refusent. Un robot accepte si tu ne peux pas faire moins, même contre la meilleure défense.</p>
      <button class="link" data-x="1">Annuler</button></div>`;
    document.body.appendChild(veil);
    veil.querySelector('[data-x]').addEventListener('click', () => veil.remove());
    veil.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
      veil.remove();
      tx(x => (x.etat !== 'jeu' || x.claim ? null : { claim: { side: mySide, k: +b.dataset.k, r, by: me(), nom: getPlayer(), moves: x.moves, ok: {} } }));
    }));
  }
  // Une réponse humaine ; si tout le monde a accepté (et le robot aussi), la donne se termine
  function answerClaim(yes) {
    tx(x => {
      const cl = x.claim; if (!cl) return null;
      if (!yes) return { claim: null };
      const ok = { ...(cl.ok || {}), [me()]: true };
      return settleClaim(x, { ...cl, ok });
    });
  }
  function settleClaim(x, cl) {
    const deal = dealOf(x.n), c = auction(x, deal).contract;
    const opp = controllers(x, c, otherSide(cl.side));
    const humansOk = opp.filter(st => st.uid).every(st => cl.ok[st.uid]);
    const robotsOk = !opp.some(st => st.robot) || cl.robotOk;
    if (!humansOk || !robotsOk) return { claim: cl };
    const done = { ...x, claim: { ...cl, accepted: true } };
    return { claim: done.claim, ...endDeal(done, deal) };
  }
  // Robot en face : le téléphone du maître vérifie en double mort (cartes réelles), comme la réclamation du mode solo
  // Levées maîtresses sûres d'un camp (cartes maîtresses de tête, sans atout adverse qui traîne)
  function sureTricks(ps, side) {
    const mine = SEATS.filter(x => sideOf(x) === side), theirs = SEATS.filter(x => sideOf(x) !== side);
    if (ps.trick.length) return 0;                                       // seulement en début de pli
    if (ps.trump !== null && theirs.some(x => ps.hands[x][ps.trump].length)) return 0;
    let n = 0;
    for (let su = 0; su < 4; su++) {
      const all = SEATS.flatMap(x => ps.hands[x][su].map(r => ({ r, mine: mine.includes(x) }))).sort((a, b) => b.r - a.r);
      let top = 0; for (const c of all) { if (!c.mine) break; top++; }
      n += Math.min(top, Math.max(...mine.map(x => ps.hands[x][su].length)));
    }
    return n;
  }
  const claimChecks = new Set();
  function robotCheckClaim(t) {
    const cl = t.claim; if (!cl || cl.robotOk) return;
    const key = curId + cl.by + cl.moves + cl.k; if (claimChecks.has(key)) return;
    const deal = dealOf(t.n), c = auction(t, deal).contract;
    if (!controllers(t, c, otherSide(cl.side)).some(st => st.robot)) return;
    claimChecks.add(key);
    setTimeout(() => {
      const ps = playState(t, deal, c);
      const masks = SEATS.map(x => ps.hands[x].map(rs => rs.reduce((m, r) => m | (1 << r), 0)));
      const leader = ps.trick.length ? ps.trick[0].seat : ps.turn;
      const cur = ps.trick.map(k => ({ p: SEATS.indexOf(k.seat), s: k.s, r: k.r }));
      let dd = null;
      if (cl.k > 0 && cl.k > sureTricks(ps, cl.side)) { try { dd = RaimonDDS.solve(masks, ps.trump === null ? -1 : ps.trump, SEATS.indexOf(leader), undefined, 3e6, cur); } catch (e) { dd = null; } }
      // céder tout, ou ne demander que des levées maîtresses : accepté sans calcul
      const can = cl.k === 0 || cl.k <= sureTricks(ps, cl.side) ? cl.k : dd === null ? null : (cl.side === 'NS' ? dd : cl.r - dd);
      if (can === null || can < cl.k) {
        tx(x => (x.claim && x.claim.by === cl.by ? { claim: null } : null));
        ui.msg = can === null ? 'Revendication refusée : trop tôt pour vérifier, jouez encore quelques cartes.' : `Revendication refusée par le robot : au mieux ${can} levée(s) contre une défense parfaite.`;
        return;
      }
      tx(x => (x.claim && x.claim.by === cl.by ? settleClaim(x, { ...x.claim, robotOk: true }) : null));
    }, 300);
  }

  // ═════ Scores de la table : une ligne par donne ; détail = toutes les autres tables (salle FFB + joueurs du salon)
  let salonRes = {};
  async function loadSalonResults(t) {
    const ns = [...new Set((t.historique || []).map(h => h.n))];
    for (const n of ns) {
      if (salonRes[n]) continue;
      try { const q = await db.collection('resultats').where('n', '==', n).get(); salonRes[n] = q.docs.map(d => d.data()); } catch (e) { salonRes[n] = []; }
    }
    if (ui.showScores) renderTable();
  }
  function scoresPop(t, my) {
    const mySd = my ? sideOf(my) : 'NS';
    const pctFor = (deal, ns) => pctNS(deal, ns);
    const rows = (t.historique || []).map((h, i) => {
      const deal = dealOf(h.n); const open = ui.openRow === String(i);
      const me = mySd === 'NS' ? h.pct : (h.pct === null ? null : Math.round((100 - h.pct) * 10) / 10);
      let detail = '';
      if (open && deal) {
        const tot = deal.freq.reduce((a, x) => a + x[1], 0);
        const lines = [...deal.freq].sort((a, b) => b[0] - a[0]).map(([sc, k]) => `<div class="trow ${sc === h.ns ? 'mine' : ''}"><span>NS ${sc > 0 ? '+' : ''}${sc}</span><span>${k} table${k > 1 ? 's' : ''}</span><span>${pctFor(deal, sc)} %</span></div>`).join('');
        const ours = (salonRes[h.n] || []).filter(r => r.table !== curId || r.t === undefined).map(r => `<div class="trow"><span>${fmt(r.contrat)}</span><span>NS ${r.ns > 0 ? '+' : ''}${r.ns}</span><span>${esc(Object.values(r.joueurs || {}).filter(x => x && x !== 'Robot' && x !== '—').join(', ') || 'robots')}</span></div>`).join('');
        detail = `<div class="tdetail"><b>Salle FFB (${tot} tables)</b> <small class="muted">${deal.src.simu} du ${deal.src.date.split('-').reverse().join('/')}</small><div class="travel">${lines}</div>
          ${ours ? `<b>Au salon</b><div class="travel">${ours}</div>` : ''}</div>`;
      }
      return `<div class="srow ${open ? 'open' : ''}" data-row="${i}"><span>${i + 1}</span><span>${h.n}</span><span>${fmt(h.contrat)}</span><span>${h.ns > 0 ? '+' : ''}${h.ns}</span><span class="${me === null ? '' : me >= 50 ? 'good' : 'bad'}">${me === null ? '—' : me + ' %'}</span></div>${detail}`;
    }).join('');
    return `<div class="popveil" data-act="hidescores"><div class="pop scorespop"><h3>📊 Scores de la table</h3>
      <div class="srow head"><span>#</span><span>Donne</span><span>Contrat</span><span>NS</span><span>Ton %</span></div>${rows}
      <p class="muted" style="font-size:12px;margin:6px 0">Touche une donne pour voir les résultats des autres tables (salle FFB et joueurs du salon).</p>
      <button class="btn primary center" data-act="hidescores">Fermer</button></div></div>`;
  }

  // Toucher une enchère de robot : son explication (et l'alerte si elle est conventionnelle)
  function wireNotes(notes, bids) {
    app.querySelectorAll('[data-note]').forEach(x => x.addEventListener('click', () => {
      const i = +x.dataset.note, n = notes[i]; if (!n) return;
      let box = document.getElementById('notebox');
      if (!box) { box = document.createElement('div'); box.id = 'notebox'; const fr = app.querySelector('.frame') || app.querySelector('.felt'); (fr || app).after(box); }
      box.innerHTML = `<div class="notice notebubble">${n.a ? '<b class="alerttag">ALERTE</b> ' : ''}<b>${bids[i] === 'P' ? 'Passe' : fmt(bids[i])}</b> : ${esc(n.e || '')}${n.h ? ` <small class="muted">(explication de ${esc(n.h)})</small>` : ''}</div>`;
    }));
  }
  // ═════ « Corriger le bot » : Damien écrit directement dans les corrections ; les autres proposent, Damien valide
  const isBoss = () => getPlayer() === 'Damien' && !isGuest();
  let pendingN = 0;
  function bidsTxt(r, deal) {
    return (r.bids || []).map((b, i) => {
      const seat = SEATS[(SEATS.indexOf(deal.d) + i) % 4], n = (r.notes || [])[i];
      const who = r.systemes && r.systemes[seat] ? `robot ${r.systemes[seat] === 'raimon' ? 'Raimon' : 'SEF'}` : (r.joueurs || {})[seat] || '';
      return `${i + 1}. ${seat} (${who}) ${b === 'P' ? 'Passe' : b}${n && n.e ? ' — ' + n.e : ''}`;
    }).join('\n');
  }
  function playsTxt(r, deal) {
    const A = auction({ bids: r.bids || [] }, deal); if (!A.contract || !(r.plays || []).length) return '';
    const out = []; let leader = next(A.contract.decl), trick = [];
    const trump = A.contract.s === 'SA' ? null : SUIT_OF[A.contract.s];
    r.plays.forEach(p => {
      const s = +p[0], rk = 12 - RCH.indexOf(p[1]);
      const seat = trick.length ? SEATS[(SEATS.indexOf(leader) + trick.length) % 4] : leader;
      trick.push({ seat, s, r: rk });
      if (trick.length === 4) { const w = winnerOf(trick, trump); out.push(`Pli ${out.length + 1} : ` + trick.map(x => `${x.seat} ${SYM[x.s]}${RLAB[x.r]}`).join(' ') + ` → ${w.seat}`); leader = w.seat; trick = []; }
    });
    return out.join('\n');
  }
  function openFix(r) {
    const deal = dealOf(r.n); if (!deal) return;
    const robotBids = (r.bids || []).map((b, i) => ({ b, i, seat: SEATS[(SEATS.indexOf(deal.d) + i) % 4] })).filter(x => r.systemes ? r.systemes[x.seat] : (r.joueurs || {})[x.seat] === 'Robot');
    const nTricks = Math.floor((r.plays || []).length / 4);
    const veil = document.createElement('div'); veil.className = 'popveil';
    veil.innerHTML = `<div class="pop newspop"><h3>🛠️ Corriger le bot · ${r.n}</h3>
      <p class="muted" style="font-size:14px">${isBoss() ? 'Ta remarque part directement à Claude.' : 'Ta remarque sera relue par Damien avant d’être prise en compte.'}</p>
      <div class="row2"><button class="btn center ${robotBids.length ? 'primary' : ''}" data-q="encheres">Enchères</button><button class="btn center ${robotBids.length ? '' : 'primary'}" data-q="jeu" ${nTricks ? '' : 'disabled'}>Jeu de la carte</button></div>
      <div id="fixwhich" style="margin:10px 0"></div>
      <textarea id="fixtxt" rows="4" placeholder="Qu’aurait dû faire le robot, et pourquoi ?" style="width:100%;box-sizing:border-box;font-size:16px;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></textarea>
      <p id="fixerr" style="color:#c0392b;font-size:14px;min-height:18px;margin:4px 0"></p>
      <div class="row2"><button class="btn center" data-fx="cancel">Annuler</button><button class="btn primary center" data-fx="send">Envoyer</button></div></div>`;
    document.body.appendChild(veil);
    let quoi = robotBids.length ? 'encheres' : 'jeu';
    const which = () => {
      const box = veil.querySelector('#fixwhich');
      veil.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('primary', b.dataset.q === quoi));
      box.innerHTML = quoi === 'encheres'
        ? `<label style="font-size:14px">Quelle enchère ?<br><select id="fixref" style="font-size:16px;width:100%;padding:6px">${robotBids.map(x => `<option value="${x.i}">${x.i + 1}. ${NAMES[x.seat]} : ${x.b === 'P' ? 'Passe' : x.b}</option>`).join('')}<option value="-1">Toute la séquence</option></select></label>`
        : `<label style="font-size:14px">Quel pli ?<br><select id="fixref" style="font-size:16px;width:100%;padding:6px">${Array.from({ length: nTricks }, (_, k) => `<option value="${k}">Pli ${k + 1}</option>`).join('')}<option value="-1">Tout le jeu</option></select></label>`;
    };
    which();
    veil.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { quoi = b.dataset.q; which(); }));
    veil.querySelector('[data-fx="cancel"]').addEventListener('click', () => veil.remove());
    veil.querySelector('[data-fx="send"]').addEventListener('click', async () => {
      const texte = veil.querySelector('#fixtxt').value.trim(), ref = +veil.querySelector('#fixref').value;
      if (texte.length < 3) { veil.querySelector('#fixerr').textContent = 'Écris ta remarque.'; return; }
      const data = {
        type: 'robot salon', quoi, ref, donne: r.n, texte, auteur: getPlayer(), date: now(), statut: 'nouveau',
        rapport: `Donne ${r.n} (${deal.src.simu} du ${deal.src.date}, donne ${deal.src.num}) · donneur ${deal.d} · vul ${deal.v}\nMains : N ${deal.N} | E ${deal.E} | S ${deal.S} | O ${deal.O}\nContrat : ${r.contrat}${r.levees !== undefined ? ' · ' + r.levees + ' levées' : ''}\n— Enchères —\n${bidsTxt(r, deal)}${playsTxt(r, deal) ? '\n— Jeu —\n' + playsTxt(r, deal) : ''}\nRemarque sur : ${quoi === 'encheres' ? (ref < 0 ? 'toute la séquence' : 'enchère n° ' + (ref + 1)) : (ref < 0 ? 'tout le jeu' : 'pli ' + (ref + 1))}`,
        bids: r.bids || [], notes: r.notes || [], plays: r.plays || [], joueurs: r.joueurs || {}, systemes: r.systemes || {}, contrat: r.contrat, levees: r.levees ?? null, ns: r.ns ?? null, pct: r.pct ?? null, n: r.n,
      };
      veil.querySelector('#fixerr').textContent = 'Envoi…';
      try {
        if (isBoss()) await db.collection('corrections').add({ data: JSON.stringify(data) });
        else await db.collection('propositions').add({ uid: me(), statut: 'a_valider', t: now(), data: JSON.stringify(data) });
        veil.querySelector('.pop').innerHTML = `<div class="pop-ico">✓</div><h3>Merci !</h3><p>${isBoss() ? 'Correction enregistrée.' : 'Damien va relire ta remarque.'}</p><button class="btn primary center" data-fx="ok">OK</button>`;
        veil.querySelector('[data-fx="ok"]').addEventListener('click', () => veil.remove());
      } catch (e) { veil.querySelector('#fixerr').textContent = 'Envoi impossible pour l’instant.'; }
    });
  }
  // Boîte « À valider » de Damien
  function listenPending() {
    if (!isBoss()) return;
    unsubs.push(db.collection('propositions').where('statut', '==', 'a_valider').onSnapshot(s => {
      pendingN = s.size;
      const b = document.getElementById('tabvalid'); if (b) { b.classList.toggle('dotted', pendingN > 0); b.querySelector('em').textContent = pendingN ? `(${pendingN})` : ''; }
      if (tab === 'valid') validView();
    }, () => {}));
  }
  async function validView() {
    document.body.classList.remove('tablemode', 'inplay');
    let items = [];
    try { const q = await db.collection('propositions').where('statut', '==', 'a_valider').get(); items = q.docs.map(d => ({ id: d.id, ...JSON.parse(d.data().data) })).sort((a, b) => a.date - b.date); } catch (e) { items = []; }
    if (tab !== 'valid') return;
    app.innerHTML = topbar('Remarques à valider', curId ? 'Table' : 'Salon') + (items.length ? items.map(p => `<div class="card">
        <b>${esc(p.auteur)}</b> · donne ${p.donne} · ${p.quoi === 'encheres' ? 'enchères' : 'jeu de la carte'}${p.ref >= 0 ? (p.quoi === 'encheres' ? ` (enchère n° ${p.ref + 1} : ${p.bids[p.ref] === 'P' ? 'Passe' : fmt(p.bids[p.ref])})` : ` (pli ${p.ref + 1})`) : ''}
        <small class="muted"> · ${new Date(p.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
        <textarea data-txt="${p.id}" rows="3" style="width:100%;box-sizing:border-box;font-size:15px;margin:8px 0;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">${esc(p.texte)}</textarea>
        <button class="btn center" data-see="${p.id}">▶ Voir la donne (enchères et jeu)</button>
        <div class="row2"><button class="btn center" data-rej="${p.id}">✗ Rejeter</button><button class="btn primary center" data-ok="${p.id}">✓ Valider</button></div></div>`).join('')
      : '<p class="center muted">Aucune remarque en attente.</p>') + tabBar();
    on('back', () => { tab = 'main'; render(); }); wireTabs();
    const byId = id => items.find(x => x.id === id);
    app.querySelectorAll('[data-see]').forEach(b => b.addEventListener('click', () => replayView(byId(b.dataset.see), 0, 'valid')));
    app.querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', async () => {
      const p = byId(b.dataset.ok), txt = app.querySelector(`[data-txt="${p.id}"]`).value.trim();
      const { id, ...rest } = p;
      b.disabled = true;
      try {
        await db.collection('corrections').add({ data: JSON.stringify({ ...rest, texte: txt, texteInitial: p.texte, validePar: 'Damien', statut: 'nouveau' }) });
        await db.collection('propositions').doc(id).update({ statut: 'validee' });
      } catch (e) { b.disabled = false; }
    }));
    app.querySelectorAll('[data-rej]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { await db.collection('propositions').doc(b.dataset.rej).update({ statut: 'rejetee' }); } catch (e) { b.disabled = false; } }));
  }

  // ═════ Invitations et déplacements (maître de table)
  function invite(seat, uid) {
    const p = fresh().find(x => x.id === uid); if (!p) return;
    tx(t => (!isMaster(t) || t.sieges[seat] ? null : { ['invits.' + uid]: { seat, nom: p.nom, de: getPlayer(), t: now() } }));
  }
  function moveSeat(from, to) {
    tx(t => {
      if (!isMaster(t)) return null;
      const s = { ...t.sieges }; const a = s[from]; s[from] = s[to] || null; s[to] = a; return { sieges: s };
    });
  }
  // Invitation reçue (au salon) : fenêtre Accepter / Refuser
  const answered = new Set();
  function checkInvites() {
    if (curId) return;
    const t = tables.find(x => x.invits && x.invits[me()] && x.invits[me()].t > now() - 10 * 60000 && !answered.has(x.id + x.invits[me()].t) && x.etat !== 'fermee');
    if (!t || document.querySelector('.invveil')) return;
    const inv = t.invits[me()];
    answered.add(t.id + inv.t);
    const veil = document.createElement('div'); veil.className = 'popveil invveil';
    veil.innerHTML = `<div class="pop"><div class="pop-ico">🃏</div><h3>Invitation</h3><p><b>${esc(inv.de)}</b> t’invite à sa table, place <b>${NAMES[inv.seat]}</b>.</p>
      <div class="row2"><button class="btn center" data-inv="non">Non merci</button><button class="btn primary center" data-inv="oui">J’y vais !</button></div></div>`;
    document.body.appendChild(veil);
    veil.querySelectorAll('[data-inv]').forEach(b => b.addEventListener('click', async () => {
      veil.remove();
      const ref = db.collection('tables').doc(t.id);
      if (b.dataset.inv === 'non') { ref.update({ ['invits.' + me()]: firebase.firestore.FieldValue.delete() }).catch(() => {}); return; }
      try {
        await db.runTransaction(async T => {
          const d = await T.get(ref); const x = d.data(); if (!x) return;
          const upd = { ['invits.' + me()]: firebase.firestore.FieldValue.delete(), maj: now() };
          if (!x.sieges[inv.seat] || x.sieges[inv.seat].robot) {
            const s = { ...x.sieges }; SEATS.forEach(k => { if (s[k] && s[k].uid === me()) s[k] = null; }); s[inv.seat] = { uid: me(), nom: getPlayer() }; upd.sieges = s;
          }
          T.update(ref, upd);
        });
      } catch (e) { /* place prise entre-temps */ }
      enterTable(t.id);
    }));
  }

  // ───── Onglets du bas (comme sur BBO) : salle ou table · mes donnes · chat
  function tabBar() {
    const main = curId ? ['🂠', 'Table'] : ['🏠', 'Salon'];
    const b = (k, ico, txt) => `<button class="tab ${tab === k ? 'on' : ''}" id="tab${k}" data-tab="${k}"><span>${ico}</span>${txt}</button>`;
    return `<nav class="tabbar">${b('main', main[0], main[1])}${b('hist', '📜', 'Mes donnes')}${b('chat', '💬', 'Chat')}${isBoss() ? b('valid', '📝', 'À valider <em>' + (pendingN ? '(' + pendingN + ')' : '') + '</em>') : ''}</nav>`;
  }
  function wireTabs() { app.querySelectorAll('[data-tab]').forEach(x => x.addEventListener('click', () => { tab = x.dataset.tab; render(); })); markChatTab(); const v = document.getElementById('tabvalid'); if (v) v.classList.toggle('dotted', pendingN > 0); }
  function render() {
    window.scrollTo(0, 0);
    if (tab === 'hist') return histView();
    if (tab === 'chat') return chatView();
    if (tab === 'valid') return validView();
    return curId ? renderTable() : renderSalon();
  }
  // Pendant qu'on regarde un autre onglet : pastille sur « Table » quand c'est à nous de jouer
  function markTableTab() {
    const t = current, el = document.getElementById('tabmain'); if (!t || !el) return;
    const my = mySeat(t), deal = t.n && dealOf(t.n);
    let mine = false;
    if (deal && my && t.etat === 'encheres') mine = auction(t, deal).turn === my;
    if (deal && my && t.etat === 'jeu') { const A = auction(t, deal), ps = playState(t, deal, A.contract), sw = swapOf(t, A.contract); const ctl = sw && (ps.turn === A.contract.decl || ps.turn === ps.dummy) ? sw.human : ps.turn === ps.dummy ? A.contract.decl : ps.turn; mine = !ps.done && ctl === my; }
    el.classList.toggle('dotted', mine);
  }
  function chatView() {
    document.body.classList.remove('tablemode', 'inplay');
    setSeen();
    app.innerHTML = topbar('Chat du salon', curId ? 'Table' : 'Salon') + '<p class="muted" style="font-size:13px;margin:0 0 6px">Tout le salon lit ce chat. Il est remis à zéro chaque lundi à 3h.</p>' + chatHtml('').replace('class="chatlog"', 'class="chatlog full"') + tabBar();
    on('back', () => { tab = 'main'; render(); });
    wireChat(); wireTabs(); markTableTab();
  }
  async function histView() {
    document.body.classList.remove('tablemode', 'inplay');
    app.innerHTML = topbar('Mes donnes', curId ? 'Table' : 'Salon') + '<p class="center muted">Chargement…</p>' + tabBar();
    on('back', () => { tab = 'main'; render(); }); wireTabs();
    try {
      const q = await db.collection('resultats').where('uids', 'array-contains', me()).get();
      histCache = q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.t - a.t);
    } catch (e) { histCache = histCache || []; }
    if (tab !== 'hist') return;
    const mySide = r => { const x = SEATS.find(k => r.places && r.places[k] === me()); return x ? sideOf(x) : 'NS'; };
    const myPct = r => (r.pct === null || r.pct === undefined ? null : mySide(r) === 'NS' ? r.pct : Math.round((100 - r.pct) * 10) / 10);
    const rows = histCache.map((r, i) => {
      const pct = myPct(r), pts = mySide(r) === 'NS' ? r.ns : -r.ns;
      return `<button class="hrow" data-h="${i}"><span><b>${r.n}</b><small>${new Date(r.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${mySide(r)}</small></span><span>${fmt(r.contrat)}</span><span>${pts > 0 ? '+' : ''}${pts}</span><span class="${pct === null ? '' : pct >= 50 ? 'good' : 'bad'}">${pct === null ? '—' : pct + ' %'}</span></button>`;
    }).join('');
    const vals = histCache.map(myPct).filter(x => x !== null);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
    app.innerHTML = topbar('Mes donnes', curId ? 'Table' : 'Salon') + (histCache.length
      ? `<p class="muted" style="font-size:14px;margin:0 0 8px">${histCache.length} donne(s) jouée(s)${avg !== null ? ` · moyenne ${avg} %` : ''}. Touche une donne pour la revoir.</p><div class="hlist">${rows}</div>`
      : '<p class="center muted">Tu n’as pas encore joué de donne au salon.</p>') + tabBar();
    on('back', () => { tab = 'main'; render(); }); wireTabs(); markTableTab();
    app.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => replayView(histCache[+b.dataset.h], 0, 'hist')));
  }
  // Relecture d'une donne : les 4 mains ouvertes, carte par carte
  function replayView(r, step, from) {
    const deal = dealOf(r.n); if (!deal) return;
    const bids = r.bids || [], plays = r.plays || [];
    const A = auction({ bids }, deal), c = A.contract;
    step = Math.max(0, Math.min(plays.length, step));
    const ps = c ? playState({ plays: plays.slice(0, step) }, deal, c)
      : { hands: Object.fromEntries(SEATS.map(x => [x, parseHand(deal[x])])), trick: [], tricks: { NS: 0, EO: 0 }, last: null, trump: null };
    const shown = ps.trick.length ? ps.trick : (ps.last || []);
    const w = shown.length === 4 ? winnerOf(shown, ps.trump) : null;
    const handTxt = x => `<div class="rh"><b>${NAMES[x]}</b> <small class="muted">${esc((r.joueurs || {})[x] || '')} · ${hcpOf(deal[x])}H</small>${DISPLAY.map(k => `<div><span class="${red(k) ? 'red' : ''}">${SYM[k]}</span> ${[...ps.hands[x][k]].sort((a, b) => b - a).map(q => RLAB[q]).join(' ') || '—'}</div>`).join('')}</div>`;
    const slot = (x, pos) => { const y = shown.find(k => k.seat === x); return `<div class="slot ${pos}">${y ? cardBtn(y.s, y.r, 'md ' + (w && w.seat === x ? 'win' : '')) : ''}</div>`; };
    document.body.classList.remove('tablemode', 'inplay');
    app.innerHTML = topbar('Donne ' + r.n, from === 'hist' ? 'Mes donnes' : 'Table') + `
      <p style="margin:0 0 6px">${fmt(r.contrat)}${c ? ` · ${r.levees} levées` : ''} · NS ${r.ns > 0 ? '+' : ''}${r.ns} · <b>NS ${r.pct ?? '—'} %</b> <small class="muted">${deal.src.simu} du ${deal.src.date.split('-').reverse().join('/')}</small></p>
      <div class="felt" style="padding:8px">${auctionTable({ bids, notes: r.notes || [] }, deal)}</div>
      <div id="notebox"></div>
      <div class="rgrid"><div class="rn">${handTxt('N')}</div><div class="ro">${handTxt('O')}</div>
        <div class="rc"><div class="trick">${slot('N', 'top')}${slot('O', 'left')}${slot('E', 'right')}${slot('S', 'bottom')}</div></div>
        <div class="re">${handTxt('E')}</div><div class="rs">${handTxt('S')}</div></div>
      ${plays.length ? `<div class="solnav"><button class="btn center" data-st="0">⏮</button><button class="btn center" data-st="${step - 1}">◀</button><button class="btn center" data-st="${step + 1}">▶</button><button class="btn center" data-st="${Math.min(plays.length, (Math.floor(step / 4) + 1) * 4)}">Levée ⏭</button></div>
        <p class="center muted" style="font-size:13px">Carte ${step}/${plays.length} · NS ${ps.tricks.NS} levée(s) · EO ${ps.tricks.EO}</p>` : '<p class="center muted">Pas de jeu de la carte (passe générale ou donne ancienne).</p>'}
      ${from !== 'valid' && (r.robots || Object.values(r.systemes || {}).some(Boolean)) ? '<button class="btn center" data-act="fixbot">🛠️ Corriger le bot</button>' : ''}
      ${tabBar()}`;
    on('back', () => { if (from === 'hist') histView(); else if (from === 'valid') validView(); else { tab = 'main'; render(); } });
    on('fixbot', () => openFix(r));
    wireTabs();
    app.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => replayView(r, +b.dataset.st, from)));
    wireNotes(r.notes || [], bids);
  }

  async function pendingCount() { if (!isBoss()) return 0; try { return (await db.collection('propositions').where('statut', '==', 'a_valider').get()).size; } catch (e) { return 0; } }
  // Au lancement de l'appli : s'il y a une table en cours pour moi, on y retourne directement
  async function resumeIfAny() {
    let id = null; try { id = localStorage.getItem(tableKey()); } catch (e) { id = null; }
    if (!id) return false;
    try { const d = await db.collection('tables').doc(id).get(); const t = d.exists && d.data(); if (!t || t.etat === 'fermee' || !SEATS.some(k => t.sieges[k] && t.sieges[k].uid === me())) { rememberTable(null); return false; } } catch (e) { return false; }
    open(); return true;
  }
  return { open, resumeIfAny, openValidation: () => open('valid'), pendingCount, stop: () => { stopAll(); stopBeat(); } , _test: { auction, score, pctNS, weekStart } };
}
