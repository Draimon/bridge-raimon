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
  const slug = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const isFamily = name => FAMILY.includes(name);
  const emailOf = name => (isFamily(name) ? '' : 'invite-') + slug(name) + '@systeme-raimon.app';
  const pwdOf = code => 'raimon-' + code;
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
      try { await auth.createUserWithEmailAndPassword(email, pwd); } catch (e2) { throw e2.code === 'auth/email-already-in-use' ? e : e2; }
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
  }[e && e.code] || 'Connexion impossible (' + ((e && (e.code || e.message)) || 'erreur') + ').');

  // fetch vers Firestore avec le jeton de connexion (renouvelé automatiquement quand il expire).
  async function authFetch(url, opts = {}) {
    const u = auth.currentUser;
    const headers = { ...(opts.headers || {}) };
    if (u) headers.Authorization = 'Bearer ' + await u.getIdToken();
    return fetch(url, { ...opts, headers });
  }

  return {
    ready, signIn, errorText, authFetch, isFamily, FAMILY,
    signOut: () => auth.signOut(),
    user: () => auth.currentUser,
    name: () => (auth.currentUser && auth.currentUser.displayName) || '',
  };
})();
