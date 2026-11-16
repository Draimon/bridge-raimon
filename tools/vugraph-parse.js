// Lit les segments Vugraph (tools/vugraph/*.lin) → tools/vugraph-boards.json : une entrée par donne jouée
// (salle ouverte / fermée), avec mains, enchères (notation de l'appli) et cartes jouées.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'vugraph');
const SEATS = ['N', 'E', 'S', 'O'], LINSEAT = { 1: 'S', 2: 'O', 3: 'N', 4: 'E' }, ORDER_LIN = ['S', 'O', 'N', 'E'];
const SUITS = 'SHDC', RCH = 'AKQJT98765432';
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣', N: 'SA' };
function linHand(h) {                                               // "SAKQHT9D..C.." → "AKQ.T9.-.x"
  const out = { S: '', H: '', D: '', C: '' }; let cur = null;
  for (const ch of h.toUpperCase()) { if ('SHDC'.includes(ch)) cur = ch; else if (cur && RCH.includes(ch)) out[cur] += ch; }
  return SUITS.split('').map(s => out[s].split('').sort((a, b) => RCH.indexOf(a) - RCH.indexOf(b)).join('') || '-').join('.');
}
const count = h => h.replace(/[.-]/g, '').length;
function completeFourth(hands) {                                   // 4e main absente du LIN : on la reconstitue
  const missing = SEATS.filter(s => !hands[s] || count(hands[s]) !== 13);
  if (missing.length !== 1) return missing.length === 0;
  const used = SUITS.split('').map((_, i) => new Set(SEATS.filter(s => s !== missing[0]).flatMap(s => hands[s].split('.')[i].replace('-', '').split(''))));
  hands[missing[0]] = SUITS.split('').map((_, i) => RCH.split('').filter(c => !used[i].has(c)).join('') || '-').join('.');
  return count(hands[missing[0]]) === 13;
}
function bid(b) {
  b = b.toUpperCase().replace('!', '');
  if (b === 'P') return 'P'; if (b === 'D') return 'X'; if (b === 'R') return 'XX';
  const m = /^([1-7])([SHDCN])/.exec(b); return m ? m[1] + SYM[m[2]] : null;
}
const boards = [];
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.lin'))) {
  const txt = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r?\n/g, '');
  const ev = (/vg\|([^|]*)\|/.exec(txt) || [])[1] || '';
  for (const chunk of txt.split('qx|').slice(1)) {
    const tok = chunk.split('|'); const room = tok[0];
    let d = null, hands = {}, bids = [], plays = [], ok = true, claim = null;
    for (let i = 1; i < tok.length - 1; i += 2) {
      const k = tok[i], v = tok[i + 1];
      if (k === 'md') {
        d = LINSEAT[v[0]]; const hs = v.slice(1).split(',');
        hs.forEach((h, j) => { if (h && j < 4) hands[ORDER_LIN[j]] = linHand(h); });
      } else if (k === 'mb') { const b = bid(v); if (b) bids.push(b); else ok = false; }
      else if (k === 'pc') plays.push(v.toUpperCase().replace(/^([SHDC])10$/, '$1T'));
      else if (k === 'mc') claim = +v;
    }
    if (!d || !ok || !completeFourth(hands)) continue;
    boards.push({ src: f.replace('.lin', ''), ev, room, d, hands, bids, plays, claim });
  }
}
fs.writeFileSync(path.join(__dirname, 'vugraph-boards.json'), JSON.stringify(boards));
console.log(boards.length, 'donnes lues ·', boards.filter(b => b.plays.length).length, 'avec au moins une carte jouée');
