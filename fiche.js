// Système Raimon — la fiche (mars 2026), réécrite par thème pour la lecture sur téléphone.
// Les clés correspondent aux thèmes du quiz (THEMES dans questions.js).

const FICHE = {
  precisions: {
    titre: 'Bases & précisions',
    lignes: [
      'Base SEF, majeure 5e.',
      '1SA = 15-17H. Stayman à 3 réponses + petit Stayman.',
      '2SA d’ouverture = 20-21H (les 22-23H passent par le 2♦ Multi).',
      '2♣ Albaran = forcing de manche (l’équivalent du 2♦ FM du SEF).',
      '« Fort » sur 2♥/2♠ = l’équivalent du 2♣ fort indéterminé du SEF ; « fort + singleton » = singleton non précisé.',
      'Pas de Michaels : directement derrière l’ouvreur on joue Copenhague.',
      'Sur 1SA adverse (2e position) et sur Landy adverse : X = du ♣, jamais punitif.',
    ],
  },
  flanc: {
    lignes: [
      'Défausse pair/impair à tendance négative.',
      '<b>Entame à la couleur</b> : pair/impair.',
      'Sur As : pair = préférentielle / impair = italien.',
      'Sur Roi : pair/impair.',
      '<b>Entame SA</b> : petit sous un honneur.',
      'Sur As ou Dame : petit = appel.',
      'Sur Roi : pair/impair ou déblocage.',
      'Smith modifié à SA et à la couleur.',
    ],
  },
  contres: {
    lignes: [
      '<b>Réponses au contre d’appel</b>',
      'Palier 1 = 0-7H',
      'Palier 2 = 8-10H, 4 cartes',
      'Palier 3 = 8-10H, 5 cartes',
      '1SA = 8-10H avec arrêt',
      '2SA = 11-12H avec arrêt',
      'Cue-bid = 11H et +',
      '<b>Contre Spoutnik</b> = 8H+ toute distribution, ou 7H+ avec une majeure 5e',
      '<b>Contre de l’ouvreur</b> = semi-fit',
      '<b>Sur contre de réveil</b> : cue-bid = ouverture',
    ],
  },
  baba: {
    lignes: [
      'Si l’adversaire ouvre et que son partenaire répond au palier de 1 : le cue-bid de l’ouverture = bicolore des 2 autres couleurs (5/5).',
      'À l’ouverture avec 4♣/4♦ = 1♦. En majeure et en mineure, à égalité de longueur : la plus chère.',
      '<b>Copenhague</b> (bicolore du n°2, ou du n°4 après 1x – passe – 1SA) : 2SA = les 2 moins chères, 3♣ = les extrêmes, 3♦ = les 2 plus chères.',
      'Sur 2SA Copenhague, 4SA du partenaire = « choisis » (en général les mineures au palier de 5).',
    ],
  },
  multi: {
    lignes: [
      '<b>2♦ Multi</b> = 2♥/2♠ faible, 3♣/3♦ fort, 2SA = 22-23H, 3SA = bicolore ♣/♦ faible.',
      '<b>Relais sur 2♦</b> : 2♥ négatif ; 2♠ supporte 3♥ ; 2SA = 15H+ régulier ; 3♣/♦/♥/♠ = 15H+ 5 cartes.',
      '<b>Après 2♦ – 2SA</b> : 3SA = 22-23H (=> 4♣ Puppet) ; 4SA = bicolore ♣/♦ faible.',
      'Si intervention après 2♦ : X et XX remplacent 2SA.',
    ],
  },
  albaran: {
    lignes: [
      '<b>2♣ Albaran</b> (forcing de manche)',
      '2♦ = pas d’As, moins de 8 pts',
      '2♥ = As de ♥ ; 2♠ = As de ♠ ; 3♣ = As de ♣ ; 3♦ = As de ♦',
      '2SA = 8H+ ou 2 Rois',
      '3♥/3♠/3SA = 2 As, CRM',
      'Si intervention après 2♣ : X = 1 As non nommable',
    ],
  },
  deuxM: {
    lignes: [
      '<b>2♥/2♠ = fort ou bicolore faible</b> à l’ouverture.',
      'Quand c’est le bicolore : toute autre enchère au palier de 3 est faible, un saut au palier de 4 = envie de chelem.',
      '<b>2♥ => 2♠ relais</b> : 2SA = bic ♥/♠ ; 3♣ = bic ♥/♣ ; 3♦ = bic ♥/♦ ; 3♥ = fort + singleton ; 3♠ = fort et 3 cartes ♠ ; 3SA = fort ; 4♣/4♦/4♥(♠) = fort + chicane.',
      '<b>2♠ => 2SA relais</b> : 3♣ = bic ♠/♣ ; 3♦ = bic ♠/♦ ; 3♥ = fort et 3 cartes ♥ ; 3♠ = fort + singleton ; 3SA = fort ; 4♣/4♦/4♥ = fort + chicane.',
    ],
  },
  okla: {
    lignes: [
      'Le répondant (13-15 HLD, 11H) sur 1♥/1♠. Cartes clés = 4 As + Roi d’atout.',
      '3♥/3♠ (autre majeure) = 0/1 carte clé + 1 chicane',
      '4♣ = 2 cartes clés + 1 chicane',
      '4♦ = 2 cartes clés',
      '4♥/4♠ = 0/1 carte clé',
      '<b>Relais pour connaître la chicane</b> :',
      '1♠ – 3♥ – 3SA => 4♣/4♦/4♥ = chicane nommée',
      '1♥ – 3♠ – 3SA => 4♣/4♦ = chicane nommée, 4♥ = chicane ♠',
      '1♥/1♠ – 4♣ – 4♦ (chelem) => 4♥/4♠ et 5♣/5♦ = chicane',
      '=> 5SA = Blackwood aux Rois (on recompte le Roi d’atout)',
    ],
  },
  bw: {
    lignes: [
      '5♣/5♦ = 30/41 As (inversé si fit ♣)',
      '5♥/5♠ = 2 As, 30/41 Rois',
      '5SA = 2 As / 2 Rois ou 1 chicane',
      '6♣/6♦/6♥/6♠ = 1 As + chicane dans la couleur',
      '<b>Attention</b> : si 1 As + chicane plus chère que l’atout, nommer 6 au palier de l’atout.',
      'Collante = 3-0 / 4-1 / 2 R ou D (si R ok)',
      'Roulante = 0 / 1 / 2 H. d’atout',
      'Pour la collante et la roulante, on ne compte pas la couleur d’atout.',
    ],
  },
  landy: {
    lignes: [
      '<b>En 2e position</b> : X = du ♣ ; 2♣ = Landy (5/4, 12H+) ; 2♦/2♥/2♠ = naturel 6 cartes ; 2SA = bicolore mineur.',
      '<b>En 4e position</b> : X = Landy avec 12H et + ; 2♣ = Landy avec moins de 12H ; 2♦/2♥/2♠/3♣ = naturel 5 cartes ; 2SA = bicolore mineur.',
      '<b>Landic simple</b> : 1♦ – 1SA – 2♣ = les majeures, 8H et +.',
    ],
  },
  checkback: {
    lignes: [
      '1♦ – 1♠ – 2SA – 3♣ = Check-Back Stayman',
      '3♦ = fit ♠ + autre majeure 4e',
      '3♥ = 4 cartes',
      '3♠ = fit 3 cartes',
      '3SA = rien',
    ],
  },
  shadow: {
    lignes: [
      'Zone 11-12 HLD (face à une ouverture).',
      '1♥/1♠ – 3♣ = 3 cartes, 8H+',
      '1♥/1♠ – 3♦ = 4 cartes, 8H+',
      '1♥/1♠ – 3♥/3♠ = moins de 8H',
      'Si intervention : ok si le saut est possible.',
    ],
  },
  '1k2t': {
    lignes: [
      '<b>1♦ – 2♣</b>, réponses de l’ouvreur :',
      '2♦ = 12-15H, majeure 4e possible',
      '2♥/2♠ = bicolore cher',
      '2SA = 18-19H (Check-Back Stayman ok)',
      '3♣ = fitté 15H, 4♣',
      '3♦ = unicolore 17-19 HLD, 6♦',
      '3♥/3♠ = bicolore à saut, 20H et +',
      '3SA = régulier 14H, pas de majeure 4e',
    ],
  },
  '1sa': {
    lignes: [
      '3♦ = bicolore ♥/♠ faible (0-5H) ou de chelem (13H et +)',
      '3♥/3♠ = 5/4 mineur, court dans la couleur nommée',
      '4♣ = BW 30-41 + CRM (4♦/4♥ = 30/41 ; 4♠/4SA/5♣ = 2 As CRM)',
      '4♦ = bicolore majeur de manche',
      '4♥/4♠ = bicolore mineur, court dans la couleur nommée',
      '4SA = quantitatif 15/16H => passe = 15H / 5SA = 16H / 6SA = 17H',
    ],
  },
  texas: {
    lignes: [
      'Stayman à 3 réponses + petit Stayman.',
      '<b>Texas majeur obligatoire</b> : 1SA – 2♥ => 2SA = 17 pts 3 cartes ; 3♠ = 17 pts 4 cartes.',
      'Sur un Texas majeur, un changement de couleur est forcing un tour (permet à l’ouvreur de montrer le fit).',
      '<b>Texas mineur</b> (espoir de chelem, misère ou manche avec une courte) : 1SA – 2♠ – 3♣ :',
      'Passe = faible ; 4♣ = chelem 16 HLD et + ; 3♥/3♠ = singleton ou chicane, 8H+ ; 3SA = courte dans l’autre mineure.',
      '<b>Si le n°4 contre</b> : rectification = fit ; XX = arrêt ; passe = ni fit, ni arrêt.',
    ],
  },
  jose: {
    lignes: [
      'Fit ♥ -> 5♥ (As/R/D ?) -> passe = 0-1 / 5♠ = 2 / 5SA = 3',
      'Fit ♠ -> 5♠ (As/R/D ?) -> passe = 0-1 / 5SA = 2 / 6♣ = 3',
      'Tout fit -> 5♣/5♦/5♥/5♠ (chicane) = BW d’exclusion -> réponse en 3-0 / 4-1 / 2',
    ],
  },
  truscott: {
    lignes: [
      '<b>Après un contre d’appel adverse</b> :',
      'XX = 11H et + non fitté ; toute autre enchère = moins de 11H.',
      'Si fitté (pas 4 cartes dans l’autre majeure) :',
      'Sur 1♥/1♠ : 2SA = 11-12H fitté ; 3SA = 13-15H fitté',
      'Sur 1♣/1♦ : 2♣/2♦ = 12H+ ; 2SA = 8-9H ; 3SA = 10-11H',
      'Fit direct = barrage',
    ],
  },
  essai: {
    lignes: [
      'Majeure fittée au palier de 2 : 2SA/3♣/3♦/3♥/3♠ = enchère d’essai.',
      'Ouvreur HLD : 11-13 = 3♠/3♥ | 14 = 3♣/3♦/3♥ | 15-16 = 1er contrôle',
      'Répondant HLD : 6-8 = 3♠/3♥ | 9 = 3♣/3♦/3♥ | 10 = 1er contrôle',
      '<b>Précisions</b> : 2SA = essai généralisé ; 3 dans une autre couleur = 5 cartes dans la couleur nommée (essai avec une 2e couleur naturelle).',
      'Réponse du milieu (14 / 9 HLD) : 3♣/3♦/3♥ = une force dans la couleur nommée. Réponse maximum : on accepte la manche en nommant son 1er contrôle (As, Roi second, chicane ou singleton).',
      'Les zones « ouvreur » s'appliquent quand l'ouvreur a soutenu à 2 (11-16 HLD) et que le répondant essaie (dès 11 HLD, toujours par l'essai) ; les zones « répondant » quand le répondant a soutenu à 2 (6-10 HLD).',
      'Après 1M – 2M : 15-16 HLD → 3M proposition (le partenaire dit 4 avec 10 HLD) ; dès 17 HLD → essai.',
    ],
  },
  def2: {
    lignes: [
      'X = autre majeure 4e ou fort',
      'Cue-bid = demande d’arrêt pour 3SA',
      '2SA = 15-18H (régulier et arrêt), Stayman et Texas possibles',
      '3♣/3♦/3♥/3♠ = naturel, ouverture et +',
      '3SA = bicolore mineur (8-13H, on passera sur 4)',
      '4♣/4♦ = bicolore couleur nommée + autre majeure',
      '4♥/4♠ = bicolore mineur, court dans la couleur, 17H et +',
      '4SA = bicolore mineur de manche 14-16H',
    ],
  },
  lebel: {
    lignes: [
      '<b>Sur 1SA, l’adversaire nomme une couleur au palier de 2</b> :',
      'Cue-bid direct = Stayman avec arrêt',
      '2SA puis cue-bid = Stayman sans arrêt',
      '3SA direct = conclusion avec arrêt',
      '2SA puis 3SA = conclusion sans arrêt',
      '3♥/3♠ direct = 5 cartes avec arrêt',
      '<b>Sur 2SA, l’ouvreur dit toujours 3♣</b> : passe = misère à ♣ ; 3♦ = misère à ♦ ; 3♥/3♠ = 5 cartes sans arrêt.',
    ],
  },
  roudy: {
    lignes: [
      '1♦ – 1♠ – 1SA – 2♣ = Roudy',
      '2SA = transformation pour 3♣ (6 ou 7 ♣ / 4♠, moins de 6-7H)',
      '<b>Sur 2♣ Roudy</b> : 2♦ = mini pas fitté ; 2 même couleur = mini fitté ; 2 autre couleur = maxi fitté ; 2SA = maxi pas fitté.',
    ],
  },
  paupiette: {
    lignes: [
      '1♣ – 1♦ – 2SA – 3♣ = Paupiette Stayman',
      '3♦ = 2 majeures 4e => 3♥/3♠ = inversé ; 4♣ = 2 majeures de manche ; 4♦ = 2 majeures de chelem',
      '3♥/3♠ = 4 cartes',
      '3SA = rien',
    ],
  },
  puppet: {
    lignes: [
      'Sur 2SA, 2♣ -> 2SA et 2♦ -> 2SA : 3♣ = Puppet',
      '3♦ = 1 ou 2 majeures 4e ; 3♥ = 5♥ ; 3♠ = 5♠ ; 3SA = ni majeure 4e, ni majeure 5e',
      '<b>Si 3♦</b> (inversé) : 3♥ = 4♠ ; 3♠ = 4♥ ; 3SA = rien ; 4♣ = les 2 majeures de manche (moins de 9H) ; 4♦ = les 2 majeures de chelem (10H et +)',
    ],
  },
  onze: {
    lignes: [
      '1♣/1♦/1♥/1♠ => 2SA = 12H régulier ; 2 autre couleur puis 2SA = 11H régulier.',
      '1♥/1♠ => Shadow fit si 11/12 HLD, même avec 12H.',
    ],
  },
  '2sa': {
    lignes: [
      '2SA d’ouverture = 20-21H.',
      '3♣ = Puppet (4H et + ou pour 3SA)',
      '3♦ = Texas ♥ ; 3♥ = Texas ♠ (à partir de 0H)',
      '3SA = 5♠/4♥ (4H et +)',
      '3♠ = Texas ♣ ; 4♣ = Texas ♦ (à partir de 0H)',
      '4♦ = bicolore majeur ; 4♥/4♠ = bicolore mineur court dans la couleur (4H et +)',
    ],
  },
  '1819': {
    lignes: [
      '1♦ – 1♥/1♠ – 2SA = 18-19 sans fit',
      '1♦ – 1♥/1♠ – 3SA = 18-19 avec fit',
    ],
  },
  landyadv: {
    lignes: [
      '<b>1SA – (2♣ Landy)</b> :',
      'X = du ♣',
      '2♦ = naturel, 7H et moins',
      '2♥/2♠ = arrêt ♥/♠ (mini cue-bid pour jouer 3SA, 8H et +)',
      '2SA = bicolore mineur',
      '3♣/3♦/3♥/3♠ = naturel, 8H et +',
      '3SA = naturel',
    ],
  },
};
