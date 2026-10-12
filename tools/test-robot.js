// Contrôle de masse du robot : sur N donnes au hasard, aucune erreur JS et aucune enchère insuffisante.
// Usage : node tools/test-robot.js [nombre]
const R = require('../robot.js');
const COUNT = +process.argv[2] || 300000;
let seed = 4711; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const RANKS = 'AKQJT98765432'; const deck = []; for (let i = 0; i < 4; i++) for (const r of RANKS) deck.push([i, r]);
const hs = c => [0, 1, 2, 3].map(i => c.filter(x => x[0] === i).map(x => x[1]).sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)).join('') || '-').join('.');
const rk = b => { const m = /^([1-7])(♣|♦|♥|♠|SA)$/.exec(b); return m ? (m[1] - 1) * 5 + ['♣', '♦', '♥', '♠', 'SA'].indexOf(m[2]) : -1; };
let opened = 0, ok = 0, errs = 0, illegal = 0; const themes = {};
for (let k = 0; k < COUNT; k++) {
  const d = deck.slice(); for (let i = 51; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const N = hs(d.slice(0, 13)), S = hs(d.slice(26, 39)); if (R.evalHand(N).hcp < 11) continue; opened++;
  let a; try { a = R.auction(N, S); } catch (e) { errs++; if (errs < 4) console.log('ERREUR', e.message, N, S); continue; }
  if (!a) continue; ok++; const t = R.theme(a); themes[t] = (themes[t] || 0) + 1;
  let last = -1; for (const [b] of a) { if (b === 'P') continue; const r = rk(b); if (r <= last) { illegal++; if (illegal < 4) console.log('ILLÉGAL', a.map(x => x[0]).join(' ')); break; } last = r; }
}
console.log(`Nord ouvre : ${opened} donnes ; robot : ${ok} (${Math.round(100 * ok / opened)} %) ; erreurs ${errs} ; séquences illégales ${illegal}`);
console.log(Object.entries(themes).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${c}`).join(' · '));
process.exit(errs || illegal ? 1 : 0);
