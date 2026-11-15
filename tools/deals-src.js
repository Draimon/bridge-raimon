// Donnes à enchérir — SOURCE. Ne pas éditer deals.js à la main : `node tools/build-deals.js` le régénère.
// RÈGLE : le numéro "n" d'une donne ne change JAMAIS (on le cite pour signaler un souci).
//
// d : donneur ; N/S (et E/O si besoin) : mains ♠.♥.♦.♣ (T = 10, - = chicane). Les mains manquantes
//     sont distribuées au hasard (graine = n) avec des adversaires qui ont de quoi passer.
// a : la séquence attendue, dans l'ordre à partir du donneur : [enchère, explication, [autres enchères acceptées]]. P = passe.
// t : thème affiché après la donne.

module.exports = [
  { n: 1, t: 'Texas', d: 'N', N: 'AQ4.KJ5.K962.Q83', S: 'KJ8752.A4.Q73.94', a: [
    ['1SA', '15-17H régulier'], ['P'], ['2♥', 'Texas ♠ : 5 cartes ou plus à ♠'], ['P'],
    ['2♠', 'Acceptation simple (pas 17 points avec 4 cartes)'], ['P'],
    ['3♦', 'Changement de couleur après le Texas : forcing un tour, pour que le partenaire montre son fit (3♣ ou 3♥ conviennent aussi)', ['3♣', '3♥']], ['P'],
    ['3♠', 'Il montre le fit ♠'], ['P'], ['4♠', 'Tu recomptes ta main : 12 HLD face à 15-17, pas de chelem, tu conclus à 4♠'], ['P'], ['P'], ['P']] },

  { n: 2, t: 'Texas', d: 'N', N: 'AQ74.KJ5.A96.K83', S: 'KJ852.84.Q73.J94', a: [
    ['1SA', '15-17H régulier'], ['P'], ['2♥', 'Texas ♠'], ['P'],
    ['3♠', 'Super-acceptation : 17 points avec 4 cartes à ♠'], ['P'], ['4♠', 'Seulement 7H, mais fit de 9 cartes face à un maximum : la manche'], ['P'], ['P'], ['P']] },

  { n: 3, t: 'Stayman', d: 'N', N: 'KQ73.A85.KJ4.Q92', S: 'AJ64.K72.Q853.84', a: [
    ['1SA', '15-17H régulier'], ['P'], ['2♣', 'Stayman : tu cherches un fit 4-4 à ♠'], ['P'],
    ['2♠', '4 cartes à ♠'], ['P'], ['4♠', 'Fit 4-4 et 25H ensemble : la manche'], ['P'], ['P'], ['P']] },

  { n: 4, t: 'Stayman', d: 'N', N: 'KQ7.A853.KJ4.Q92', S: 'AJ64.K72.Q853.84', a: [
    ['1SA', '15-17H régulier'], ['P'], ['2♣', 'Stayman : tu cherches un fit 4-4 à ♠'], ['P'],
    ['2♥', '4 cartes à ♥'], ['P'], ['3SA', 'Pas de fit ♥ : 3SA (ton Stayman montrait les ♠)'], ['P'],
    ['P', 'Il n’a pas 4 cartes à ♠ : il passe'], ['P']] },

  { n: 5, t: '2♦ Multi', d: 'S', S: 'Q4.KQT953.762.83', N: 'K852.J4.AQ54.972', a: [
    ['2♦', 'Multi : ici un deux faible à ♥'], ['P'], ['2♥', 'Relais négatif : « passe si tu as les ♥ »'], ['P'],
    ['P', 'Tu as les ♥ : tu passes, on joue 2♥'], ['P']] },

  { n: 6, t: '2♦ Multi & Puppet', d: 'S', S: 'AK5.KQ4.AQ73.KJ2', N: 'Q8743.J852.94.Q3', a: [
    ['2♦', 'Multi : ici 22-23H régulier'], ['P'], ['2♥', 'Relais négatif'], ['P'],
    ['2SA', '22-23H régulier'], ['P'], ['3♣', 'Puppet'], ['P'],
    ['3SA', 'Ni majeure 4e, ni majeure 5e'], ['P'], ['P', 'Pas de fit majeur possible : on joue 3SA'], ['P']] },

  { n: 7, t: 'Oklahoma', d: 'N', N: 'K5.AQJ84.A732.Q4', S: 'A8742.K963.-.KJ52', a: [
    ['1♥', 'Ouverture, 5 cartes à ♥'], ['P'], ['4♣', 'Oklahoma : fit ♥, 2 cartes clés (A♠ + R♥) + une chicane'], ['P'],
    ['4♦', 'Relais chelem : où est ta chicane ?'], ['P'], ['5♦', 'Chicane à ♦'], ['P'],
    ['6♥', 'Il ne manque qu’une carte clé et l’As ♦ est inutile face à ta chicane : petit chelem'], ['P'], ['P'], ['P']] },

  { n: 8, t: 'Oklahoma', d: 'N', N: 'K85.AQ864.Q73.J4', S: 'QJ742.K973.-.KQ52', a: [
    ['1♥', 'Ouverture, 5 cartes à ♥'], ['P'], ['3♠', 'Oklahoma : fit ♥, 0 ou 1 carte clé (R♥) + une chicane'], ['P'],
    ['3SA', 'Relais : où est ta chicane ?'], ['P'], ['4♦', 'Chicane à ♦'], ['P'],
    ['4♥', 'Il manque 2 As : on s’arrête à la manche'], ['P'], ['P'], ['P']] },

  { n: 9, t: 'Landy', d: 'E', E: 'A95.K82.Q943.AK7', S: 'KQT63.AJ74.A2.95', N: 'J84.Q93.KJ75.Q83', a: [
    ['1SA', '15-17H (adversaire)'], ['2♣', 'Landy : 5/4 en majeures, 12H et plus'], ['P'],
    ['2♠', 'Préférence (3 cartes partout) : la plus chère'], ['P'], ['P', 'Ton partenaire est faible : tu passes'], ['P']] },

  { n: 10, t: 'Truscott', d: 'N', N: 'AQ863.K5.KJ4.Q72', E: '4.AJ93.AQ75.K864', S: 'KJ5.Q76.T98.AJ93', a: [
    ['1♠', 'Ouverture, 5 cartes à ♠'], ['X', 'Contre d’appel (adversaire)'], ['2SA', 'Truscott : fit ♠, 11-12H'], ['P'],
    ['4♠', '15H + 11-12H : la manche'], ['P'], ['P'], ['P']] },

  { n: 11, t: 'Lebelson', d: 'N', N: 'KQ5.AJ4.KT73.Q82', E: 'J3.KQT985.A5.J64', S: 'A87.73.QJ84.AK75', a: [
    ['1SA', '15-17H régulier'], ['2♥', 'Intervention (adversaire)'], ['2SA', 'Lebelson : passage par 2SA, l’ouvreur dira 3♣'], ['P'],
    ['3♣', 'Obligatoire sur 2SA'], ['P'], ['3SA', '2SA puis 3SA : conclusion, SANS arrêt ♥'], ['P'],
    ['P', 'Il a l’arrêt ♥ (A-V-x) : il passe'], ['P']] },

  { n: 12, t: 'Shadow fit', d: 'N', N: 'K4.AQ852.KJ3.Q72', S: 'Q73.KJ4.A852.J63', a: [
    ['1♥', 'Ouverture, 5 cartes à ♥'], ['P'], ['3♣', 'Shadow fit : fit ♥ par 3 cartes, zone 11-12 HLD'], ['P'],
    ['4♥', '15H face à 11-12 : la manche'], ['P'], ['P'], ['P']] },

  { n: 13, t: 'Copenhague', d: 'E', E: 'AKJ63.A72.Q84.Q4', S: '4.KQJ95.32.KJT85', N: 'Q972.T84.AJ65.A3', a: [
    ['1♠', 'Ouverture (adversaire)'], ['3♣', 'Copenhague : les extrêmes, ♣ + ♥'], ['P'],
    ['4♥', 'Il choisit les ♥ (3 cartes) et a de quoi jouer la manche'], ['P'], ['P'], ['P']] },

  { n: 14, t: '2♥ bicolore faible', d: 'S', S: 'KJT64.Q9853.7.54', N: 'A93.K4.KQJ62.Q83', a: [
    ['2♥', 'Fort, ou bicolore faible avec des ♥ : ici le bicolore'], ['P'], ['2♠', 'Relais'], ['P'],
    ['2SA', 'Bicolore faible ♥ + ♠'], ['P'], ['3♠', 'Au palier de 3 : faible, pour jouer (fit ♠)'], ['P'],
    ['P', 'Tu passes'], ['P']] },

  { n: 15, t: 'Texas mineur', d: 'N', N: 'AQ4.KJ5.K962.Q83', S: 'J5.T932.4.KJT765', a: [
    ['1SA', '15-17H régulier'], ['P'], ['2♠', 'Texas mineur'], ['P'],
    ['3♣', 'L’ouvreur dit 3♣'], ['P'], ['P', 'Main faible avec des ♣ : on joue 3♣'], ['P']] },

  { n: 16, t: 'Roudy', d: 'N', N: 'K54.Q6.AJ873.K92', S: 'AQ872.K73.Q4.J65', a: [
    ['1♦', 'Ouverture'], ['P'], ['1♠', '5 cartes à ♠'], ['P'],
    ['1SA', '12-14H régulier'], ['P'], ['2♣', 'Roudy'], ['P'],
    ['2♠', 'Minimum, avec fit ♠ (3 cartes)'], ['P'], ['4♠', 'Fit et 25H ensemble : la manche'], ['P'], ['P'], ['P']] },

  { n: 17, t: 'Puppet', d: 'N', N: 'AK4.KQ75.AJ8.KJ3', S: 'Q962.A843.T96.54', a: [
    ['2SA', '20-21H régulier'], ['P'], ['3♣', 'Puppet'], ['P'],
    ['3♦', 'Au moins une majeure 4e'], ['P'], ['4♣', 'Les 2 majeures, de manche (moins de 9H)'], ['P'],
    ['4♥', 'Il a 4 cartes à ♥'], ['P'], ['P'], ['P']] },

  { n: 18, t: 'Sur 2SA', d: 'N', N: 'AK4.KQ75.AJ8.KJ3', S: 'J8652.94.732.T96', a: [
    ['2SA', '20-21H régulier'], ['P'], ['3♥', 'Texas ♠, à partir de 0H'], ['P'],
    ['3♠', 'Il exécute le Texas'], ['P'], ['P', 'Main nulle : on joue 3♠'], ['P']] },

  { n: 19, t: 'Défense sur 2 faible', d: 'E', E: 'KJ9853.6.Q74.T64', S: 'AQ4.KJ4.KJ63.K92', N: 'T7.Q8732.A85.Q53', a: [
    ['2♠', 'Deux faible (adversaire)'], ['2SA', '15-18H régulier avec arrêt ♠'], ['P'],
    ['3♦', 'Texas ♥ (possible sur ton 2SA)'], ['P'], ['3♥', 'Tu exécutes le Texas'], ['P'],
    ['3SA', '5 cartes à ♥ : choix entre 3SA et 4♥'], ['P'], ['4♥', 'Avec 3 cartes à ♥, tu choisis 4♥'], ['P'], ['P'], ['P']] },

  { n: 20, t: 'Check-Back Stayman', d: 'N', N: 'K4.AJ6.KQ853.AQ2', S: 'AJ952.K843.74.J6', a: [
    ['1♦', 'Ouverture'], ['P'], ['1♠', '5 cartes à ♠ : tu annonces la plus longue'], ['P'],
    ['2SA', '18-19H régulier, sans fit ♠'], ['P'], ['3♣', 'Check-Back Stayman : 3 cartes à ♠ ? 4 cartes à ♥ ?'], ['P'],
    ['3SA', 'Rien : ni fit ♠, ni 4 cartes à ♥'], ['P'], ['P'], ['P']] },

  { n: 21, t: 'Copenhague', d: 'E', E: 'A43.KQJ63.75.K65', S: '7.92.KQJT4.AJ873', N: 'KQJ5.874.A63.Q42', a: [
    ['1♥', 'Ouverture (adversaire)'], ['2SA', 'Copenhague : les 2 moins chères, ♣ + ♦'], ['P'],
    ['4SA', '« Choisis » : il jouera ta meilleure mineure au palier de 5'], ['P'],
    ['5♦', 'Même longueur : tu choisis la plus chère, et ici la plus solide'], ['P'], ['P'], ['P']] },

  { n: 22, t: 'Défense sur 2 faible', d: 'E', E: 'J6.KQT986.Q73.72', S: 'KQ84.75.AJ6.KT93', N: 'A9752.J43.K84.Q5', a: [
    ['2♥', 'Deux faible (adversaire)'], ['X', 'Autre majeure 4e (♠), ouverture'], ['P'],
    ['4♠', '5 cartes à ♠ et 10H face à ton contre : la manche'], ['P'], ['P', 'Tu passes'], ['P']] },

  { n: 23, t: 'Réponse au contre', d: 'O', O: 'J5.J8.KQJT73.AQ4', N: 'AK64.AQ93.82.KJ3', S: 'Q873.KT5.A64.952', a: [
    ['1♦', 'Ouverture (adversaire)'], ['X', 'Contre d’appel'], ['P'],
    ['2♠', '8-10H avec 4 cartes à ♠ : palier 2'], ['P'], ['4♠', 'Il a 17H : la manche'], ['P'], ['P'], ['P']] },
];
