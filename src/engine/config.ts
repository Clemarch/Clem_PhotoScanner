// Tous les seuils et poids du moteur vivent ici, et nulle part ailleurs.
// Ce sont des valeurs de départ : elles se calibrent sur de vraies photos.

export const config = {
  grouping: {
    /** Écart de temps (secondes) au-delà duquel on ouvre un nouveau paquet. */
    packGapSeconds: 60,
    /** Bornes du curseur de réglage dans l'écran Paquets. */
    packGapMinSeconds: 10,
    packGapMaxSeconds: 900,
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
  body: {
    /** Un point du corps compte comme visible au-dessus de cette visibilité. */
    visibleFrom: 0.5,
    /** Une extrémité (poignet, doigt, cheville, orteils) est coupée si elle est à moins de cette marge du bord, ou
     *  au-delà : le modèle place souvent une main coupée tout contre le bord (0,99) plutôt qu'en dehors. */
    edgeMargin: 0.02,
    /** Pénalité par main ou pied coupé en plus de la photo la mieux cadrée du groupe, et pénalité maximale. */
    cutPenalty: 0.12,
    cutPenaltyMax: 0.3,
    /** Sans visage dans le groupe, un corps compte comme sujet s'il occupe au moins cette part de l'image. */
    subjectMinArea: 0.05,
  },
  obstruction: {
    /** L'image est découpée en cases ; une case est « masquée » si elle est sombre et uniforme. */
    gridX: 24,
    gridY: 18,
    darkBelow: 55,
    flatBelow: 12,
    /** Part de l'image masquée en plus de la photo la plus dégagée du paquet : début et pleine pénalité. */
    from: 0.03,
    full: 0.2,
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
      paysage: { warm: 0, contrast: 0.3, colorful: 0.3, balance: 0.4 },
      personnes: { warm: 0, contrast: 0.25, colorful: 0.25, balance: 0.5 },
    },
    /** Luminosité moyenne visée pour une exposition équilibrée (0 à 1). */
    balanceTarget: 0.45,
    /** Raisons : esthétique sous cette part de la meilleure du paquet = « couleurs plus ternes ». */
    dullBelow: 0.85,
  },
  poses: {
    /** Une photo rejoint le groupe de pose courant si son empreinte diffère de moins de ceci de la précédente,
     *  et de moins de `fromFirst` du premier du groupe (0 = identiques, 1 = opposées). */
    fromPrevious: 0.1,
    fromFirst: 0.14,
    /** Au-delà de cet écart de temps (secondes) entre deux photos, nouveau groupe. */
    gapSeconds: 20,
    /** Un visage qui se déplace de plus de cette part de l'image change la pose. */
    faceMove: 0.15,
  },
  selection: {
    /** Plafond du paquet de N photos : ceil(packShare × N). Le quota est un plafond, jamais un objectif. */
    packShare: 0.25,
    /** Une photo est gardée si sa note est à moins de ceci (sur 1) de la meilleure de sa pose : seules les notes
     *  décident, il n'y a pas de nombre maximal de photos par pose. */
    scoreMargin: 0.04,
    /** Deux photos dont l'empreinte diffère de moins de ceci sont des quasi-doublons : on n'en garde qu'une. */
    nearDuplicate: 0.015,
  },
  learning: {
    /** Ajustement maximal de la note apporté par l'apprentissage, et poids maximal d'un critère. */
    maxAdjustment: 0.15,
    maxWeight: 0.3,
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
    faceWeights: { eyes: 0.15, gaze: 0.1, expression: 0.55, sharpness: 0.2 },
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
