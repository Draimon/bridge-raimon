// Système Raimon — mode « Jouer avec… » : enchères à deux, au tour par tour, partagées via Firestore (REST).
// Une partie = 10 donnes ; celui qui la crée est Nord, son partenaire Sud. Les adversaires suivent le scénario
// de la donne tant que vos enchères suivent le système, et passent sinon.

const FIRESTORE = {
  base: 'https://firestore.googleapis.com/v1/projects/systeme-raimon/databases/(default)/documents/parties',
  key: 'AIzaSyCntK9XEN1dCGrboXDl9lUx1tU-fnXoVXM',
};

function createDuo(env) {
  'use strict';
  const { app, topbar, on, go, fmt, bidLabel, bidRank, getPlayer, players, home, SEAT_NAMES } = env;
  const SEATS = ['N', 'E', 'S', 'O'];
  const next = s => SEATS[(SEATS.indexOf(s) + 1) % 4];
  const partnerOf = s => SEATS[(SEATS.indexOf(s) + 2) % 4];
  const dealOf = n => DEALS.find(d => d.n === n);
  const seatAt = (deal, i) => SEATS[(SEATS.indexOf(deal.d) + i) % 4];
  let parties = [], current = null, busy = false;

  // ───── Firestore (REST) : chaque partie est un document { data: JSON }
  const enc = obj => ({ fields: { data: { stringValue: JSON.stringify(obj) } } });
  const dec = doc => ({ ...JSON.parse(doc.fields.data.stringValue), id: doc.name.split('/').pop(), updateTime: doc.updateTime });
  async function api(path, opts) {
    const r = await fetch(FIRESTORE.base + path + (path.includes('?') ? '&' : '?') + 'key=' + FIRESTORE.key, { ...opts, headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) { const t = await r.text(); const e = new Error(t); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }
  async function loadAll() {
    const r = await api('?pageSize=200');
    parties = (r.documents || []).map(dec).filter(p => p.nord === getPlayer() || p.sud === getPlayer()).sort((a, b) => b.created - a.created);
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

  // ───── Écran « À deux »
  async function list() {
    document.body.classList.remove('tablemode');
    app.innerHTML = topbar('Jouer à deux') + '<p class="center muted">Chargement…</p>';
    on('back', () => go(home));
    try { await loadAll(); } catch (e) { return showError(e); }
    const me = getPlayer();
    const rows = parties.map(p => {
      const st = p.donnes.map(g => statusOf(p, g));
      const mine = st.filter(s => s === 'moi').length, done = st.filter(s => s === 'fini').length;
      return `<button class="btn" data-party="${p.id}">Avec <b>${otherName(p)}</b> (toi ${seatOfPlayer(p) === 'N' ? 'Nord' : 'Sud'})
        <small>${done}/${p.donnes.length} terminées${mine ? ` · <b style="color:var(--accent)">${mine} à toi</b>` : ''} · ${new Date(p.created).toLocaleDateString('fr-FR')}</small></button>`;
    }).join('');
    app.innerHTML = topbar('Jouer à deux') + `
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
    app.innerHTML = topbar('Jouer à deux') + `<div class="feedback ko"><h3>Connexion à la base impossible</h3>${rules}<p class="muted" style="font-size:13px">${String(e.message).slice(0, 200)}</p></div>
      <button class="btn primary center" data-act="retry" style="margin-top:12px">Réessayer</button>`;
    on('back', () => go(home));
    on('retry', () => list());
  }

  async function create(partner) {
    if (busy) return; busy = true;
    // 10 donnes au hasard, en évitant celles déjà jouées ensemble
    const used = new Set(parties.filter(p => p.nord === partner || p.sud === partner).flatMap(p => p.donnes.map(g => g.n)));
    const pool = DEALS.filter(d => !used.has(d.n));
    const pick = (pool.length >= 10 ? pool : DEALS).slice().sort(() => Math.random() - 0.5).slice(0, 10);
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
      const lab = st === 'fini' ? '✓ Terminée : voir l’analyse' : st === 'moi' ? '<b style="color:var(--accent)">À toi d’enchérir</b>' : `Au tour de ${otherName(p)}`;
      return `<button class="btn" data-g="${i}" ${st === 'lui' ? 'disabled' : ''}>Donne n° ${g.n}<small>${lab}</small></button>`;
    }).join('');
    app.innerHTML = topbar('Avec ' + otherName(p), 'Parties') + rows + '<p class="center"><button class="link" data-act="refresh">↻ Actualiser</button></p>';
    on('back', () => go(list));
    on('refresh', () => openParty(p.id));
    app.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.g, g = p.donnes[i];
      if (statusOf(p, g) === 'fini') go(() => analysis(i)); else go(() => bidView(i));
    }));
  }

  // ───── Enchérir (table, toi en bas)
  function bidView(i, choice) {
    const p = current, g = p.donnes[i], deal = dealOf(g.n);
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
    const plate = s => `<div class="plate ${pos[s]} ${myTurn && s === me ? 'turn' : ''}"><span class="seat">${s}</span>${name(s)}${deal.d === s ? ' · donneur' : ''}</div>`;
    const stack = s => (stacks[s].length ? `<div class="bidstack ${POS[pos[s]]}">${stacks[s].join('')}</div>` : '');
    const hand = deal.h[me].split('.');
    app.innerHTML = topbar('Donne n° ' + deal.n, 'Donnes') + `
      <div class="frame bidframe">
        ${SEATS.map(plate).join('')}${SEATS.map(stack).join('')}
        <div class="bidcenter" id="fb">${myTurn ? gridHtml(g, deal, choice) : `<p class="feltnote">Au tour de ${otherName(p)}</p>`}</div>
        <div class="vulnote">${{ none: 'Personne vulnérable', NS: 'Vulnérables : N/S', EO: 'Vulnérables : E/O', all: 'Tous vulnérables' }[deal.v || 'none']}</div>
      </div>
      ${arcHtml([0, 1, 3, 2].flatMap(s => hand[s].replace('-', '').split('').filter(Boolean).map(ch => ({ s, label: ({ A: 'A', K: 'R', Q: 'D', J: 'V', T: '10' }[ch] || ch) }))))}`;
    on('back', () => go(partyView));
    app.querySelectorAll('[data-gb]').forEach(b => b.addEventListener('click', () => {
      if (choice === b.dataset.gb) return submit(i, choice);
      bidView(i, b.dataset.gb);
    }));
    on('announce', () => submit(i, choice));
    on('unpick', () => bidView(i));
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
    if (nextMine >= 0) return go(() => bidView(nextMine));
    go(partyView);
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
    app.innerHTML = topbar('Analyse · donne n° ' + deal.n, 'Donnes') + `
      <div class="card center"><div class="feedback ${perfect ? 'ok' : 'ko'}"><h3 style="margin:0">${perfect ? 'Séquence conforme au système !' : 'Votre séquence s’écarte du système'}</h3></div>
        <p style="margin:10px 0 0">Votre contrat : <b>${fmt(contract(g.calls))}</b><br>Contrat du système : <b>${fmt(contract(exp))}</b>${deal.best ? `<br>Meilleur contrat possible : <b>${fmt(deal.best.c)}</b> (${deal.best.t} levées en double mort)` : ''}</p></div>
      <div class="card"><b>Enchère par enchère</b><ol class="expl">${rows}</ol>
        ${diverged >= 0 ? `<p class="muted" style="font-size:14px">Suite prévue par le système : ${fmt(exp.slice(diverged).map(bidLabel).join(' – '))}</p>` : ''}</div>
      <div class="card"><b>Les 4 mains</b><div class="compass"><div class="cN">${mini('N')}</div><div class="cO">${mini('O')}</div><div class="cE">${mini('E')}</div><div class="cS">${mini('S')}</div></div></div>
      <div id="fix">${fixButtonHtml()}</div>`;
    on('back', () => go(partyView));
    wireFix({ type: 'donne à deux', donne: deal.n, partie: p.id, rapport: report });
  }

  // ───── « Pas d'accord ? Corriger » : la remarque part dans la base (collection corrections) pour analyse.
  const fixButtonHtml = () => '<button class="btn center" data-act="fixopen">Pas d’accord ? Corriger</button>';
  function wireFix(ctx) {
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
    const data = { ...ctx, texte, auteur: getPlayer(), date: Date.now(), statut: 'nouveau' };
    try {
      await fetch(FIRESTORE.base.replace('/parties', '/corrections') + '?key=' + FIRESTORE.key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(data) } } }) })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); });
      document.getElementById('fix').innerHTML = '<div class="feedback ok"><h3 style="margin:0">Envoyé, merci !</h3><p style="margin:6px 0 0">Damien demandera à Claude de regarder les corrections.</p></div>';
    } catch (e) { msg.textContent = 'Envoi impossible pour l’instant (' + e.message + '). Réessaie plus tard.'; }
  }

  // Nombre de donnes qui attendent le joueur (pour l'accueil)
  async function waitingCount() {
    try { await loadAll(); } catch (e) { return 0; }
    return parties.reduce((t, p) => t + p.donnes.filter(g => statusOf(p, g) === 'moi').length, 0);
  }

  return { list, waitingCount, wireFix, fixButtonHtml, _finished: finished, _auto: autoOpponents };
}
