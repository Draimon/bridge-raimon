// Système Raimon — « Quoi de neuf » : chaque nouveauté apparaît une fois, dans une fenêtre, à la connexion suivante.
// RÈGLE : à chaque nouveauté publiée, ajouter une entrée EN HAUT de la liste (id unique, jamais réutilisé).
// pour : 'tous' (famille et invités), 'famille' (Michèle, Damien, Hélène) ou 'invites'.
const NEWS = [
  {
    id: '2026-11-15-robot-raimon-complet', date: '15/11/2026', pour: 'famille',
    titre: '🤖 Le robot Raimon connaît toute la fiche',
    texte: `<p>Au salon, le robot Raimon joue maintenant aussi le <b>petit Stayman</b>, le <b>Puppet</b> (avec l'inversé sur 3♦), le <b>Lebelson</b>, le <b>Roudy</b>, le <b>Check-Back Stayman</b> et le <b>Truscott</b>, exactement comme sur la fiche.</p>
      <p>Et il applique vos dernières précisions : 2♥/2♠ fort = 6 cartes dans la majeure, bicolore faible avec un gros honneur dans chaque couleur, Copenhague de 8 à 16H.</p>
      <p>Le petit Stayman apparaît aussi dans les donnes du mode solo et du tour par tour.</p>`,
  },
  {
    id: '2026-11-15-table-comme-solo', date: '15/11/2026', pour: 'tous',
    titre: '🎴 La table du salon, comme le jeu solo',
    texte: `<ul><li><b>Enchères</b> : la boîte d'enchères est dans le tapis, vos enchères en cartons près de chaque joueur (STOP devant un saut), et on touche l'enchère au centre pour l'annoncer. Votre main reste visible.</li>
      <li><b>Jeu de la carte</b> : touchez une couleur, elle sort de la main, puis touchez la carte. Le mort est étalé en colonnes ; les mains cachées s'affichent en dos de cartes qui diminuent.</li>
      <li><b>Le mort voit le jeu de son partenaire</b> pour suivre le coup.</li>
      <li><b>👁 Pli précédent</b> : pour revoir le dernier pli, tant que la carte suivante n'est pas jouée.</li>
      <li>Les levées s'affichent « 6/10 » pour le camp du déclarant.</li>
      <li><b>Donne suivante automatique</b> après quelques secondes (le maître peut mettre en pause).</li>
      <li>Robots plus rapides, chat sur toute la hauteur de l'écran.</li></ul>`,
  },
  {
    id: '2026-11-15-grandes-cartes', date: '15/11/2026', pour: 'tous',
    titre: '🂡 Plus lisible à la table',
    texte: `<p>Au salon, votre main s'affiche en <b>grandes cartes en éventail</b>, et vos <b>points d'honneur</b> (par ex. « 12H ») apparaissent à côté de votre nom. En fin de donne et dans « Mes donnes », chaque main affiche aussi ses points.</p>`,
  },
  {
    id: '2026-11-15-corriger-inviter', date: '15/11/2026', pour: 'tous',
    titre: '🛠️ Corriger les robots · ✉️ Inviter à sa table',
    texte: `<ul><li>En fin de donne (et dans « Mes donnes »), le bouton <b>🛠️ Corriger le bot</b> : vous dites ce que le robot aurait dû faire, aux enchères ou au jeu de la carte. Damien relit chaque remarque, et les robots s'améliorent.</li>
      <li>Le <b>maître de table 👑</b> peut <b>inviter</b> un joueur présent au salon sur la place de son choix (« ✉️ Inviter… »), et <b>déplacer</b> les joueurs entre deux donnes (« ↔ Déplacer… »). L'invité reçoit une fenêtre pour accepter.</li></ul>`,
  },
  {
    id: '2026-11-15-robots', date: '15/11/2026', pour: 'tous',
    titre: '🤖 Les vrais robots sont arrivés !',
    texte: `<p>Plus besoin d'être 4 : on peut maintenant <b>jouer contre des robots</b>, et même avec un robot comme partenaire. Pour chaque place libre, le maître de table choisit :</p>
      <ul><li><b>« ＋ Robot Raimon »</b> : il enchérit dans notre <b>Système Raimon</b> (ouverture dès 11H, Albaran, Multi, Shadow fit, Oklahoma, Lefèvre, Copenhague…) ;</li>
      <li><b>« ＋ Robot SEF »</b> : il enchérit en <b>SEF standard</b>, comme en club.</li></ul>
      <p>Deux robots partenaires jouent toujours le même système. <b>Conseil :</b> prenez comme partenaire un robot qui joue votre système.</p>
      <ul><li>Une enchère conventionnelle porte un <b>« ! »</b> ; <b>touchez une enchère de robot</b> pour lire ce qu'elle veut dire.</li>
      <li>Ils jouent la carte correctement (entames, défense, impasses) et <b>ne regardent jamais vos cartes</b>.</li>
      <li>Avec des robots à la table, le % reste indicatif.</li></ul>
      <p>⚠️ C'est le téléphone du maître de table qui fait jouer les robots : il garde l'appli ouverte.</p>
      <p>💬 Une <b>pastille rouge</b> sur l'onglet Chat signale les messages non lus.</p>
      <p class="muted">Un robot fait une bêtise ? Notez le numéro de la donne (F0xxx) et prévenez Damien.</p>`,
  },
  {
    id: '2026-11-15-robots-famille', date: '15/11/2026', pour: 'famille',
    titre: 'Le robot Raimon',
    texte: `<p>Il connaît déjà l'essentiel de notre fiche, et notre défense sur 1SA (X = du ♣, Landy). Il lui manque encore : Puppet, petit Stayman, Lebelson, Roudy. Il va s'améliorer avec vos remarques !</p>`,
  },
  {
    id: '2026-11-15-salon', date: '15/11/2026', pour: 'famille',
    titre: '🃏 Le salon de bridge',
    texte: `<p>Nouveau bouton <b>Salon de bridge</b> sur l'accueil : c'est comme BBO, mais gratuit et rien qu'à nous.</p>
      <ul><li>On voit <b>qui est connecté</b> et les <b>tables</b> ; on en rejoint une ou on en crée une. Le premier arrivé est maître 👑 : il place les joueurs, ajoute des robots, distribue et peut remettre les scores à zéro.</li>
      <li>Enchères et jeu de la carte en direct, sur téléphone ou ordinateur.</li>
      <li>De <b>vraies donnes de simultanés FFB</b> : en fin de donne, votre <b>% face aux vraies paires</b>. Jamais deux fois la même donne.</li>
      <li>En bas : la table, <b>Mes donnes</b> (revoir chaque donne carte par carte) et le <b>chat</b> (vidé chaque lundi).</li>
      <li>Vous êtes <b>prioritaires</b> : même quand le salon est plein (16), vous entrez toujours.</li></ul>
      <p>Vous pouvez en parler à des amis bridgeurs de confiance : ils entrent avec « Je viens jouer au salon de bridge », leur prénom et le code 0000.</p>`,
  },
];

