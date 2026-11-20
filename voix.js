// Système Raimon — 🎙️ vocal à la table du salon : les joueurs humains qui l'activent se parlent directement
// (WebRTC de navigateur à navigateur, sans serveur vocal). La mise en relation passe par le document de la table :
//   voix.<uid> = { on, mute, t }       qui est dans le vocal (t = moment où il l'a (ré)activé)
//   rtc.<uidA>_<uidB> = { sid, offer, answer }   l'offre vient toujours du plus petit uid, la réponse de l'autre
// Pas d'échange de candidats au fil de l'eau : on attend la fin de la collecte ICE, une écriture par sens suffit.
function createVoix(h) {
  'use strict';
  const { db, me } = h;
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
  let local = null, tableId = null, on = false, muted = false, enabledAt = 0;
  const peers = {};            // uid → { pc, sid, t0, audio, an, level, answered }
  let box = null, ac = null, meter = null, localAn = null;
  const audioBox = () => { if (!box) { box = document.createElement('div'); box.id = 'voixaudio'; box.style.display = 'none'; document.body.appendChild(box); } return box; };
  const ref = () => db.collection('tables').doc(tableId);
  const key = (a, b) => [a, b].sort().join('_');
  const rnd = () => Math.random().toString(36).slice(2, 10);

  function analyser(stream) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 512; src.connect(an);
      return an;
    } catch (e) { return null; }
  }
  const levelOf = an => { if (!an) return 0; const d = new Uint8Array(an.fftSize); an.getByteTimeDomainData(d); let m = 0; for (const x of d) m = Math.max(m, Math.abs(x - 128)); return m; };
  // pastille « parle » : toutes les 150 ms, classe talk sur les éléments [data-vu="uid"]
  function startMeter() {
    if (meter) return;
    meter = setInterval(() => {
      const lv = { [me()]: muted ? 0 : levelOf(localAn) };
      Object.entries(peers).forEach(([u, p]) => { lv[u] = levelOf(p.an); });
      document.querySelectorAll('[data-vu]').forEach(el => { const v = lv[el.dataset.vu]; el.classList.toggle('talk', v > 12); });
    }, 150);
  }
  function stopMeter() { clearInterval(meter); meter = null; document.querySelectorAll('[data-vu].talk').forEach(el => el.classList.remove('talk')); }

  // collecte ICE terminée (ou 3 s max) : la description contient alors tous les candidats
  const gathered = pc => new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => { pc.removeEventListener('icegatheringstatechange', chk); res(); };
    const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
    pc.addEventListener('icegatheringstatechange', chk); setTimeout(done, 3000);
  });
  function newPeer(uid, sid) {
    closePeer(uid);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = peers[uid] = { pc, sid, t0: Date.now(), audio: null, an: null, answered: false, failedAt: 0 };
    if (local) local.getTracks().forEach(tr => pc.addTrack(tr, local));
    pc.ontrack = e => {
      const st = e.streams[0] || new MediaStream([e.track]);
      if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; p.audio.setAttribute('playsinline', ''); audioBox().appendChild(p.audio); }
      p.audio.srcObject = st; p.audio.play().catch(() => { h.onState && h.onState(); });
      p.an = analyser(st);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { p.failedAt = Date.now(); h.onState && h.onState(); }
      if (pc.connectionState === 'connected') h.onState && h.onState();
    };
    return p;
  }
  function closePeer(uid) {
    const p = peers[uid]; if (!p) return;
    try { p.pc.close(); } catch (e) { /* déjà fermé */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    delete peers[uid];
  }

  async function makeOffer(uid) {
    const sid = rnd(), p = newPeer(uid, sid);
    try {
      await p.pc.setLocalDescription(await p.pc.createOffer());
      await gathered(p.pc);
      if (peers[uid] !== p) return;
      await ref().update({ ['rtc.' + key(me(), uid)]: { sid, offer: p.pc.localDescription.sdp, by: me(), t: Date.now() } });
    } catch (e) { closePeer(uid); }
  }
  async function makeAnswer(uid, e) {
    const p = newPeer(uid, e.sid);
    try {
      await p.pc.setRemoteDescription({ type: 'offer', sdp: e.offer });
      await p.pc.setLocalDescription(await p.pc.createAnswer());
      await gathered(p.pc);
      if (peers[uid] !== p) return;
      p.answered = true;
      await ref().update({ ['rtc.' + key(me(), uid) + '.answer']: p.pc.localDescription.sdp, ['rtc.' + key(me(), uid) + '.asid']: e.sid });
    } catch (err) { closePeer(uid); }
  }

  // À chaque nouvelle version de la table : qui doit parler avec qui ?
  function sync(t, id) {
    if (id !== tableId) { leave(true); tableId = id; }
    if (!on || !t) { Object.keys(peers).forEach(closePeer); return; }
    const seated = new Set(['N', 'E', 'S', 'O'].map(s => t.sieges && t.sieges[s] && t.sieges[s].uid).filter(Boolean));
    const vx = t.voix || {}, rtc = t.rtc || {};
    const want = Object.keys(vx).filter(u => u !== me() && vx[u] && vx[u].on && (seated.has(u) || !seated.size));
    Object.keys(peers).forEach(u => { if (!want.includes(u)) closePeer(u); });
    want.forEach(u => {
      const k = key(me(), u), e = rtc[k] || null, p = peers[u], vt = vx[u].t || 0;
      if (me() < u) {                                                         // c'est moi qui appelle
        const stale = !p || p.t0 < vt || p.t0 < enabledAt || (p.failedAt && Date.now() - p.failedAt > 4000);
        if (stale) { makeOffer(u); return; }
        if (e && e.sid === p.sid && e.answer && e.asid === p.sid && !p.pc.currentRemoteDescription) p.pc.setRemoteDescription({ type: 'answer', sdp: e.answer }).catch(() => {});
      } else if (e && e.offer && e.by === u && (e.t || 0) >= Math.min(vt, enabledAt) - 1000) {   // je réponds à son offre
        if (!p || p.sid !== e.sid) makeAnswer(u, e);
      }
    });
  }

  async function join(id) {
    tableId = id;
    try { local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'micro refusé' : 'micro indisponible'); }
    localAn = analyser(local);
    on = true; muted = false; enabledAt = Date.now();
    startMeter();
    await ref().update({ ['voix.' + me()]: { on: true, mute: false, t: enabledAt } });
  }
  function setMute(m) {
    muted = m; if (local) local.getAudioTracks().forEach(tr => { tr.enabled = !m; });
    if (tableId && on) ref().update({ ['voix.' + me() + '.mute']: m }).catch(() => {});
  }
  function leave(silent) {
    const id = tableId, was = on;
    on = false; Object.keys(peers).forEach(closePeer); stopMeter();
    if (local) { local.getTracks().forEach(tr => tr.stop()); local = null; }
    localAn = null;
    if (was && id && !silent) db.collection('tables').doc(id).update({ ['voix.' + me()]: { on: false, t: Date.now() } }).catch(() => {});
  }
  // relance du son après un refus de lecture automatique (iPhone) : au prochain toucher
  function unlock() { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); Object.values(peers).forEach(p => { if (p.audio && p.audio.paused) p.audio.play().catch(() => {}); }); }
  const state = () => ({ on, muted, peers: Object.fromEntries(Object.entries(peers).map(([u, p]) => [u, p.pc.connectionState])) });
  const supported = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  return { sync, join, leave, setMute, unlock, state, supported };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createVoix };
