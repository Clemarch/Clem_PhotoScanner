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
    /** Plus grand côté (pixels) des miniatures affichées. */
    thumbnailMaxSide: 512,
    thumbnailQuality: 0.72,
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
    expressionNeutral: 0.55,
    smileBonus: 0.45,
    jawOpenFrom: 0.3,
    talkingPenalty: 0.9,
    poutFrom: 0.3,
    poutPenalty: 0.5,
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
  framing: {
    /** Lignes considérées : celles à moins de ce nombre de degrés de l'horizontale ou de la verticale. */
    tiltSearchDeg: 15,
    /** Contraste minimal d'un contour pour qu'il compte. */
    tiltEdgeMin: 40,
    /** La mesure n'est retenue que si cette part des contours s'aligne sur une même direction. */
    tiltStrengthMin: 0.1,
    /** Sous cette inclinaison, la photo est considérée droite ; à `tiltFullDeg` la pénalité est pleine. */
    tiltToleranceDeg: 1.5,
    tiltFullDeg: 6,
    tiltPenalty: 0.2,
  },
  scoring: {
    /** Note d'un visage. Le contenu d'abord : l'expression domine. Le regard compte peu,
     *  car regarder au loin peut faire une très belle photo. */
    faceWeights: { eyes: 0.15, gaze: 0.1, expression: 0.55, sharpness: 0.2 },
    /** Note « visages » d'une photo : le visage le plus raté pèse le plus. */
    worstFaceWeight: 0.6,
    meanFaceWeight: 0.4,
    /** Note d'une photo : visages, puis technique (netteté globale). */
    photoWeights: { faces: 0.85, technique: 0.15 },
    /** La netteté ne sert qu'à repérer un défaut : au-dessus de `sharpEnough` fois la référence du paquet,
     *  elle vaut le maximum (une photo plus nette n'est pas une meilleure photo) ; sous `sharpFloor`, zéro. */
    sharpEnough: 0.6,
    sharpFloor: 0.2,
    /** Part de la note « visages » perdue quand tous les visages attendus manquent. */
    missingFacePenalty: 0.5,
    /** Veto : yeux considérés fermés sous cette note d'ouverture. */
    eyesClosedBelow: 0.3,
    /** Seuils des raisons affichées. */
    reasons: {
      talkingFrom: 0.15,
      poutFrom: 0.15,
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
