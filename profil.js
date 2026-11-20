// Système Raimon — 👤 Mon profil (salon) : avatar (photo ou émoji), pseudo, mot de passe, affichage, raccourci sur le bureau.
// Le profil (pseudo + avatar en petite image JPEG ~10 Ko) est rangé dans le document joues/{uid} de chacun
// (écrit par lui seul, lu par tous les joueurs connectés) : rien à payer ni à activer côté Firebase.
// L'affichage (taille, grosses cartes, 4 couleurs) est propre à chaque appareil (localStorage).
function createProfil(h) {
  'use strict';
  const { db, me, esc } = h;
  const EMOJIS = ['🦉', '🐻', '🦊', '🐱', '🐶', '🐸', '🐧', '🦁', '🐢', '🐝', '🌻', '🌹', '🍀', '⭐', '♠️', '♥️', '♦️', '♣️', '🎩', '👑', '🧙', '🚲', '⛵', '🍷'];

  // ── Profils des joueurs (cache), rechargés au plus toutes les 10 min
  const cache = {}, loading = new Set();
  let onChange = () => {};
  function ensure(uids) {
    const todo = [...new Set(uids)].filter(u => u && !loading.has(u) && (!cache[u] || Date.now() - cache[u].at > 600000));
    if (!todo.length) return;
    todo.forEach(u => loading.add(u));
    Promise.all(todo.map(u => db.collection('joues').doc(u).get().then(d => {
      const x = d.exists ? d.data() : {}, old = cache[u];
      cache[u] = { pseudo: x.pseudo || '', avatar: x.avatar || '', at: Date.now() };
      return !old || old.pseudo !== cache[u].pseudo || old.avatar !== cache[u].avatar;
    }).catch(() => false).finally(() => loading.delete(u)))).then(ch => { if (ch.some(Boolean)) onChange(); });
  }
  const prof = uid => cache[uid] || {};
  // Avatar : photo ronde, émoji, ou initiale sur une pastille de couleur
  function avatar(uid, nom, cls) {
    const p = prof(uid), a = p.avatar || '';
    if (a.startsWith('data:image/')) return `<span class="av ${cls || ''}"><img src="${a}" alt=""></span>`;
    if (a) return `<span class="av emo ${cls || ''}">${esc(a)}</span>`;
    const n = String(p.pseudo || nom || '?').trim(), hue = [...(uid || n)].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 7);
    return `<span class="av ini ${cls || ''}" style="background:hsl(${hue} 45% 42%)">${esc(n.charAt(0).toUpperCase() || '?')}</span>`;
  }
  const myName = () => (prof(me()).pseudo || h.getPlayer());
  async function saveProfile(fields) {
    await db.collection('joues').doc(me()).set({ ...fields, profilT: Date.now() }, { merge: true });
    cache[me()] = { ...prof(me()), ...fields, at: Date.now() };
    onChange();
  }

  // ── Affichage (par appareil)
  const SKEY = 'raimon-affichage';
  function settings() { try { return { scale: 1, big: false, c4: false, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (e) { return { scale: 1, big: false, c4: false }; } }
  function applySettings() {
    const s = settings(), b = document.body;
    b.classList.toggle('bigc', !!s.big); b.classList.toggle('c4', !!s.c4);
    b.dataset.uiscale = String(s.scale || 1);
    if (h.refit) h.refit();
  }
  function setSetting(k, v) { const s = settings(); s[k] = v; try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ } applySettings(); }

  // ── Raccourci sur le bureau / l'écran d'accueil
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  function installHelp() {
    if (installed()) return { done: true, html: '<p>✅ Tu utilises déjà l’application installée.</p>' };
    if (window.__bip) return { prompt: true, html: '<p>Ton navigateur sait créer l’icône ♠♥♦♣ tout seul.</p>' };
    if (isIOS) return { html: `<ol class="tuto"><li>Ouvre cette page dans <b>Safari</b>.</li><li>Touche <b>Partager</b> <span class="shareico">⬆︎</span> (en bas, ou dans les <b>⋯</b>).</li><li>Choisis <b>« Sur l’écran d’accueil »</b> (parfois dans « Plus »).</li><li>Touche <b>« Ajouter »</b> : l’icône apparaît avec tes applis.</li></ol>` };
    if (/Android/i.test(ua)) return { html: `<ol class="tuto"><li>Touche le menu <b>⋮</b> du navigateur (en haut à droite).</li><li>Choisis <b>« Installer l’application »</b> ou <b>« Ajouter à l’écran d’accueil »</b>.</li><li>Confirme : l’icône apparaît avec tes applis.</li></ol>` };
    if (/Firefox\//.test(ua)) return { html: `<p>Firefox ne sait pas installer d’application. Deux solutions :</p><ol class="tuto"><li>Ouvre cette page dans <b>Chrome</b> ou <b>Edge</b>, puis reviens ici : le bouton installera l’icône.</li><li>Ou fais glisser le petit <b>cadenas 🔒</b> à gauche de l’adresse jusque sur ton bureau : ça crée un raccourci.</li></ol>` };
    if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\//.test(ua)) return { html: `<ol class="tuto"><li>Dans le menu <b>Fichier</b> de Safari, choisis <b>« Ajouter au Dock… »</b>.</li><li>Clique <b>« Ajouter »</b> : l’icône ♠♥♦♣ apparaît dans le Dock.</li></ol>` };
    return { html: `<ol class="tuto"><li>Dans la barre d’adresse, clique l’icône <b>« Installer »</b> (un petit écran avec une flèche ⤓), ou le menu <b>⋮</b> puis <b>« Caster, enregistrer et partager » → « Installer la page en tant qu’application »</b>.</li><li>Confirme : l’icône ♠♥♦♣ apparaît sur le bureau et dans le menu Démarrer.</li></ol>` };
  }

  // ── Recadrage d'une photo en carré 128×128 (JPEG)
  function photoToAvatar(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'), S = 128; c.width = c.height = S;
        const k = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - k) / 2, sy = (img.naturalHeight - k) / 2;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.drawImage(img, sx, sy, k, k, 0, 0, S, S);
        URL.revokeObjectURL(url);
        let q = 0.82, out = c.toDataURL('image/jpeg', q);
        while (out.length > 24000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image illisible')); };
      img.src = url;
    });
  }

  // ── Le menu (fenêtre par-dessus l'écran en cours : la table continue dessous)
  let pane = null;
  function close() { if (pane) { pane.remove(); pane = null; document.body.style.overflow = ''; } }
  function open(section) {
    if (!pane) { pane = document.createElement('div'); pane.id = 'profil'; pane.className = 'sheet'; document.body.appendChild(pane); document.body.style.overflow = 'hidden'; }
    const p = prof(me()), s = settings(), inst = installHelp(), guest = h.isGuest();
    pane.innerHTML = `<div class="inner"><header class="top"><h1>👤 Mon profil</h1><button class="tobtn" data-pclose>✕ Fermer</button></header>
      <div class="card pcard0"><div class="pme">${avatar(me(), myName(), 'xl')}<div><b style="font-size:20px">${esc(myName())}</b><br><small class="muted">Connexion : ${esc(h.getPlayer())}${guest ? ' (invité)' : ''}</small></div></div></div>

      <div class="card"><h3>🖼️ Mon avatar</h3>
        <label class="btn primary center" style="display:block;text-align:center;cursor:pointer">📷 Choisir une photo<input type="file" accept="image/*" data-photo hidden></label>
        <p class="muted" style="font-size:13px;margin:6px 0">ou un émoji :</p>
        <div class="emogrid">${EMOJIS.map(e => `<button class="emo ${p.avatar === e ? 'on' : ''}" data-emo="${e}">${e}</button>`).join('')}</div>
        ${p.avatar ? '<button class="link" data-noav>Retirer mon avatar</button>' : ''}<p class="pmsg" data-m="av"></p></div>

      <div class="card"><h3>✏️ Mon pseudo</h3>
        <p class="muted" style="font-size:13px;margin:0 0 6px">Le nom affiché au salon, à la table et dans le chat. Pour te connecter, tu gardes ton prénom habituel.</p>
        <div class="prow"><input data-pseudo maxlength="20" value="${esc(p.pseudo || '')}" placeholder="${esc(h.getPlayer())}"><button class="btn primary" data-savepseudo>OK</button></div><p class="pmsg" data-m="ps"></p></div>

      <div class="card"><h3>🔑 Mon mot de passe</h3>
        <div class="pcol"><input type="password" data-old placeholder="Code actuel" autocomplete="current-password"><input type="password" data-new1 placeholder="Nouveau code (4 caractères au moins)" autocomplete="new-password"><input type="password" data-new2 placeholder="Nouveau code, encore une fois" autocomplete="new-password"><button class="btn primary center" data-savepwd>Changer mon code</button></div><p class="pmsg" data-m="pw"></p></div>

      <div class="card" id="paff"><h3>🔎 Affichage <small class="muted">(sur cet appareil)</small></h3>
        <label class="pset"><span>Taille de la table <b data-scalev>${Math.round((s.scale || 1) * 100)} %</b></span><input type="range" min="1" max="2" step="0.1" value="${s.scale || 1}" data-scale></label>
        <p class="muted" style="font-size:12px;margin:0 0 8px">Agrandit les cartes, la boîte d’enchères et les noms. La main reste toujours visible : si l’écran est trop petit, la table s’arrête à la taille qui tient.</p>
        <label class="pset chk"><input type="checkbox" data-big ${s.big ? 'checked' : ''}><span><b>Grosses cartes</b> : chiffres et couleurs des cartes et des enchères en très gros</span></label>
        <label class="pset chk"><input type="checkbox" data-c4 ${s.c4 ? 'checked' : ''}><span><b>4 couleurs</b> : ♦ orange et ♣ vert, pour ne plus les confondre avec ♥ et ♠</span></label>
        <div class="pdemo">${['♠', '♥', '♦', '♣'].map((x, i) => (typeof cardHtml === 'function' ? cardHtml(i, ['A', 'R', 'D', 'V'][i], 'md') : '')).join('')}</div></div>

      <div class="card"><h3>📲 Icône sur le bureau</h3>${inst.html}
        ${inst.prompt ? '<button class="btn primary center" data-install>⤓ Créer l’icône ♠♥♦♣</button>' : ''}<p class="pmsg" data-m="in"></p></div>
      </div>`;
    const $ = sel => pane.querySelector(sel), msg = (k, t, ok) => { const m = pane.querySelector(`[data-m="${k}"]`); if (m) { m.textContent = t; m.className = 'pmsg ' + (ok ? 'ok' : 'ko'); } };
    pane.querySelector('[data-pclose]').addEventListener('click', close);
    $('[data-photo]').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      msg('av', 'Préparation de la photo…', true);
      try { await saveProfile({ avatar: await photoToAvatar(f) }); open(); msg('av', '✅ Photo enregistrée.', true); } catch (err) { msg('av', 'Photo impossible à lire (' + err.message + ').'); }
    });
    pane.querySelectorAll('[data-emo]').forEach(b => b.addEventListener('click', async () => { try { await saveProfile({ avatar: b.dataset.emo }); open(); } catch (e) { msg('av', 'Enregistrement impossible.'); } }));
    const noav = $('[data-noav]'); if (noav) noav.addEventListener('click', async () => { await saveProfile({ avatar: '' }).catch(() => {}); open(); });
    $('[data-savepseudo]').addEventListener('click', async () => {
      const v = $('[data-pseudo]').value.replace(/\s+/g, ' ').trim().slice(0, 20);
      if (v && h.reserved(v) && !h.isFamilyName(h.getPlayer())) return msg('ps', 'Ce pseudo est réservé à la famille.');
      try { await saveProfile({ pseudo: v }); if (h.onRename) h.onRename(); open(); msg('ps', v ? '✅ Pseudo enregistré.' : '✅ Tu reprends ton prénom.', true); } catch (e) { msg('ps', 'Enregistrement impossible.'); }
    });
    $('[data-savepwd]').addEventListener('click', async () => {
      const o = $('[data-old]').value, n1 = $('[data-new1]').value, n2 = $('[data-new2]').value;
      if (n1.length < 4) return msg('pw', 'Le nouveau code doit faire 4 caractères au moins.');
      if (n1 !== n2) return msg('pw', 'Les deux nouveaux codes sont différents.');
      if (guest && n1 === '0000') return msg('pw', 'Choisis un autre code que 0000.');
      msg('pw', 'Changement en cours…', true);
      try { await h.changePassword(o, n1); ['[data-old]', '[data-new1]', '[data-new2]'].forEach(x => { $(x).value = ''; }); msg('pw', '✅ Code changé. Utilise-le à ta prochaine connexion.', true); } catch (e) { msg('pw', h.errorText(e)); }
    });
    $('[data-scale]').addEventListener('input', e => { $('[data-scalev]').textContent = Math.round(e.target.value * 100) + ' %'; });
    $('[data-scale]').addEventListener('change', e => setSetting('scale', +e.target.value));
    $('[data-big]').addEventListener('change', e => setSetting('big', e.target.checked));
    $('[data-c4]').addEventListener('change', e => setSetting('c4', e.target.checked));
    const ib = $('[data-install]'); if (ib) ib.addEventListener('click', async () => {
      const ev = window.__bip; if (!ev) return;
      ev.prompt(); let r = null; try { r = await ev.userChoice; } catch (e) { r = null; }
      window.__bip = null; open(); msg('in', r && r.outcome === 'accepted' ? '✅ L’icône est créée.' : 'Installation annulée.', !!(r && r.outcome === 'accepted'));
    });
    if (section) { const el = pane.querySelector('#' + section); if (el) el.scrollIntoView(); }
  }
  applySettings();
  return { ensure, avatar, myName, open, close, settings, applySettings, setOnChange: f => { onChange = f; }, prof };
}
