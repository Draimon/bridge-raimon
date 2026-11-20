// Système Raimon — connexion (Firebase Authentication, e-mail + mot de passe).
// On ne tape qu'un prénom et un code à 4 chiffres : l'adresse et le mot de passe Firebase en sont tirés
// (Firebase exige 6 caractères au moins). Une fois connecté, le téléphone le reste (jeton renouvelé tout seul).
// Famille (Michèle, Damien, Hélène) : comptes réservés, code de la famille.
// Invités (étape « Jouer au bridge ») : compte créé à la première connexion avec leur prénom.

const AUTH = (() => {
  'use strict';
  const FAMILY = ['Michèle', 'Damien', 'Hélène'];
  const fb = firebase.initializeApp({
    apiKey: FIRESTORE.key,
    authDomain: 'systeme-raimon.firebaseapp.com',
    projectId: 'systeme-raimon',
  });
  const auth = fb.auth();
  // ?test=1 : session propre à l'onglet (pour tester une table à 4 dans un seul navigateur)
  if (/[?&]test=1\b/.test(location.search)) auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});
  const slug = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const isFamily = name => FAMILY.includes(name);
  const emailOf = name => (isFamily(name) ? '' : 'invite-') + slug(name) + '@systeme-raimon.app';
  const pwdOf = code => 'raimon-' + code;
  const FIRST_CODE = '0000';                                             // code de première connexion des invités
  // Prénom d'invité : pas celui d'un membre de la famille (même sans accent ni majuscule)
  const reserved = name => FAMILY.some(f => slug(f) === slug(name));
  // Changement de code : on revérifie l'ancien d'abord (Firebase l'exige si la connexion date un peu)
  async function changePassword(oldCode, newCode) {
    const u = auth.currentUser; if (!u) throw Object.assign(new Error('non connecté'), { code: 'auth/requires-recent-login' });
    if (newCode === undefined) { newCode = oldCode; oldCode = null; }
    if (oldCode !== null) await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, pwdOf(oldCode)));
    await u.updatePassword(pwdOf(newCode));
  }
  // Premier état connu (connecté ou non) : l'appli attend cette réponse avant de s'afficher.
  const ready = new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });

  async function signIn(name, code) {
    const email = emailOf(name), pwd = pwdOf(code);
    try {
      await auth.signInWithEmailAndPassword(email, pwd);
    } catch (e) {
      // Invité qui vient pour la première fois : on crée son compte. La famille, elle, ne crée jamais de compte ici.
      const unknown = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(e.code);
      if (!unknown || isFamily(name)) throw e;
      if (code !== FIRST_CODE) throw e;                                  // un invité ne crée son compte qu'avec 0000
      try { await auth.createUserWithEmailAndPassword(email, pwd); } catch (e2) {
        if (e2.code === 'auth/email-already-in-use') { const t = new Error('prénom pris'); t.code = 'raimon/name-taken'; throw t; }
        throw e2;
      }
    }
    if (auth.currentUser.displayName !== name) await auth.currentUser.updateProfile({ displayName: name }).catch(() => {});
    return auth.currentUser;
  }
  const errorText = e => ({
    'auth/invalid-credential': 'Code incorrect.',
    'auth/invalid-login-credentials': 'Code incorrect.',
    'auth/wrong-password': 'Code incorrect.',
    'auth/user-not-found': 'Compte introuvable.',
    'auth/too-many-requests': 'Trop d’essais : réessaie dans quelques minutes.',
    'auth/network-request-failed': 'Pas de connexion internet.',
    'raimon/name-taken': 'Ce prénom est déjà pris (ou ton mot de passe est faux). Si ce n’est pas toi, ajoute l’initiale de ton nom, par exemple « Paul D ».',
    'auth/requires-recent-login': 'Reconnecte-toi puis recommence.',
    'auth/weak-password': 'Mot de passe trop faible.',
  }[e && e.code] || 'Connexion impossible (' + ((e && (e.code || e.message)) || 'erreur') + ').');

  // fetch vers Firestore avec le jeton de connexion (renouvelé automatiquement quand il expire).
  async function authFetch(url, opts = {}) {
    const u = auth.currentUser;
    const headers = { ...(opts.headers || {}) };
    if (u) headers.Authorization = 'Bearer ' + await u.getIdToken();
    return fetch(url, { ...opts, headers });
  }

  return {
    ready, signIn, errorText, authFetch, isFamily, FAMILY, FIRST_CODE, reserved, changePassword,
    signOut: () => auth.signOut(),
    user: () => auth.currentUser,
    name: () => (auth.currentUser && auth.currentUser.displayName) || '',
  };
})();
