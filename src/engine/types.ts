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

/** Couleur moyenne d'une zone, composantes entre 0 et 255. */
export type Rgb = readonly [number, number, number];

/** Objet ou personne repéré par le détecteur d'objets. */
export interface DetectedObject {
  /** Nom anglais de la catégorie (« person », « bottle »…). */
  label: string;
  score: number;
  box: Box;
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
  /** Bouche ouverte sans sourire (en train de parler), et moue, entre 0 et 1. */
  talking: number;
  pout: number;
  /** Couleur moyenne du haut (yeux) et du bas (bouche, menton) du visage, si mesurée.
   *  Sert à repérer un objet devant le visage, par comparaison avec la même personne sur les autres photos. */
  upperColor: Rgb | null;
  lowerColor: Rgb | null;
  /** Couleur moyenne juste sous le visage (cou, buste) : un objet tenu devant la personne la change. */
  bodyColor: Rgb | null;
}

/** Mesures tirées de la silhouette des personnes (modèle de segmentation : fond, cheveux, peau du corps,
 *  peau du visage, vêtements, accessoires). */
export interface SegmentationMetrics {
  /** Part des bandes de bord (bas, gauche, droite) couverte par de la peau du corps : main, bras ou jambe coupés. */
  edgeBodySkin: number;
  /** Pour chaque visage de `faces` (même ordre) : part de sa boîte couverte par de la peau du visage
   *  (baisse quand un objet ou une main passe devant). */
  faceSkin: (number | null)[];
}

/** Catégorie de scène ou d'objet reconnue par le modèle de classement (catégories ImageNet). */
export interface SceneLabel {
  index: number;
  name: string;
  score: number;
}

/** Exposition d'une image : parts de pixels brûlés (blanc pur) et bouchés (noir pur), luminosité moyenne (0 à 255). */
export interface Exposure {
  highlights: number;
  shadows: number;
  mean: number;
}

/** Couleurs et contraste d'une image (mesurés sur l'image réduite). */
export interface ColorStats {
  /** Saturation moyenne, entre 0 et 1. */
  saturation: number;
  /** Vivacité des couleurs (mesure de Hasler et Süsstrunk), environ 0 (gris) à 1 (très vives). */
  colorfulness: number;
  /** Part des pixels orange ou jaune saturés, entre 0 et 1, et leur intensité moyenne (saturation × luminosité). */
  warmFraction: number;
  warmStrength: number;
  /** Contraste : écart type de la luminosité, ramené entre 0 et 1. */
  contrast: number;
  /** Luminosité moyenne, entre 0 et 1. */
  mean: number;
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
  /** Objets et personnes repérés ; null si la détection n'a pas pu tourner. */
  objects: DetectedObject[] | null;
  /** Inclinaison des grandes lignes droites de l'image (horizon, bâtiments), en degrés,
   *  et force de cette mesure entre 0 (aucune ligne nette) et 1. */
  tiltDeg: number | null;
  tiltStrength: number | null;
  /** Exposition mesurée sur l'image réduite ; null si non mesurée. */
  exposure: Exposure | null;
  /** Couleurs et contraste ; null si non mesurés. */
  color: ColorStats | null;
  /** Empreinte de l'image : vignette de 8 x 8 pixels en couleur (192 nombres de 0 à 255), pour comparer les poses. */
  signature: number[] | null;
  /** Silhouette des personnes ; null si non analysée. */
  segmentation: SegmentationMetrics | null;
  /** Empreinte fine de l'image (modèle d'empreinte, vecteur normalisé) ; null si non calculée. */
  embedding: number[] | null;
  /** Catégories de scène les plus probables ; null si non classée. */
  labels: SceneLabel[] | null;
  /** Part de l'image envahie depuis les bords par une zone sombre et uniforme (hublot, doigt), entre 0 et 1. */
  obstruction: number | null;
}

/** Type de photo, décidé pour un paquet entier. */
export type SceneType = 'selfie' | 'portrait' | 'groupe' | 'coucher' | 'paysage' | 'nourriture' | 'animal' | 'document';

