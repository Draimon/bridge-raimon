// Système Raimon — « Quoi de neuf » : chaque nouveauté apparaît une fois, dans une fenêtre, à la connexion suivante.
// RÈGLE : à chaque nouveauté publiée, ajouter une entrée EN HAUT de la liste (id unique, jamais réutilisé).
// pour : 'tous' (famille et invités), 'famille' (Michèle, Damien, Hélène) ou 'invites'.
const NEWS = [
  {
    id: '2026-11-16-declarant-simulation', date: '16/11/2026', pour: 'tous',
    titre: '🎯 Le robot déclarant joue (beaucoup) mieux',
    texte: `<p>Quand un robot joue le contrat, il imagine maintenant à chaque carte les mains possibles des deux défenseurs et calcule chacune avec le solveur DDS, comme en défense.</p>
      <p>Face à une défense parfaite, il perd <b>4 fois moins de levées</b> qu’avant (0,27 levée par donne au lieu de 1,20). Moins de contrats chutés bêtement quand votre partenaire robot joue !</p>`,
  },
  {
    id: '2026-11-16-flanc-simulation', date: '16/11/2026', pour: 'tous',
    titre: '🧠 Les robots imaginent les mains cachées',
    texte: `<p>En défense, à chaque carte, les robots imaginent maintenant une vingtaine de répartitions possibles des cartes cachées et calculent chacune avec le solveur de référence des champions (DDS), puis jouent la carte qui marche le plus souvent, comme les meilleurs robots.</p>
      <p>Résultat sur les donnes FFB : <b>encore 25 % de levées perdues en moins</b> en flanc. Le robot peut réfléchir une demi-seconde de plus par carte.</p>`,
  },
  {
    id: '2026-11-15-paysage', date: '15/11/2026', pour: 'tous',
    titre: '📱 Mode paysage, comme sur BBO',
    texte: `<p>Tournez le téléphone pendant une donne : <b>à gauche</b> le chat du salon (ou l’historique des enchères), <b>au centre</b> le tapis et votre main, <b>à droite</b> la boîte d’enchères, puis le mort et les boutons Revendiquer / Annuler pendant le jeu.</p>`,
  },
  {
    id: '2026-11-15-flanc-robots', date: '15/11/2026', pour: 'tous',
    titre: '🛡️ Les robots défendent mieux',
    texte: `<p>Les robots ont été entraînés sur la défense : 1000 donnes FFB jouées face à un déclarant parfait, chaque carte de flanc comparée à la meilleure possible.</p>
      <p>Ils perdent maintenant <b>15 % de levées en moins</b> en défense : entame dans leur couleur annoncée et jamais sous un As à l’atout, <b>3e main forte</b> sans surprendre l’honneur du partenaire, et ils évitent de rejouer dans la couleur longue du mort.</p>`,
  },
  {
    id: '2026-11-15-annuler', date: '15/11/2026', pour: 'tous',
    titre: '↩️ Annuler sa dernière enchère ou sa dernière carte',
    texte: `<p>À la table, le bouton <b>↩️ Annuler</b> (en bas à gauche) reprend ta dernière enchère ou ta dernière carte, et ce qui a été joué après.</p>
      <p>Contre des robots, c’est immédiat. Si un <b>adversaire humain</b> est assis, il reçoit la demande et doit l’accepter (ou la refuser). Pendant la demande, le jeu est en pause.</p>
      <p>En fin de donne, ton <b>score en %</b> s’affiche maintenant en grand, en vert ou en rouge.</p>`,
  },
  {
    id: '2026-11-15-systeme-salon', date: '15/11/2026', pour: 'famille',
    titre: '📖 Le Système Raimon à portée de main au salon',
    texte: `<p>À la table du salon, le bouton <b>📖 Système</b> (en bas à droite) ouvre la fiche du Système Raimon par-dessus la partie, comme en mode solo : chapitres, recherche et fiche originale en PDF.</p>
      <p>« ✕ Fermer » et vous retrouvez la table telle quelle. Réservé à la famille : les invités ne le voient pas.</p>`,
  },
  {
    id: '2026-11-15-ecran-allume', date: '15/11/2026', pour: 'tous',
    titre: '🔆 L’écran ne s’éteint plus pendant la partie',
    texte: `<p>À la table et au salon, l'écran reste allumé même si vous réfléchissez longtemps sans toucher. Il se remet en veille normalement dès que vous quittez le salon.</p>
      <p>Le haut de l'écran est aussi en vert uni (fini le dégradé flou). Si ce n'est pas le cas sur iPhone, supprimez l'icône de l'écran d'accueil et rajoutez-la depuis Safari.</p>`,
  },
  {
    id: '2026-11-15-tableau-scores', date: '15/11/2026', pour: 'tous',
    titre: '📊 Le tableau des scores, comme sur BBO',
    texte: `<p>Touchez le <b>score en haut à droite</b> (ou « Scores » sous les enchères pendant le jeu) : une ligne par donne jouée à la table, avec le contrat, les points et votre %.</p>
      <p>Touchez une donne pour voir <b>tous les résultats des autres tables</b> : « +420 · 18 tables · 72 % »… (votre résultat en vert), et ceux des joueurs du salon qui l'ont jouée.</p>`,
  },
  {
    id: '2026-11-15-plein-ecran', date: '15/11/2026', pour: 'tous',
    titre: '📱 La table en plein écran',
    texte: `<ul><li>Pendant une donne, la table <b>tient dans l'écran</b> et s'adapte à sa hauteur : plus besoin de faire défiler.</li>
      <li>La <b>couleur d'atout est toujours à gauche</b>, dans votre main comme chez le mort.</li>
      <li>Un pli terminé reste plus longtemps sur le tapis avant que les robots rejouent.</li>
      <li>En défense, le mort est affiché <b>à sa vraie place</b> (à gauche ou à droite).</li>
      <li>Le contrat est en grand en haut à droite : touchez-le pour revoir les enchères.</li></ul>`,
  },
  {
    id: '2026-11-15-revendiquer', date: '15/11/2026', pour: 'tous',
    titre: '🏳️ Revendiquer / 🤝 Céder · le pli reste sur la table',
    texte: `<ul><li>Un pli terminé <b>reste sur le tapis</b> : touchez le centre pour le ranger (ou jouez la carte suivante).</li>
      <li>Au jeu de la carte, le camp du déclarant peut <b>revendiquer</b> et la défense <b>céder</b> : vous choisissez le nombre de levées pour votre camp, vos cartes sont montrées aux adversaires.</li>
      <li>Un adversaire humain <b>accepte ou refuse</b>. Un robot vérifie : il accepte si vous ne pouvez pas faire moins, même contre la meilleure défense. Céder, ou ne réclamer que des levées maîtresses, est accepté tout de suite.</li></ul>`,
  },
  {
    id: '2026-11-15-maj-auto', date: '15/11/2026', pour: 'tous',
    titre: '🔄 Mises à jour automatiques au salon',
    texte: `<p>Quand une nouvelle version de l'appli est publiée pendant que vous jouez au salon, elle s'installe <b>toute seule entre deux donnes</b>, pendant l'affichage du résultat — jamais en pleine donne — et vous revenez directement à votre table.</p>`,
  },
  {
    id: '2026-11-15-reassort', date: '15/11/2026', pour: 'famille',
    titre: '♻️ Des donnes FFB à volonté',
    texte: `<p>Chaque lundi matin, l'appli vérifie combien de donnes du salon n'ont encore jamais été jouées. S'il en reste moins de 500, elle va en chercher <b>500 nouvelles</b> dans les simultanés FFB, toute seule.</p>`,
  },
  {
    id: '2026-11-15-carton-alerte', date: '15/11/2026', pour: 'tous',
    titre: '🟦 Le carton bleu ALERTE',
    texte: `<p>Comme dans une vraie boîte à enchères : quand vous choisissez votre enchère, touchez le carton bleu <b>ALERTE</b> et écrivez en quelques mots ce qu'elle veut dire (par ex. « Texas ♥ »), puis annoncez.</p>
      <p>Votre enchère porte alors un <b>« ! »</b> pour toute la table, et chacun peut la toucher pour lire votre explication — comme pour les robots.</p>`,
  },
  {
    id: '2026-11-15-joueur-absent', date: '15/11/2026', pour: 'tous',
    titre: '🤖 Un joueur ne répond plus ? Un robot prend sa place',
    texte: `<ul><li>Pendant une donne, si un joueur ne joue plus depuis 1 minute (ou a quitté l'appli), le <b>maître de table 👑</b> voit « X ne répond plus » et peut le <b>remplacer par un robot</b> : la donne continue.</li>
      <li>Entre deux donnes, le maître peut <b>sortir</b> n'importe quel joueur de la table.</li></ul>`,
  },
  {
    id: '2026-11-15-retour-table', date: '15/11/2026', pour: 'tous',
    titre: '↩️ On ne perd plus sa table',
    texte: `<p>Au salon, si vous passez sur une autre appli (un message, un appel…) ou si le téléphone recharge l'appli, <b>vous revenez directement à votre table</b>, sur la donne en cours.</p>
      <p>Si c'est vous qui avez créé la table, les robots attendent pendant votre absence et <b>reprennent dès votre retour</b>.</p>`,
  },
  {
    id: '2026-11-15-ecran-allume', date: '15/11/2026', pour: 'tous',
    titre: '🔆 L’écran reste allumé pendant le jeu',
    texte: `<p>Pendant une donne (jeu solo, salon), le téléphone ne se verrouille plus et l'ordinateur ne se met plus en veille. Dès que vous quittez le jeu, tout redevient normal.</p>
      <p class="muted">Sur iPhone, il faut iOS 16.4 ou plus récent. Le mode « Économie d'énergie » peut l'empêcher.</p>`,
  },
  {
    id: '2026-11-15-raimon-suite', date: '15/11/2026', pour: 'famille',
    titre: '🤖 Encore plus de Raimon',
    texte: `<p>Le robot Raimon du salon joue aussi les <b>enchères d'essai</b> (2SA généralisé, essai dans une couleur 5e, réponses par zones et 1er contrôle — exactement comme dans le mode solo), la <b>Paupiette Stayman</b>, le <b>Texas mineur</b> (3♥/3♠ = court, 3SA = court à ♦), le <b>Texas ♣ / ♦ et le bicolore majeur 4♦ sur 2SA</b>, le <b>Landic</b> et le <b>Puppet après Multi – 2SA</b>.</p>
      <p>La Paupiette et le Texas mineur avec une courte apparaissent aussi dans les donnes du mode solo et du tour par tour.</p>`,
  },
  {
    id: '2026-11-15-tu-joues-le-contrat', date: '15/11/2026', pour: 'tous',
    titre: '🔄 C’est toujours vous qui jouez le contrat',
    texte: `<p>Au salon, si votre partenaire est un robot et que c'est lui qui gagne le contrat, la table s'inverse : <b>vous jouez le coup</b>, sa main en bas, la vôtre devenant le mort en haut. Comme dans le jeu solo.</p>`,
  },
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
