// Crée (une seule fois) les comptes de la famille dans Firebase Authentication.
// Usage : RAIMON_CODE=<code> node tools/create-family.js   (le code n'est jamais écrit dans le dépôt)
const KEY = 'AIzaSyCQ9Uo2TuV-O6ZLwZ_2vIE1LX-WwcCwuf4';
const REF = { Referer: 'https://draimon.github.io/bridge-raimon/' };
const FAMILY = ['Michèle', 'Damien', 'Hélène'];
const slug = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const call = async (op, body) => (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...REF }, body: JSON.stringify(body) })).json();
(async () => {
  const code = process.env.RAIMON_CODE;
  if (!code) { console.log('Variable RAIMON_CODE manquante.'); process.exit(1); }
  for (const name of FAMILY) {
    const email = slug(name) + '@systeme-raimon.app';
    const r = await call('signUp', { email, password: 'raimon-' + code, returnSecureToken: true });
    if (r.error) { console.log(`${name} : ${r.error.message}`); continue; }
    const u = await call('update', { idToken: r.idToken, displayName: name, returnSecureToken: false });
    console.log(`${name} : compte créé (${email}, uid ${r.localId})${u.error ? ' — nom non enregistré : ' + u.error.message : ''}`);
  }
})();