export interface PoseGroup {
  id: string;
  /** Lettre affichée (A, B, C…). */
  label: string;
  items: MediaItem[];
}

export type DecisionCode =
  | 'meilleure'
  | 'aussi-bonne'
  | 'seule'
  | 'minimum'
  | 'trop-proche'
  | 'moins-bonne'
  | 'plafond'
  | 'veto'
  | 'ratee';

export interface Decision {
  keep: boolean;
  code: DecisionCode;
  /** Photo de référence (« trop proche de la n° 4 », « moins bonne que la n° 3 »). */
  refId?: string;
  /** Photos gardées à sa place, mieux notées (pour expliquer un refus par comparaison). */
  keptIds?: string[];
  /** Groupe de pose de la photo. */
  pose: string;
}

/** Critères dont l'importance s'ajuste aux choix de l'utilisateur. Valeurs entre 0 et 1, relatives au paquet. */
export const FEATURE_NAMES = [
  'expression',
  'sourire',
  'pose',
  'regard',
  'netteteVisage',
  'masquage',
  'devant',
  'arrierePlan',
  'objets',
  'penchee',
  'membres',
  'bords',
  'couleurs',
  'chaud',
  'contraste',
  'equilibre',
  'nettete',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Record<FeatureName, number>;
export type LearnedWeights = Partial<Record<FeatureName, number>>;

/** Choix de l'utilisateur sur une photo, tel qu'il est enregistré sur l'appareil (jamais l'image). */
export interface ChoiceRecord {
  /** Identifiant stable de la photo : nom de fichier et date de prise de vue. */
  key: string;
  /** Paquet dans lequel le choix a été fait (date de début du paquet). */
  packKey: string;
  choice: 'garder' | 'supprimer';
  features: Features;
  baseScore: number;
  at: number;
  /** Commentaire de l'utilisateur sur ce choix (facultatif), repris dans le rapport de diagnostic. */
  comment?: string;
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
  | 'visage-masque'
  | 'membre-coupe'
  | 'bords-masques'
  | 'tres-floue'
  | 'devant'
  | 'visage-sombre'
  | 'surexposee'
  | 'sous-exposee'
  | 'aucun-visage'
  | 'visage-non-analyse'
  | 'parle'
  | 'pose'
  | 'couleurs-vives'
  | 'couleurs-ternes'
  | 'equilibree'
  | 'arriere-plan'
  | 'objet'
  | 'horizon'
  | 'visage-flou'
  | 'moins-nette'
  | 'sourire'
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
  /** Pour 'objet' : noms (anglais) des objets ; pour 'horizon' : l'inclinaison en degrés. */
  labels?: string[];
  degrees?: number;
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
  /** Détail de la note : visages (null s'il n'y en a pas), technique, et multiplicateurs de pénalité. */
  faceScore: number | null;
  technique: number;
  /** Mesures de contenu, pour le rapport de diagnostic. */
  background: number;
  distraction: number;
  /** Visage le plus masqué de la photo, entre 0 et 1. */
  occlusion: number;
  /** Objet devant la personne la plus concernée, entre 0 et 1. */
  front: number;
  /** Luminosité du visage le plus sombre, rapportée à la même personne sur les autres photos (1 = habituelle). */
  faceBrightness: number;
  /** Note avant l'ajustement appris des choix de l'utilisateur. */
  baseScore: number;
  /** Ajustement appris (positif : la photo ressemble à celles que l'utilisateur garde). */
  learned: number;
  /** Mesures relatives au paquet, utilisées pour l'apprentissage. */
  features: Features;
  /** Photo ratée en elle-même (défaut rédhibitoire ou très floue) : elle peut être supprimée même si c'est la seule. */
  failed: boolean;
  /** Peau du corps au bord en plus de la photo du groupe qui en a le moins, et bords masqués en plus de la plus dégagée. */
  extraEdgeSkin: number;
  extraObstruction: number;
}
