// Tous les seuils et poids du moteur vivent ici, et nulle part ailleurs.
// Ce sont des valeurs de départ : elles se calibrent sur de vraies photos.

export const config = {
  grouping: {
    /** Écart de temps (secondes) au-delà duquel on ouvre un nouveau paquet. */
    packGapSeconds: 60,
    /** Bornes du curseur de réglage dans l'écran Paquets. */
    packGapMinSeconds: 10,
    packGapMaxSeconds: 900,
    /** Découpage selon le contenu (utilisateur, 19/11 : « ça dépend des sujets et des poses, pas du timing ») :
     *  une photo rejoint le paquet en cours si elle ressemble à l'une de ses dernières photos (empreinte fine). */
    byContent: {
      /** Ressemblance minimale. Mesurée sur 106 photos de l'utilisateur : même paquet, 3 paires sur 4 au-dessus
       *  de 0,59 ; paquets différents, 9 sur 10 sous 0,44. */
      similar: 0.55,
      /** Nombre de dernières photos du paquet comparées. */
      compareLast: 4,
      /** Rafale : photos à moins de N secondes toujours ensemble, même si le cadrage change beaucoup. */
      burstSeconds: 10,
      /** Même en rafale, deux photos sans rapport (ressemblance sous ce seuil) vont dans deux paquets. */
      burstMinSimilar: 0.4,
      /** Personne seule ↔ groupe : même paquet seulement si la scène est presque identique. */
      sameScene: 0.8,
      /** Taille minimale (part de l'image) d'une personne comptée pour « seule » ou « groupe » : pas les passants. */
      personMinArea: 0.03,
      /** Au-delà, deux photos ne sont jamais réunies, même ressemblantes (même paysage revu 1 h plus tard : réunis). */
      maxGapSeconds: 3 * 3600,
    },
  },
  image: {
    /** Plus grand côté (pixels) de l'image réduite utilisée pour l'analyse. */
    analysisMaxSide: 1536,
    /** Plus grand côté (pixels) des vignettes de la grille, et des images de la visionneuse. */
    thumbnailMaxSide: 320,
    thumbnailQuality: 0.72,
    previewMaxSide: 1080,
    previewQuality: 0.8,
  },
  sharpness: {
    /** L'image est découpée en grille de N x N cases, mesurées séparément. */
    gridSize: 8,
    /** On ne retient que les cases les plus nettes (ici le meilleur quart) :
     *  un arrière-plan volontairement flou ne doit pas pénaliser un sujet net. */
    topFraction: 0.25,
    /** Même principe à l'intérieur de la boîte d'un visage. */
    faceGridSize: 4,
    faceTopFraction: 0.5,
  },
  faces: {
    /** Nombre maximal de visages cherchés par photo. */
    maxFaces: 6,
    /** Un visage plus petit que cette part de l'image est ignoré (passant au loin). */
    minAreaRatio: 0.002,
    /** Un visage compte comme « principal » s'il fait au moins cette part du plus grand visage de la photo. */
    mainRelativeArea: 0.35,
    /** Marge (en proportion de l'image) sous laquelle un visage est considéré coupé par le bord. */
    cutMargin: 0.004,
    /** Yeux : en dessous de `eyesClosedAt` ils comptent comme fermés, au-dessus de `eyesOpenAt` comme
     *  grands ouverts. Entre les deux la note monte en ligne droite. Évite de départager deux photos
     *  sur un simple plissement (sourire, lunettes). */
    eyesClosedAt: 0.3,
    eyesOpenAt: 0.65,
    /** Regard : écart (degrés) entre la direction du visage et celle de l'objectif.
     *  Sous `gazeFullDeg` la note est maximale, au-delà de `gazeZeroDeg` elle est nulle. */
    gazeFullDeg: 10,
    gazeZeroDeg: 40,
    /** L'inclinaison haut-bas de la tête renseigne moins sur le regard que sa rotation gauche-droite
     *  (ce sont surtout les yeux qui montent et descendent) : elle compte moitié moins. */
    gazeVerticalWeight: 0.5,
    /** Focale supposée (équivalent 35 mm) quand la photo ne l'indique pas : objectif principal d'un iPhone. */
    defaultFocal35: 26,
    /** Rotation des yeux (degrés) quand ils sont tournés à fond dans la tête : sert à reconnaître
     *  une tête tournée dont les yeux reviennent vers l'objectif. */
    eyeRangeDeg: 30,
    /** Expression : note neutre, bonus du sourire, pénalités bouche ouverte (parole) et moue. */
    /** Expression : un visage calme vaut déjà bien ; un sourire ou une pose voulue (moue, bisou) l'améliore ;
     *  seule une bouche ouverte sans sourire (parole) est un défaut. */
    expressionNeutral: 0.7,
    smileBonus: 0.3,
    jawOpenFrom: 0.3,
    talkingPenalty: 0.9,
    poutFrom: 0.3,
  },
  content: {
    /** Catégories du détecteur d'objets considérées comme gênantes quand elles touchent les personnes
     *  (objet tenu en main, sac…). Nom anglais du modèle → nom affiché. */
    distractingLabels: {
      bottle: 'bouteille',
      'wine glass': 'verre',
      cup: 'tasse ou gobelet',
      'cell phone': 'téléphone',
      handbag: 'sac',
      backpack: 'sac à dos',
      suitcase: 'valise',
      umbrella: 'parapluie',
      remote: 'télécommande',
      book: 'livre',
      bowl: 'bol',
      fork: 'fourchette',
      knife: 'couteau',
      spoon: 'cuillère',
      banana: 'banane',
      sandwich: 'sandwich',
      'hot dog': 'hot-dog',
      pizza: 'pizza',
      donut: 'beignet',
      cake: 'gâteau',
      scissors: 'ciseaux',
      toothbrush: 'brosse à dents',
      'hair drier': 'sèche-cheveux',
    } as Record<string, string>,
    /** Score minimal pour retenir une détection d'objet ou de personne. */
    minObjectScore: 0.35,
    /** Objet gênant (frisbee, ballon…) : retenu seulement au-dessus de ce score (un frisbee imaginaire à 0,45–0,64
     *  sur des photos de randonnée, 19/11). */
    distractionMinScore: 0.7,
    /** Objets qui font partie du sujet (planche de surf tenue entre deux personnes, 19/11 : « il faut la voir comme
     *  une 3e personne ») : quand l'un d'eux est sur la photo, ce qui passe devant les personnes n'est pas un défaut. */
    subjectObjects: ['surfboard', 'skis', 'snowboard', 'skateboard', 'bicycle', 'dog', 'cat', 'horse', 'kite', 'sports ball'] as string[],
    subjectObjectMinScore: 0.5,
    /** Petits objets qu'on tient en main : pas une gêne quand ils sont (à `heldInside` au moins) sur le corps d'un sujet. */
    handheldLabels: ['cup', 'wine glass', 'bottle', 'cell phone'] as string[],
    heldInside: 0.6,
    /** Objet « levé » (voulu) : son centre au plus à N hauteurs de visage sous le centre du visage (bouche, poitrine),
     *  et au plus à N largeurs de visage sur le côté. Plus bas, bras baissé : il gêne (utilisateur, 21/11). */
    heldRaisedFaces: 2.5,
    heldSideFaces: 2.5,
    /** Un objet gênant est compté s'il touche la zone des personnes, ou s'il occupe au moins cette part de l'image. */
    largeObjectArea: 0.04,
    /** Zone des personnes autour d'un visage : largeur et hauteur en multiples de la taille du visage. */
    subjectZoneWidth: 3,
    subjectZoneHeight: 4.5,
    /** Pénalité par objet gênant, et pénalité maximale. */
    objectPenalty: 0.12,
    objectPenaltyMax: 0.3,
    /** Personnes en arrière-plan : une personne pèse selon sa taille (part de l'image × ce facteur, plafonné à 1)
     *  et sa position (plus elle est au centre, plus elle gêne). */
    backgroundAreaFactor: 12,
    backgroundEdgeWeight: 0.35,
    /** Pénalité pour une « personne entière » d'écart avec la photo du paquet la plus dégagée, et pénalité maximale. */
    backgroundPenalty: 0.1,
    /** Sans personne au premier plan (paysage, rue), un passant gêne davantage : pénalité multipliée, et raison
     *  affichée dès ce seuil (ruelle du 17/11 : « un bonhomme apparaît et cache un peu la photo »). */
    backgroundLandscapeFactor: 3,
    backgroundLandscapeFrom: 0.05,
    backgroundPenaltyMax: 0.3,
    /** Une personne détectée qui recouvre à ce point la place d'un sujet sur une autre photo du paquet est un sujet
     *  (son visage n'a simplement pas été trouvé sur cette photo), pas un passant. */
    subjectOverlap: 0.3,
    /** Une personne présente au même endroit sur au moins cette part des photos d'un groupe (de 3 photos au moins),
     *  et assez grande, est un sujet même sans visage visible (vue de dos). */
    recurringShare: 0.6,
    recurringMinPhotos: 3,
    recurringMinArea: 0.03,
    /** Visage en partie masqué : écart de couleur avec la même personne sur les autres photos du paquet.
     *  Écart de teinte (chromaticité) et de luminosité à partir duquel on commence à compter, et pleine échelle. */
    occlusionChromaFrom: 0.025,
    occlusionChromaFull: 0.07,
    occlusionLumaFrom: 0.35,
    occlusionLumaFull: 0.9,
    /** Part de la note du visage perdue quand il est entièrement masqué. */
    occlusionPenalty: 0.6,
    /** Il faut au moins ce nombre de photos complètes dans le paquet pour juger un masquage. */
    occlusionMinPhotos: 3,
    /** Objet tenu devant la personne : même principe sur la zone sous le visage (cou, buste), qui bouge davantage
     *  d'une photo à l'autre ; seuils plus larges. */
    frontChromaFrom: 0.05,
    frontChromaFull: 0.12,
    frontLumaFrom: 0.45,
    frontLumaFull: 1.1,
    frontPenalty: 0.35,
    /** Zone sous le visage : largeur et position, en tailles de visage. */
    bodyZoneWidth: 1.2,
    bodyZoneTop: 1.15,
    bodyZoneBottom: 2.0,
    /** Visage trop sombre : luminosité sous cette part de celle de la même personne sur les autres photos. */
    darkFaceBelow: 0.7,
    darkFaceFull: 0.45,
    darkFacePenalty: 0.3,
  },
  exposure: {
    /** Un pixel est « brûlé » au-dessus de ce niveau de gris, « bouché » en dessous de celui-ci. */
    highlightFrom: 250,
    shadowBelow: 6,
    /** Part de pixels brûlés ou bouchés en plus de la photo la mieux exposée du paquet, à partir de laquelle
     *  on pénalise, et à laquelle la pénalité est pleine. */
    clippedFrom: 0.02,
    clippedFull: 0.15,
    penalty: 0.25,
  },
  segmentation: {
    /** Largeur des bandes de bord examinées (part du petit côté de l'image). */
    band: 0.03,
    /** Bas de l'image ignoré : jambes coupées par le bas ou les coins du bas, c'est le cadre naturel (utilisateur,
     *  19/11). Seuls les bords gauche et droit, au-dessus de cette part de la hauteur, comptent (mains, bras). */
    ignoreBottom: 0.3,
    /** Peau du corps au bord en plus de la photo du groupe qui en a le moins : début et pleine pénalité.
     *  Essai : 0 % sur un portrait entier, 5,5 % sur le même portrait coupé au milieu des mains. */
    /** Doublés le 19/11 : sans le bas de l'image, la zone examinée est deux fois plus petite (même main coupée →
     *  part deux fois plus grande). Valeurs d'avant : 0,015 et 0,05. */
    edgeSkinFrom: 0.03,
    edgeSkinFull: 0.1,
    edgePenalty: 0.2,
    /** Visage masqué : baisse de la part de peau dans la boîte du visage, par rapport à la même personne sur les
     *  autres photos (0,2 = un cinquième de peau en moins), début et pleine échelle. */
    faceSkinDropFrom: 0.15,
    faceSkinDropFull: 0.45,
    /** Taille de l'image donnée au modèle (plus grand côté, pixels) : le masque est à cette taille. */
    inputMaxSide: 512,
  },
  classifier: {
    /** Catégories retenues : score minimal, et nombre maximal. */
    minScore: 0.15,
    maxLabels: 5,
    /** Numéros de catégories ImageNet. Avion (hublot) : avion de ligne, aile. */
    airplane: [404, 908] as readonly number[],
    /** Captures d'écran et documents : site web, menu, enveloppe, couverture de livre, bande dessinée, mots croisés. */
    document: [916, 922, 549, 921, 917, 918] as readonly number[],
    /** Écrans photographiés : moniteur, écran, télévision, ordinateur portable, ordinateur de bureau, carnet, téléphone. */
    screen: [664, 782, 851, 620, 527, 681, 487] as readonly number[],
    /** Nourriture et boissons : de l'assiette (923) au lait de poule (969). */
    food: [923, 969],
    /** Animaux : des poissons (0) aux mammifères (397). */
    animal: [0, 397],
    /** Part des photos d'un groupe (et score minimal) pour décider d'un type. */
    sceneShare: 0.5,
    sceneScore: 0.25,
  },
  obstruction: {
    /** L'image est découpée en cases ; une case est « masquée » si elle est sombre et uniforme. */
    gridX: 24,
    gridY: 18,
    darkBelow: 55,
    flatBelow: 12,
    /** Part de l'image masquée en plus de la photo la plus dégagée du paquet : début et pleine pénalité.
     *  Ne s'applique qu'aux photos prises d'un avion (reconnues par le modèle de classement) : ailleurs, des murs
     *  sombres ou des ombres le déclenchaient à tort (ruelle du 17/11). */
    from: 0.08,
    full: 0.3,
    penalty: 0.25,
  },
  framing: {
    /** Lignes considérées : celles à moins de ce nombre de degrés de l'horizontale ou de la verticale. */
    tiltSearchDeg: 15,
    /** Contraste minimal d'un contour pour qu'il compte. */
    tiltEdgeMin: 40,
    /** La mesure n'est retenue que si cette part des contours s'aligne sur une même direction.
     *  Abaissé après confirmation de l'utilisateur : les photos mesurées à 5–11° (force 0,04–0,05) étaient bien
     *  penchées. L'inclinaison est jugée par rapport à la photo la plus droite du paquet. */
    tiltStrengthMin: 0.04,
    /** Sous cette inclinaison, la photo est considérée droite ; à `tiltFullDeg` la pénalité est pleine. */
    tiltToleranceDeg: 1.5,
    tiltFullDeg: 6,
    tiltPenalty: 0.2,
  },
  scene: {
    /** Coucher de soleil : part minimale de pixels orange ou jaune saturés, et intensité minimale. */
    sunsetWarmFraction: 0.1,
    sunsetWarmStrength: 0.25,
    /** Selfie : focale de la caméra avant (équivalent 35 mm) au plus égale à celle-ci, et visage assez grand. */
    selfieMaxFocal: 23,
    selfieMinFaceArea: 0.01,
    /** Groupe : à partir de ce nombre de visages. */
    groupFrom: 3,
    /** Poids de l'esthétique selon le type : couleurs chaudes, contraste, vivacité, équilibre de l'exposition. */
    aesthetic: {
      coucher: { warm: 0.45, contrast: 0.2, colorful: 0.15, balance: 0.2 },
      nourriture: { warm: 0.1, contrast: 0.25, colorful: 0.4, balance: 0.25 },
      paysage: { warm: 0, contrast: 0.3, colorful: 0.3, balance: 0.4 },
      personnes: { warm: 0, contrast: 0.25, colorful: 0.25, balance: 0.5 },
    },
    /** Luminosité moyenne visée pour une exposition équilibrée (0 à 1). */
    balanceTarget: 0.45,
    /** Raisons : esthétique sous cette part de la meilleure du paquet = « couleurs plus ternes ». */
    dullBelow: 0.85,
  },
  poses: {
    /** Avec l'empreinte fine (modèle) : même pose si la ressemblance (cosinus, 1 = identiques) avec la photo
     *  précédente est au moins de `similarPrevious`, et avec la première du groupe de `similarFirst`. */
    similarPrevious: 0.8,
    similarFirst: 0.7,
    /** Prises en rafale (moins de `burstSeconds` d'écart) : même pose, sauf si la ressemblance tombe sous
     *  `burstMinSimilar` (scène vraiment différente). Le nombre de visages trouvés ne compte plus : de loin ou dans
     *  l'eau, un visage est souvent manqué (paquet de la baignade du 18/11 : 4 poses pour 5 photos en 5 s). */
    burstSeconds: 6,
    burstMinSimilar: 0.6,
    /** Sans empreinte fine : empreinte de 8 x 8 pixels (0 = identiques, 1 = opposées). */
    fromPrevious: 0.1,
    fromFirst: 0.14,
    /** Au-delà de cet écart de temps (secondes) entre deux photos, nouveau groupe. */
    gapSeconds: 20,
    /** Un visage qui se déplace de plus de cette part de l'image change la pose, sauf en rafale quand les photos se
     *  ressemblent au moins à `similarPrevious` (cadrage qui bouge, même pose : paquet 1 du 19/11). */
    faceMove: 0.15,
    /** Paysage sans personne : même pose, quel que soit l'écart de temps, si la ressemblance avec la photo précédente
     *  et avec la première du groupe atteint ce seuil. */
    sceneSimilar: 0.7,
    /** Personne repérée (détecteur d'objets) à partir de ce score : la photo n'est plus un paysage. */
    personMinScore: 0.5,
  },
  selection: {
    /** Dans une pose, la meilleure photo est gardée. Une autre l'est aussi si elle est bonne (à moins de `keepMargin`
     *  de la meilleure, sans défaut bloquant) ET nettement différente de chaque photo déjà gardée (tête, expression,
     *  regard, geste, personnes qui bougent, cadrage) ; légèrement différente, ou un peu moins bonne (jusqu'à
     *  `reviewMargin`), elle est « à vérifier » ; identique, elle est supprimée (utilisateur, 19/11, point 37). */
    keepMargin: 0.08,
    reviewMargin: 0.12,
    /** Seuils de différence entre deux photos : « nette » (Strong) et « légère » (Light). */
    different: {
      headStrong: 12,
      headLight: 6,
      smileStrong: 0.3,
      smileLight: 0.15,
      eyeDirStrong: 0.4,
      eyeDirLight: 0.25,
      personMoveStrong: 0.08,
      personMoveLight: 0.04,
      /** Ressemblance d'empreinte en dessous de laquelle le cadrage a changé. */
      similarStrong: 0.75,
      similarLight: 0.85,
      /** Sans empreinte fine : écart d'empreinte simple (0 = identiques). */
      signatureStrong: 0.08,
      signatureLight: 0.04,
    },
    /** Défauts qui empêchent de garder une photo en plus de la meilleure. */
    blocking: ['parle', 'visage-masque', 'devant', 'visage-flou', 'tres-floue', 'visage-cache', 'regard-ailleurs', 'erreur-probable'] as readonly string[],
    /** Deux photos dont l'empreinte diffère de moins de ceci sont des quasi-doublons : on n'en garde qu'une.
     *  Avec l'empreinte fine : ressemblance d'au moins `nearDuplicateSimilar`. */
    nearDuplicate: 0.015,
    nearDuplicateSimilar: 0.985,
  },
  /** Fichiers mis de côté : ni analysés en détail, ni proposés à la suppression (toujours gardés). */
  aside: {
    /** Photo d'un document ou d'un écran (sans visage) : score minimal de la catégorie principale. */
    documentScore: 0.3,
  },
  /** Gestes des mains (modèle Gesture Recognizer). */
  gestures: {
    /** Gestes qui montrent une pose voulue : V de la victoire, pouce levé, « je t'aime » en langue des signes. */
    intended: ['Victory', 'Thumb_Up', 'ILoveYou'] as readonly string[],
    minScore: 0.6,
    /** Bonus sur la note d'une photo de personnes où un geste voulu est fait. */
    bonus: 0.05,
    /** Nombre maximal de mains cherchées par photo. */
    maxHands: 4,
  },
  /** Goûts appris sur l'image (empreinte) : en test, sans influence sur les décisions (voir `docs/jalon-5.md`). */
  taste: {
    /** Nombre de choix voisins consultés, et ressemblance minimale pour qu'un choix compte comme voisin. */
    neighbors: 7,
    minSimilarity: 0.55,
    /** Poids du vote dans la note simulée (écart au vote moyen de la pose). */
    weight: 0.05,
    /** En dessous de ce nombre de choix avec empreinte, pas de simulation. */
    minChoices: 20,
    /** Choix consultés au plus (les plus récents) : le calcul reste rapide quand les choix s'accumulent. */
    memoryMax: 600,
  },
  learning: {
    /** Ajustement maximal de la note apporté par l'apprentissage, et poids maximal d'un critère. */
    maxAdjustment: 0.08,
    maxWeight: 0.3,
    /** Confiance progressive : les poids appris sont multipliés par n / (n + trustChoices), n = nombre de choix.
     *  Avec 42 choix, l'apprentissage du 18/11 décalait les notes de ±0,15, plus que l'écart entre deux photos. */
    trustChoices: 150,
    /** Vitesse d'apprentissage, rappel vers zéro (évite de sur-apprendre sur peu de choix), passes sur les données. */
    rate: 0.5,
    regularization: 0.2,
    epochs: 40,
    /** Échelle des différences de note dans la fonction logistique. */
    scale: 8,
  },
  scoring: {
    /** Note d'un visage. Le contenu d'abord : l'expression domine. Le regard compte peu,
     *  car regarder au loin peut faire une très belle photo. */
    faceWeights: { eyes: 0.15, gaze: 0, expression: 0.67, sharpness: 0.18 },
    /** Photo de plusieurs personnes : tout le monde doit regarder l'objectif (utilisateur, 19/11 : « seul, on peut
     *  regarder ailleurs ; en groupe, il faut que les gens regardent »). */
    groupFaceWeights: { eyes: 0.15, gaze: 0.3, expression: 0.4, sharpness: 0.15 },
    /** En groupe, un regard en dessous de ceci est signalé (« quelqu'un regarde ailleurs ») et bloque une seconde photo. */
    groupGazeBelow: 0.6,
    /** Photo probablement prise par erreur : pas de visage ni de personne, netteté sous `maxSharpness`, et penchée de
     *  plus de `minTiltDeg` (pied, sol pris en marchant). Jamais supprimée d'office : « à vérifier ». */
    accident: { maxSharpness: 250, minTiltDeg: 8, minTiltStrength: 0.03, penalty: 0.3 },
    /** Note « visages » d'une photo : le visage le plus raté pèse le plus. */
    worstFaceWeight: 0.6,
    meanFaceWeight: 0.4,
    /** Note d'une photo avec des personnes : visages, technique (netteté globale), esthétique (couleurs, exposition).
     *  Avec des personnes au premier plan, les couleurs ne servent qu'à départager des photos égales. */
    photoWeights: { faces: 0.87, technique: 0.1, aesthetic: 0.03 },
    /** Note d'une photo sans personne : technique, puis esthétique. */
    landscapeWeights: { technique: 0.3, aesthetic: 0.7 },
    /** La netteté ne sert qu'à repérer un défaut : au-dessus de `sharpEnough` fois la référence du paquet,
     *  elle vaut le maximum (une photo plus nette n'est pas une meilleure photo) ; sous `sharpFloor`, zéro. */
    sharpEnough: 0.6,
    sharpFloor: 0.2,
    /** Part de la note « visages » perdue quand tous les visages attendus manquent. */
    missingFacePenalty: 0.5,
    /** Même chose quand la personne est bien là (détectée à sa place) mais que son visage n'a pas pu être analysé. */
    unanalyzedFacePenalty: 0.06,
    /** Veto : yeux considérés fermés sous cette note d'ouverture. */
    eyesClosedBelow: 0.3,
    /** Personne seule, tête nettement baissée ou levée (degrés) : les paupières paraissent fermées sans l'être ; c'est
     *  un regard ailleurs, permis quand on est seul (photo 3 du 19/11, tête baissée de 42°, gardée). */
    lookAwayPitchDeg: 25,
    /** Ouverture habituelle (médiane sur le groupe) en dessous de laquelle une personne a les yeux plissés partout :
     *  ses yeux « fermés » ne sont alors pas un clignement (P2 du 18/11 : médiane 0,40, photos gardées). */
    squintUsualBelow: 0.6,
    squintMinPhotos: 3,
    /** Photo sans personne très floue : netteté globale mesurée sous ce seuil absolu (valeur de départ, à calibrer). */
    absoluteBlurBelow: 15,
    /** Seuils des raisons affichées. */
    reasons: {
      talkingFrom: 0.15,
      poseFrom: 0.15,
      smileFrom: 0.5,
      faceBlurBelow: 0.5,
      lessSharpBelow: 0.7,
      occlusionFrom: 0.35,
      frontFrom: 0.35,
      backgroundFrom: 0.5,
    },
  },
} as const;

export type EngineConfig = typeof config;