// Affiche les nouveautés pas encore vues par ce joueur sur ce téléphone (une seule fenêtre, tout d'un coup).
function showNews(player, isGuest, force) {
  const key = 'raimon-news-vu:' + player;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { seen = []; }
  const mine = NEWS.filter(n => n.pour === 'tous' || (n.pour === 'famille' && !isGuest) || (n.pour === 'invites' && isGuest));
  const fresh = force ? mine.slice(0, 3) : mine.filter(n => !seen.includes(n.id));
  if (!fresh.length || document.querySelector('.newsveil')) return false;
  const veil = document.createElement('div');
  veil.className = 'popveil newsveil';
  veil.innerHTML = `<div class="pop newspop"><div class="pop-ico">✨</div><h3>Quoi de neuf ?</h3>
    ${fresh.map(n => `<div class="newsitem"><h4>${n.titre} <small class="muted">${n.date}</small></h4>${n.texte}</div>`).join('')}
    <button class="btn primary center" data-news="ok">C'est noté !</button></div>`;
  document.body.appendChild(veil);
  const close = () => {
    try { localStorage.setItem(key, JSON.stringify([...new Set([...seen, ...mine.map(n => n.id)])])); } catch (e) { /* stockage indisponible */ }
    veil.remove();
  };
  veil.querySelector('[data-news]').addEventListener('click', close);
  return true;
}
