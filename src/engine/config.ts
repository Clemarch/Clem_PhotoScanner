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
    /** Regard : écart des yeux et rotation de la tête à partir desquels la note tombe à zéro. */
    eyeDeviationMax: 0.6,
    yawMaxDeg: 40,
    pitchMaxDeg: 30,
    eyeDeviationWeight: 0.55,
    headDeviationWeight: 0.55,
    /** Expression : note neutre, bonus du sourire, pénalités bouche ouverte (parole) et moue. */
    expressionNeutral: 0.55,
    smileBonus: 0.45,
    jawOpenFrom: 0.3,
    talkingPenalty: 0.9,
    poutFrom: 0.3,
    poutPenalty: 0.5,
  },
  scoring: {
    /** Note d'un visage. */
    faceWeights: { eyes: 0.3, gaze: 0.25, expression: 0.2, sharpness: 0.25 },
    /** Note « visages » d'une photo : le visage le plus raté pèse le plus. */
    worstFaceWeight: 0.6,
    meanFaceWeight: 0.4,
    /** Note d'une photo. Le cadrage (0,15 dans le plan) n'est pas encore mesuré : les poids sont renormalisés. */
    photoWeights: { faces: 0.7, technique: 0.15 },
    /** La netteté varie sur plusieurs ordres de grandeur : cet exposant adoucit la comparaison. */
    sharpnessExponent: 0.5,
    /** Part de la note « visages » perdue quand tous les visages attendus manquent. */
    missingFacePenalty: 0.5,
    /** Veto : yeux considérés fermés sous ce niveau d'ouverture. */
    eyesClosedBelow: 0.4,
    /** Seuils des raisons affichées. */
    reasons: {
      gazeAwayBelow: 0.5,
      gazeGoodFrom: 0.75,
      expressionBadBelow: 0.35,
      smileFrom: 0.5,
      faceBlurBelow: 0.5,
      faceSharpFrom: 0.85,
      lessSharpBelow: 0.7,
    },
  },
} as const;

export type EngineConfig = typeof config;
