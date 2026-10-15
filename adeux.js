// Système Raimon — mode « Jouer avec… » : enchères à deux, au tour par tour, partagées via Firestore (REST).
// Une partie = 10 donnes ; celui qui la crée est Nord, son partenaire Sud. Les adversaires suivent le scénario
// de la donne tant que vos enchères suivent le système, et passent sinon.

const FIRESTORE = {
  base: 'https://firestore.googleapis.com/v1/projects/systeme-raimon/databases/(default)/documents/parties',
  key: 'AIzaSyCntK9XEN1dCGrboXDl9lUx1tU-fnXoVXM',
};

function createDuo(env) {
  'use strict';
  const { app, topbar, SYS_BTN, isVul, hcpOf, on, go, fmt, bidLabel, bidRank, getPlayer, players, home, SEAT_NAMES } = env;
  const SEATS = ['N', 'E', 'S', 'O'];
  const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4];
  const partnerOf = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
  // Donnes propres au mode à deux (T001…) ; les toutes premières parties utilisaient les numéros du mode solo.
  const dealOf = n => (typeof n === 'number' ? DEALS : DUO_DEALS).find(d => d.n === n);
  const seatAt = (deal, i) => SEATS[(SEATS.indexOf(deal.d) + i) % 4];
  let parties = [], everyParty = [], current = null, busy = false;
  const shown = {};

  // ───── Firestore (REST) : chaque partie est un document { data: JSON }
  const enc = obj => ({ fields: { data: { stringValue: JSON.stringify(obj) } } });
  const dec = doc => ({ ...JSON.parse(doc.fields.data.stringValue), id: doc.name.split('/').pop(), updateTime: doc.updateTime });
  async function api(path, opts) {
    const r = await fetch(FIRESTORE.base + path + (path.includes('?') ? '&' : '?') + 'key=' + FIRESTORE.key, { ...opts, headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) { const t = await r.text(); const e = new Error(t); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }
  async function loadAll() {
    const r = await api('?pageSize=300');
    everyParty = (r.documents || []).map(dec);
    parties = everyParty.filter(p => p.nord === getPlayer() || p.sud === getPlayer()).sort((a, b) => b.created - a.created);
    return parties;
  }
  async function saveParty(p) {
    const { id, updateTime, ...data } = p;
    const doc = await api('/' + id + '?currentDocument.updateTime=' + encodeURIComponent(updateTime), { method: 'PATCH', body: JSON.stringify(enc(data)) });
    return dec(doc);
  }

  // ───── Règles de la séquence
  function seatOfPlayer(p) { return p.nord === getPlayer() ? 'N' : 'S'; }
  function finished(calls) {
    let last = -1; calls.forEach((b, i) => { if (b !== 'P') last = i; });
    return last < 0 ? calls.length >= 4 : calls.length - last - 1 >= 3;
  }
  // Les adversaires : le scénario tant que la séquence suit le système, sinon passe.
  function autoOpponents(deal, calls) {
    while (!finished(calls) && (seatAt(deal, calls.length) === 'E' || seatAt(deal, calls.length) === 'O')) {
      const i = calls.length;
      const onScript = calls.every((b, k) => b === deal.a[k][0]);
      calls.push(onScript && deal.a[i] ? deal.a[i][0] : 'P');
    }
    return calls;
  }
  function statusOf(p, g) {
    const deal = dealOf(g.n);
    if (finished(g.calls)) return 'fini';
    const seat = seatAt(deal, g.calls.length);
    return seat === seatOfPlayer(p) ? 'moi' : 'lui';
  }
  const otherName = p => (p.nord === getPlayer() ? p.sud : p.nord);
  // Discussion entre partenaires sur une donne terminée : { msgs: [{ auteur, texte, date }], accord: { par, date } | null }
  const talk = g => g.discussion && g.discussion.msgs.length ? g.discussion : null;
  const unread = g => { const t = talk(g); return !!t && !t.accord && t.msgs[t.msgs.length - 1].auteur !== getPlayer(); };

  // ───── Écran « À deux »
  async function list() {
    document.body.classList.remove('tablemode');
    app.innerHTML = topbar('Jouer à deux') + '<p class="center muted">Chargement…</p>';
    on('back', () => go(home));
    try { await loadAll(); } catch (e) { return showError(e); }
    const me = getPlayer();
    const rows = parties.map(p => {
      const st = p.donnes.map(g => statusOf(p, g));
      const mine = st.filter(s => s === 'moi').length, done = st.filter(s => s === 'fini').length, msgs = p.donnes.filter(unread).length;
      return `<button class="btn" data-party="${p.id}">Avec <b>${otherName(p)}</b> (toi ${seatOfPlayer(p) === 'N' ? 'Nord' : 'Sud'})
        <small>${done}/${p.donnes.length} terminées${mine ? ` · <b style="color:var(--accent)">${mine} à toi</b>` : ''}${msgs ? ` · <b style="color:var(--accent)">💬 ${msgs} message${msgs > 1 ? 's' : ''}</b>` : ''} · ${new Date(p.created).toLocaleDateString('fr-FR')}</small></button>`;
    }).join('');
    app.innerHTML = topbar('Jouer à deux', null, SYS_BTN) + `
      <div class="card"><p style="margin:0">Enchères au tour par tour, chacun sur son téléphone. Celui qui lance la partie est <b>Nord</b>, son partenaire <b>Sud</b>.
        À la fin de chaque donne : l'analyse de votre séquence par rapport au système.</p></div>
      <div class="section-title">Nouvelle partie (10 donnes)</div>
      <div class="row2">${players.filter(x => x !== me).map(x => `<button class="btn primary center" data-new="${x}">Jouer avec ${x}</button>`).join('')}</div>
      <div class="section-title">Tes parties</div>
      ${rows || '<p class="muted">Aucune partie pour l’instant.</p>'}
      <p class="center"><button class="link" data-act="refresh">↻ Actualiser</button></p>`;
    on('back', () => go(home));
    on('refresh', () => list());
    app.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => create(b.dataset.new)));
    app.querySelectorAll('[data-party]').forEach(b => b.addEventListener('click', () => openParty(b.dataset.party)));
  }

  function showError(e) {
    const rules = e.status === 403 ? '<p>La base refuse l’accès : les règles Firestore ne sont pas encore publiées.</p>' : '';
    app.innerHTML = topbar('Jouer à deux', null, SYS_BTN) + `<div class="feedback ko"><h3>Connexion à la base impossible</h3>${rules}<p class="muted" style="font-size:13px">${String(e.message).slice(0, 200)}</p></div>
      <button class="btn primary center" data-act="retry" style="margin-top:12px">Réessayer</button>`;
    on('back', () => go(home));
    on('retry', () => list());
  }

  async function create(partner) {
    if (busy) return; busy = true;
    // 10 donnes au hasard qu'aucun des deux n'a encore vues, avec qui que ce soit (à défaut : les moins vues)
    const me = getPlayer(), seen = {};
    everyParty.filter(p => [p.nord, p.sud].some(x => x === me || x === partner)).forEach(p => p.donnes.forEach(g => { seen[g.n] = (seen[g.n] || 0) + 1; }));
    const pick = DUO_DEALS.map(d => [d, (seen[d.n] || 0) + Math.random()]).sort((a, b) => a[1] - b[1]).slice(0, 10).map(x => x[0]);
    const data = { nord: getPlayer(), sud: partner, created: Date.now(), donnes: pick.map(d => ({ n: d.n, calls: autoOpponents(d, []) })) };
    try { const doc = await api('', { method: 'POST', body: JSON.stringify(enc(data)) }); busy = false; current = dec(doc); go(partyView); }
    catch (e) { busy = false; showError(e); }
  }

  async function openParty(id) {
    try { await loadAll(); } catch (e) { return showError(e); }
    current = parties.find(p => p.id === id);
    go(partyView);
  }

  function partyView() {
    document.body.classList.remove('tablemode');
    const p = current;
    const rows = p.donnes.map((g, i) => {
      const st = statusOf(p, g);
      const t = talk(g);
      const lab = st === 'fini' ? (unread(g) ? `<b style="color:var(--accent)">💬 Message de ${otherName(p)}</b>` : t && !t.accord ? '💬 En discussion' : t ? '✓ Terminée · vous vous êtes mis d’accord' : '✓ Terminée : voir l’analyse') :st === 'moi' ? '<b style="color:var(--accent)">À toi d’enchérir</b>' : `Au tour de ${otherName(p)}`;
      return `<button class="btn ${st === 'lui' ? 'waiting' : ''}" data-g="${i}">Donne n° ${g.n}<small>${lab}${st === 'lui' && undoIndex(p, g) >= 0 ? ' · tu peux encore modifier ton enchère' : ''}</small></button>`;
    }).join('');
    app.innerHTML = topbar('Avec ' + otherName(p), 'Parties', SYS_BTN) + rows + '<p class="center"><button class="link" data-act="refresh">↻ Actualiser</button></p>';
    on('back', () => go(list));
    on('refresh', () => openParty(p.id));
    app.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.g, g = p.donnes[i];
      if (statusOf(p, g) === 'fini') go(() => analysis(i)); else go(() => bidView(i, null, { anim: true }));
    }));
  }

  // ───── Enchérir (table, toi en bas)
  function bidView(i, choice, opts = {}) {
    const p = current, g = p.donnes[i], deal = dealOf(g.n);
    shown[i] = g.calls.join(',');          // la séquence vue à l'écran (pour détecter une modification du partenaire)
    const me = seatOfPlayer(p), myTurn = statusOf(p, g) === 'moi';
    document.body.classList.add('tablemode');
    const pos = { [me]: 'bottom', [partnerOf(me)]: 'top', [next(me)]: 'left', [next(partnerOf(me))]: 'right' };
    const stacks = { N: [], E: [], S: [], O: [] };
    let lastRank = -1;
    g.calls.forEach((b, k) => {
      const seat = seatAt(deal, k), rk = bidRank(b);
      if (rk >= 0) { const strain = b.slice(1); let ml = 1; while (bidRank(ml + strain) <= lastRank) ml++; if (+b[0] > ml) stacks[seat].push('<div class="gb stack stop">STOP</div>'); lastRank = rk; }
      stacks[seat].push(tileHtml(b, k === g.calls.length - 1 ? 'last' : ''));
    });
    const name = s => (s === me ? 'Toi' : s === partnerOf(me) ? otherName(p) : SEAT_NAMES[s]);
    const POS = { bottom: 'S', top: 'N', left: 'O', right: 'E' };       // classes CSS de placement
    const plate = s => `<div class="plate ${pos[s]} ${myTurn && s === me ? 'turn' : ''}"><span class="seat ${isVul(deal, s) ? '' : 'nv'}">${s}</span>${name(s)}${s === me ? ` · <span class="hcp">${hcpOf(deal.h[me])}H</span>` : ''}${deal.d === s ? '<span class="dealer" title="Donneur">D</span>' : ''}</div>`;
    const stack = s => (stacks[s].length ? `<div class="bidstack ${POS[pos[s]]}">${stacks[s].join('')}</div>` : '');
    const hand = deal.h[me].split('.');
    const canUndo = !myTurn && undoIndex(p, g) >= 0;
    app.innerHTML = topbar('Donne ' + deal.n, 'Donnes', SYS_BTN) + navHtml(i) + `
      ${opts.notice ? `<div class="notice">${opts.notice}</div>` : ''}
      <div class="frame bidframe ${opts.anim ? (opts.dir < 0 ? 'dealin back' : 'dealin') : ''}">${opts.anim ? `<div class="dealflash">Donne ${deal.n}<small>${myTurn ? 'À toi d’enchérir' : 'Au tour de ' + otherName(p)}</small></div>` : ''}
        ${SEATS.map(plate).join('')}${SEATS.map(stack).join('')}
        <div class="bidcenter" id="fb">${myTurn ? gridHtml(g, deal, choice) : `<p class="feltnote">Au tour de ${otherName(p)}</p>${canUndo ? '<button class="btn center undo" data-act="undo">↶ Modifier mon enchère</button>' : ''}`}</div>
        <div class="vulnote">Donneur : ${SEAT_NAMES[deal.d]} · ${{ none: 'personne vulnérable', NS: 'vulnérables N/S', EO: 'vulnérables E/O', all: 'tous vulnérables' }[deal.v || 'none']}</div>
      </div>
      ${arcHtml([0, 1, 3, 2].flatMap(s => hand[s].replace('-', '').split('').filter(Boolean).map(ch => ({ s, label: ({ A: 'A', K: 'R', Q: 'D', J: 'V', T: '10' }[ch] || ch) }))))}`;
    on('back', () => go(partyView));
    app.querySelectorAll('[data-gb]').forEach(b => b.addEventListener('click', () => {
      if (choice === b.dataset.gb) return submit(i, choice);
      bidView(i, b.dataset.gb);
    }));
    on('announce', () => submit(i, choice));
    on('unpick', () => bidView(i));
    on('undo', () => undo(i));
    wireNav(i);
  }
  // ───── Navigation entre les donnes de la partie
  function navHtml(i) {
    const p = current, n = p.donnes.length;
    const dot = g => { const st = statusOf(p, g); return st === 'fini' ? '✓' : st === 'moi' ? '●' : '○'; };
    return `<div class="dnav"><button class="dnav-b" data-nav="-1" ${i === 0 ? 'disabled' : ''} aria-label="Donne précédente">‹</button>
      <div class="dnav-mid"><b>${i + 1} / ${n}</b><span>${p.donnes.map((g, k) => `<i class="${k === i ? 'on' : ''}">${dot(g)}</i>`).join('')}</span></div>
      <button class="dnav-b" data-nav="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Donne suivante">›</button></div>`;
  }
  function openDeal(j, dir) {
    const g = current.donnes[j];
    if (statusOf(current, g) === 'fini') go(() => analysis(j)); else go(() => bidView(j, null, { anim: true, dir }));
  }
  function wireNav(i) {
    app.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => openDeal(i + +b.dataset.nav, +b.dataset.nav)));
  }
  function tileHtml(b, cls) {
    const cols = ['SA', '♠', '♥', '♦', '♣'];
    const kind = b === 'P' ? 'gpass' : b === 'X' ? 'gx' : b === 'XX' ? 'gxx' : 'g' + cols.indexOf(b.slice(1));
    const txt = b === 'P' ? 'PASSE' : b === 'X' || b === 'XX' ? b : b[0] + `<span>${b.slice(1) === 'SA' ? 'SA' : fmt(b.slice(1))}</span>`;
    return `<div class="gb stack ${kind} ${cls}">${txt}</div>`;
  }
  function gridHtml(g, deal, choice) {
    let last = -1, lastSeat = null, dbl = 0;
    g.calls.forEach((b, k) => { const s = seatAt(deal, k); if (b === 'P') return; if (b === 'X') { dbl = 1; return; } if (b === 'XX') { dbl = 2; return; } last = bidRank(b); lastSeat = s; dbl = 0; });
    const me = seatAt(deal, g.calls.length);
    const opp = lastSeat && (lastSeat === 'E' || lastSeat === 'O') !== (me === 'E' || me === 'O');
    const canX = opp && dbl === 0, canXX = lastSeat && !opp && dbl === 1;
    const cols = ['SA', '♠', '♥', '♦', '♣'];
    let rows = '';
    for (let l = 1; l <= 7; l++) rows += cols.map(c => { const b = l + c; const ok = bidRank(b) > last; return `<button class="gb g${cols.indexOf(c)} ${choice === b ? 'sel' : ''}" ${ok ? `data-gb="${b}"` : 'disabled'}>${l}<span>${c === 'SA' ? 'SA' : fmt(c)}</span></button>`; }).join('');
    const big = choice ? `<div class="bigbid-veil" data-act="unpick"></div><button class="gb bigbid ${choice === 'P' ? 'gpass' : choice === 'X' ? 'gx' : choice === 'XX' ? 'gxx' : 'g' + cols.indexOf(choice.slice(1))}" data-act="announce">${choice === 'P' ? 'PASSE' : choice === 'X' || choice === 'XX' ? choice : choice[0] + `<span>${choice.slice(1) === 'SA' ? 'SA' : fmt(choice.slice(1))}</span>`}<small>Touche pour annoncer</small></button>` : '';
    return `<div class="gridwrap"><div class="gridbox">${rows}</div>
      <div class="gspecial"><button class="gb gpass ${choice === 'P' ? 'sel' : ''}" data-gb="P">PASSE</button><button class="gb gx ${choice === 'X' ? 'sel' : ''}" ${canX ? 'data-gb="X"' : 'disabled'}>X</button><button class="gb gxx ${choice === 'XX' ? 'sel' : ''}" ${canXX ? 'data-gb="XX"' : 'disabled'}>XX</button></div>${big}</div>
      <p class="gridhint">${choice ? 'Touche l’enchère au centre pour l’annoncer' : 'À toi : touche ton enchère'}</p>`;
  }

  async function submit(i, choice) {
    if (busy || !choice) return; busy = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = current, g = p.donnes[i], deal = dealOf(g.n);
      if (g.calls.join(',') !== shown[i]) { busy = false; return changedUnderMe(i); }
      if (statusOf(p, g) !== 'moi') break;
      g.calls.push(choice);
      autoOpponents(deal, g.calls);
      try { current = await saveParty(p); busy = false; break; }
      catch (e) {
        if (e.status === 400 || e.status === 409 || e.status === 412) { await openPartySilent(p.id); continue; }   // modifiée entre-temps : on recharge
        busy = false; return showError(e);
      }
    }
    busy = false;
    const g = current.donnes[i];
    if (finished(g.calls)) return go(() => analysis(i));
    if (statusOf(current, g) === 'moi') return bidView(i);
    // au partenaire : on passe à la donne suivante qui m'attend
    const nextMine = current.donnes.findIndex(x => statusOf(current, x) === 'moi');
    if (nextMine >= 0) return go(() => bidView(nextMine, null, { anim: true }));
    go(partyView);
  }
  // Le partenaire a modifié son enchère pendant que je choisissais la mienne : mon enchère n'est pas enregistrée.
  function changedUnderMe(i) {
    const g = current.donnes[i];
    const notice = `<b>${otherName(current)} a modifié son enchère</b> pendant que tu choisissais : ton enchère n'a pas été enregistrée. Regarde la nouvelle séquence.`;
    if (finished(g.calls)) return go(() => analysis(i));
    go(() => bidView(i, null, { notice }));
  }

  // ───── Modifier sa dernière enchère tant que le partenaire n'a pas parlé après
  // Renvoie l'indice de ma dernière enchère si, depuis, seuls les adversaires (robot) ont parlé ; sinon -1.
  function undoIndex(p, g) {
    if (talk(g)) return -1;
    const deal = dealOf(g.n), me = seatOfPlayer(p);
    let k = -1; g.calls.forEach((b, j) => { if (seatAt(deal, j) === me) k = j; });
    if (k < 0) return -1;
    for (let j = k + 1; j < g.calls.length; j++) if (seatAt(deal, j) === partnerOf(me)) return -1;
    return k;
  }
  async function undo(i) {
    if (busy) return; busy = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await openPartySilent(current.id); } catch (e) { busy = false; return showError(e); }
      const g = current.donnes[i], k = undoIndex(current, g);
      if (k < 0) { busy = false; return go(() => (finished(g.calls) ? analysis(i) : bidView(i, null, { notice: `Trop tard : ${otherName(current)} a déjà enchéri après toi.` }))); }
      g.calls = g.calls.slice(0, k);
      try { current = await saveParty(current); busy = false; return go(() => bidView(i, null, { notice: 'Ton enchère est retirée : choisis la bonne.' })); }
      catch (e) { if (e.status === 400 || e.status === 409 || e.status === 412) continue; busy = false; return showError(e); }
    }
    busy = false; go(() => bidView(i));
  }
  async function openPartySilent(id) { await loadAll(); current = parties.find(p => p.id === id); }

  // ───── Analyse par rapport au système
  function analysis(i) {
    document.body.classList.remove('tablemode');
    const p = current, g = p.donnes[i], deal = dealOf(g.n);
    const exp = deal.a.map(x => x[0]);
    let diverged = -1;
    g.calls.forEach((b, k) => { if (diverged < 0 && b !== exp[k] && !((deal.a[k] && deal.a[k][2]) || []).includes(b)) diverged = k; });
    const who = s => (s === 'N' ? p.nord : s === 'S' ? p.sud : SEAT_NAMES[s]);
    const contract = calls => { let c = null, by = null; calls.forEach((b, k) => { if (bidRank(b) >= 0) { c = b; by = seatAt(deal, k); } }); return c ? `${c} (dernière enchère de ${who(by)})` : 'Donne passée'; };
    const rows = g.calls.map((b, k) => {
      const seat = seatAt(deal, k), e = deal.a[k];
      const ok = diverged < 0 || k < diverged;
      const human = seat === 'N' || seat === 'S';
      if (!human && b === 'P' && (!e || !e[1])) return '';
      return `<li class="${!ok && k === diverged ? 'bad' : ''}"><b>${who(seat)} : ${fmt(bidLabel(b))}</b>${k === diverged ? ` — le système disait <b>${fmt(bidLabel(exp[k]))}</b>` : ''}${e && e[1] && (ok || k === diverged) ? `<br><span class="muted">${fmt(k === diverged ? 'Système : ' + e[1] : e[1])}</span>` : ''}</li>`;
    }).join('');
    const perfect = diverged < 0 && g.calls.length === exp.length;
    const mini = s => { const parts = deal.h[s].split('.'); return `<div class="mini"><div class="who">${who(s)}</div>${parts.map((x, j) => `<div><span class="${j === 1 || j === 2 ? 'red' : ''}">${['♠', '♥', '♦', '♣'][j]}</span> ${x === '-' ? '—' : x.split('').map(c => ({ A: 'A', K: 'R', Q: 'D', J: 'V', T: '10' }[c] || c)).join(' ')}</div>`).join('')}</div>`; };
    const report = [`Partie « ${p.nord} (Nord) – ${p.sud} (Sud) » — donne n° ${deal.n} (${deal.t})`,
      `Séquence jouée : ${g.calls.map(bidLabel).join(' – ')}`, `Séquence du système : ${exp.map(bidLabel).join(' – ')}`,
      diverged >= 0 ? `Premier écart : enchère n° ${diverged + 1} (${who(seatAt(deal, diverged))}) : ${bidLabel(g.calls[diverged])} au lieu de ${bidLabel(exp[diverged])}` : 'Aucun écart avec le système.',
      `Mains : N ${deal.h.N} · S ${deal.h.S} · E ${deal.h.E} · O ${deal.h.O}`].join('\n');
    app.innerHTML = topbar('Analyse ' + deal.n, 'Donnes', SYS_BTN) + navHtml(i) + `
      <div class="card center"><div class="feedback ${perfect ? 'ok' : 'ko'}"><h3 style="margin:0">${perfect ? 'Séquence conforme au système !' : 'Votre séquence s’écarte du système'}</h3></div>
        <p style="margin:10px 0 0">Votre contrat : <b>${fmt(contract(g.calls))}</b><br>Contrat du système : <b>${fmt(contract(exp))}</b>${deal.best ? `<br>Meilleur contrat possible : <b>${fmt(deal.best.c)}</b> (${deal.best.t} levées en double mort)` : ''}</p></div>
      <div class="card"><b>Enchère par enchère</b><ol class="expl">${rows}</ol>
        ${diverged >= 0 ? `<p class="muted" style="font-size:14px">Suite prévue par le système : ${fmt(exp.slice(diverged).map(bidLabel).join(' – '))}</p>` : ''}</div>
      <div class="card"><b>Les 4 mains</b><div class="compass"><div class="cN">${mini('N')}</div><div class="cO">${mini('O')}</div><div class="cE">${mini('E')}</div><div class="cS">${mini('S')}</div></div></div>
      <div id="talk">${talkHtml(p, g)}</div>
      <div id="fix"><button class="btn center" data-act="fixopen">Pas d’accord avec l’analyse ?</button></div>
      ${undoIndex(p, g) >= 0 ? '<button class="link" data-act="undo" style="display:block;margin:12px auto">↶ Modifier ma dernière enchère</button>' : ''}`;
    on('back', () => go(partyView));
    wireFix({ type: 'donne à deux', donne: deal.n, partie: p.id, rapport: report, sent: 'Analyse envoyée' });
    on('undo', () => undo(i));
    wireNav(i);
    wireTalk(i, report);
    if (talk(g)) document.getElementById('talk').scrollIntoView({ block: 'start' });
  }

  // ───── « Pas d'accord avec mon partenaire » : une discussion sur la donne, jusqu'à « on s'est mis d'accord ».
  // Elle est gardée dans la partie, et copiée dans la collection corrections à l'accord (pour faire évoluer robot et quiz).
  function talkHtml(p, g) {
    const t = talk(g), other = otherName(p);
    if (!t) return `<button class="btn center" data-act="talkopen">Pas d’accord avec ${other} ?</button>`;
    const when = d => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const bubbles = t.msgs.map(m => `<div class="msg ${m.auteur === getPlayer() ? 'me' : ''}"><small>${m.auteur === getPlayer() ? 'Toi' : m.auteur} · ${when(m.date)}</small>${esc(m.texte).replace(/\n/g, '<br>')}</div>`).join('');
    return `<div class="card"><b>Discussion avec ${other}</b><div class="msgs">${bubbles}</div>
      ${t.accord ? `<div class="feedback ok" style="margin-top:8px"><b>✓ D’accord</b> (validé par ${t.accord.par === getPlayer() ? 'toi' : t.accord.par}, ${when(t.accord.date)})</div>`
        : `<textarea id="talktext" rows="3" placeholder="Ta réponse à ${other}…" class="talkbox"></textarea>
        <div class="row2" style="margin-top:8px"><button class="btn primary center" data-act="talksend">Envoyer</button><button class="btn center" data-act="talkok">✓ On s’est mis d’accord</button></div>`}
      <p class="muted" id="talkmsg" style="font-size:13px;margin:4px 0 0"></p></div>`;
  }
  function wireTalk(i, report) {
    const p = current, other = otherName(p);
    on('talkopen', () => {
      document.getElementById('talk').innerHTML = `<div class="card"><b>Ton message à ${other}</b>
        <textarea id="talktext" rows="4" placeholder="Ex. : sur ton 2♠ je pensais que tu avais 5 cartes, pourquoi pas 2SA ?" class="talkbox"></textarea>
        <button class="btn primary center" data-act="talksend" style="margin-top:8px">Envoyer à ${other}</button><p class="muted" id="talkmsg" style="font-size:13px;margin:4px 0 0"></p></div>`;
      document.getElementById('talktext').focus();
      on('talksend', () => talkSave(i, report, 'msg'));
    });
    on('talksend', () => talkSave(i, report, 'msg'));
    on('talkok', () => talkSave(i, report, 'accord'));
  }
  async function talkSave(i, report, what) {
    if (busy) return;
    const box = document.getElementById('talktext'), msg = document.getElementById('talkmsg');
    const texte = box ? box.value.trim() : '';
    if (what === 'msg' && !texte) { msg.textContent = 'Écris ton message.'; return; }
    busy = true; msg.textContent = 'Envoi…';
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = current.donnes[i];
      g.discussion = g.discussion || { msgs: [], accord: null };
      if (texte) g.discussion.msgs.push({ auteur: getPlayer(), texte, date: Date.now() });
      if (what === 'accord') g.discussion.accord = { par: getPlayer(), date: Date.now() };
      try { current = await saveParty(current); break; }
      catch (e) {
        if ((e.status === 400 || e.status === 409 || e.status === 412) && attempt < 2) { await openPartySilent(current.id); continue; }
        busy = false; msg.textContent = 'Envoi impossible pour l’instant (' + (e.status || e.message) + '). Réessaie plus tard.'; return;
      }
    }
    busy = false;
    const g = current.donnes[i];
    if (what === 'accord') {      // la discussion complète part aussi pour analyse
      const fil = g.discussion.msgs.map(m => `${m.auteur} : ${m.texte}`).join('\n');
      postCorrection({ type: 'discussion à deux', donne: g.n, partie: current.id, rapport: report, texte: fil, messages: g.discussion.msgs, accord: g.discussion.accord, auteur: getPlayer(), date: Date.now(), statut: 'nouveau' }).catch(() => {});
    }
    go(() => analysis(i));
  }
  const postCorrection = data => fetch(FIRESTORE.base.replace('/parties', '/corrections') + '?key=' + FIRESTORE.key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(data) } } }) })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); });

  // ───── « Pas d'accord ? Corriger » : la remarque part dans la base (collection corrections) pour analyse.
  const fixButtonHtml = () => '<button class="btn center" data-act="fixopen">Pas d’accord ? Corriger</button>';
  const sentKey = ctx => `raimon-fix:${getPlayer()}:${ctx.type}:${ctx.donne || ctx.question}:${ctx.partie || ''}`;
  const wasSent = ctx => { try { return !!localStorage.getItem(sentKey(ctx)); } catch (e) { return false; } };
  function wireFix(ctx) {
    const box = document.getElementById('fix');
    if (box && wasSent(ctx)) { box.innerHTML = `<button class="btn center" disabled>✓ ${ctx.sent || 'Remarque envoyée'}</button>`; return; }
    on('fixopen', () => {
      document.getElementById('fix').innerHTML = `<div class="card"><b>Qu’est-ce qui ne va pas ?</b>
        <textarea id="fixtext" rows="4" placeholder="Ex. : sur 1SA – 2♥, je dis 3♦ et non 2♠ parce que…" style="width:100%;margin-top:8px;font-size:16px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink)"></textarea>
        <button class="btn primary center" data-act="fixsend" style="margin-top:8px">Envoyer pour analyse</button><p class="muted" id="fixmsg" style="font-size:13px;margin:4px 0 0"></p></div>`;
      document.getElementById('fixtext').focus();
      on('fixsend', () => sendFix(ctx));
    });
  }
  async function sendFix(ctx) {
    const texte = document.getElementById('fixtext').value.trim();
    const msg = document.getElementById('fixmsg');
    if (!texte) { msg.textContent = 'Écris quelques mots d’explication.'; return; }
    msg.textContent = 'Envoi…';
    const { sent, ...base } = ctx;
    const data = { ...base, texte, auteur: getPlayer(), date: Date.now(), statut: 'nouveau' };
    try {
      await postCorrection(data);
      try { localStorage.setItem(sentKey(ctx), String(Date.now())); } catch (e) { /* stockage indisponible */ }
      document.getElementById('fix').innerHTML = `<button class="btn center" disabled>✓ ${ctx.sent || 'Remarque envoyée'}</button><p class="center muted" style="font-size:13px;margin:6px 0 0">Merci ! Damien demandera à Claude de regarder les corrections.</p>`;
    } catch (e) { msg.textContent = 'Envoi impossible pour l’instant (' + e.message + '). Réessaie plus tard.'; }
  }

  // Nombre de donnes qui attendent le joueur (pour l'accueil)
  async function waitingCount() {
    try { await loadAll(); } catch (e) { return 0; }
    return parties.reduce((t, p) => t + p.donnes.filter(g => statusOf(p, g) === 'moi' || unread(g)).length, 0);
  }

  async function waitingDetail() {
    const out = { total: 0, byPartner: {} };
    try { await loadAll(); } catch (e) { return out; }
    for (const p of parties) {
      const bids = p.donnes.filter(g => statusOf(p, g) === 'moi').length, msgs = p.donnes.filter(unread).length;
      if (!bids && !msgs) continue;
      const x = out.byPartner[otherName(p)] || (out.byPartner[otherName(p)] = { bids: 0, msgs: 0 });
      x.bids += bids; x.msgs += msgs; out.total += bids + msgs;
    }
    return out;
  }

  return { list, waitingCount, waitingDetail, wireFix, fixButtonHtml, _finished: finished, _auto: autoOpponents };
}
