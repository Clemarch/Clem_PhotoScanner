// Types du moteur. Aucun accès au navigateur ici : ce dossier doit rester réutilisable (Expo, PC).

/** Une photo aujourd'hui, une vidéo plus tard. */
export type MediaKind = 'photo' | 'video';

export type MediaFormat = 'HEIC' | 'JPEG' | 'PNG' | 'DNG' | 'RAW' | 'VIDEO' | 'AUTRE';

/** D'où vient la date utilisée : des métadonnées de la photo (fiable), du fichier (douteux), ou nulle part. */
export type DateSource = 'exif' | 'fichier' | 'absente';

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
  /** Netteté globale (plus grand = plus net). Ne se compare qu'entre photos d'un même paquet. */
  sharpness: number | null;
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

export interface RelativeSharpness {
  /** 1 = la plus nette du paquet. */
  rank: number;
  /** Netteté rapportée à la meilleure du paquet, entre 0 et 1. */
  ratio: number;
}
