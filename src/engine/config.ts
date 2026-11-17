// Tous les seuils et poids du moteur vivent ici, et nulle part ailleurs.

export const config = {
  grouping: {
    /** Écart de temps (secondes) au-delà duquel on ouvre un nouveau paquet. Valeur de départ, à ajuster. */
    packGapSeconds: 300,
    /** Bornes du curseur de réglage dans l'écran Paquets. */
    packGapMinSeconds: 10,
    packGapMaxSeconds: 900,
  },
  image: {
    /** Plus grand côté (pixels) de l'image réduite utilisée pour l'analyse. */
    analysisMaxSide: 1024,
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
  },
} as const;

export type EngineConfig = typeof config;
