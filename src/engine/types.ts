// Types du moteur. Aucun accès au navigateur ici : ce dossier doit rester réutilisable (Expo, PC).

/** Une photo aujourd'hui, une vidéo plus tard. */
export type MediaKind = 'photo' | 'video';

export type MediaFormat = 'HEIC' | 'JPEG' | 'PNG' | 'DNG' | 'RAW' | 'VIDEO' | 'AUTRE';

/** D'où vient la date utilisée : des métadonnées de la photo (fiable), du fichier (douteux), ou nulle part. */
export type DateSource = 'exif' | 'fichier' | 'absente';

/** Rectangle en proportions de l'image (0 = bord gauche ou haut, 1 = bord droit ou bas). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ce que le détecteur de visages fournit, brut, pour un visage. */
export interface FaceObservation {
  box: Box;
  /** Mesures d'expression entre 0 et 1 (clignement, sourire, direction des yeux…). */
  blendshapes: Readonly<Record<string, number>>;
  /** Matrice 4 x 4 (par colonnes) donnant l'orientation de la tête, si disponible. */
  matrix: readonly number[] | null;
}

/** Mesures d'un visage, toutes entre 0 (mauvais) et 1 (bon) sauf mention contraire. */
export interface FaceMetrics {
  box: Box;
  /** Part de l'image occupée par le visage. */
  areaRatio: number;
  eyesOpen: number;
  gaze: number;
  expression: number;
  smile: number;
  /** Netteté brute mesurée dans la boîte du visage (ne se compare qu'à l'intérieur d'un paquet). */
  sharpness: number;
  /** Le visage touche le bord de l'image. */
  cut: boolean;
  /** Rotation de la tête en degrés : gauche-droite, puis haut-bas. */
  yawDeg: number;
  pitchDeg: number;
  /** Écart (degrés) entre la direction de la tête et la direction de l'objectif : horizontal, puis vertical. */
  offAxisHDeg: number;
  offAxisVDeg: number;
  /** Direction des yeux dans la tête, entre -1 et 1 : horizontale, puis verticale. */
  eyeH: number;
  eyeV: number;
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  fileName: string;
  format: MediaFormat;
  /** Les RAW sont mis de côté (traités dans Lightroom). */
  isRaw: boolean;
  sizeBytes: number;
  /** Date de prise de vue en millisecondes, ou null si inconnue. */
  capturedAt: number | null;
  dateSource: DateSource;
  /** Largeur et hauteur d'origine, si connues. */
  width: number | null;
  height: number | null;
  /** Orientation EXIF (1 à 8), si connue. */
  orientation: number | null;
  /** Focale de l'objectif en « équivalent 35 mm » (23 pour la caméra selfie, 24 pour la principale…), si connue. */
  focal35: number | null;
  /** Netteté globale (plus grand = plus net). Ne se compare qu'entre photos d'un même paquet. */
  sharpness: number | null;
  /** Visages trouvés ; null si la recherche de visages n'a pas pu tourner. */
  faces: FaceMetrics[] | null;
}

export interface Pack {
  id: string;
  items: MediaItem[];
  startAt: number | null;
  endAt: number | null;
}

export interface DayGrouping {
  /** Paquets datés, dans l'ordre chronologique. */
  packs: Pack[];
  /** Photos dont la date est inconnue : impossible de les ranger dans un paquet. */
  undated: MediaItem[];
  /** RAW et vidéos, mis de côté en V1. */
  setAside: MediaItem[];
  /** Numéro de chaque photo dans la journée (1 = la première), comme dans l'app Photos. */
  dayIndex: Map<string, number>;
}

export type ReasonCode =
  | 'yeux-fermes'
  | 'visage-coupe'
  | 'visage-cache'
  | 'aucun-visage'
  | 'regard-ailleurs'
  | 'expression'
  | 'visage-flou'
  | 'moins-nette'
  | 'regarde-objectif'
  | 'sourire'
  | 'visage-net'
  | 'plus-nette';

export interface Reason {
  code: ReasonCode;
  /** 'veto' écarte la photo, 'moins' la pénalise, 'plus' joue en sa faveur. */
  tone: 'veto' | 'moins' | 'plus';
  /** Pour 'visage-cache' : visages visibles et visages attendus. */
  count?: number;
  expected?: number;
  /** Pour 'moins-nette' : la photo de référence. */
  refId?: string;
}

export interface PhotoScore {
  id: string;
  /** Note entre 0 et 1, relative au paquet. */
  score: number;
  /** 1 = la meilleure du paquet. */
  rank: number;
  vetoed: boolean;
  reasons: Reason[];
  /** Visages principaux visibles, et nombre attendu d'après le reste du paquet. */
  faceCount: number;
  expectedFaces: number;
  /** Détail de la note : visages (null s'il n'y en a pas) et technique. */
  faceScore: number | null;
  technique: number;
}
