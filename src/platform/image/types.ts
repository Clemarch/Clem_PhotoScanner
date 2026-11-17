import type { MediaItem } from '../../engine';

/** Mesures techniques d'un fichier, affichées dans l'écran de diagnostic. */
export interface FileDiagnostic {
  id: string;
  mimeType: string;
  /** Date du fichier donnée par le navigateur (souvent l'heure de la sélection, pas la prise de vue). */
  fileModifiedAt: number | null;
  exifFound: boolean;
  exifMs: number;
  decodeMs: number | null;
  analysisMs: number | null;
  /** Comment la photo a été décodée (utile pour comprendre un échec). */
  decodeMethod: string | null;
  /** Taille de l'image réduite réellement analysée. */
  analyzedWidth: number | null;
  analyzedHeight: number | null;
  /** Mémoire estimée de la photo décodée en pleine taille (largeur x hauteur x 4 octets). */
  estimatedDecodedMB: number | null;
  /** Où l'analyse a tourné : 'worker' (en arrière-plan) ou 'principal'. */
  thread: 'worker' | 'principal';
  error: string | null;
  /** Durée de la recherche de visages, et nombre de visages trouvés (null si non cherchés). */
  faceMs: number | null;
  faceCount: number | null;
  /** Visages retrouvés par la seconde recherche, sur le recadrage d'une personne. */
  faceRetry: number;
  /** Durée de la détection d'objets (null si non faite). */
  objectMs: number | null;
  /** Durée de l'analyse du corps (null si non faite). */
  bodyMs: number | null;
}

/** Image réduite gardée juste le temps de chercher les visages, puis libérée. */
export interface AnalysisFrame {
  bitmap: ImageBitmap;
  gray: Uint8Array;
  /** Pixels en couleur (rouge, vert, bleu, opacité), pour mesurer la couleur des visages. */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface AnalyzeResult {
  item: MediaItem;
  thumbnail: Blob | null;
  /** Image moyenne (1080 px) pour la visionneuse. */
  preview: Blob | null;
  diagnostic: FileDiagnostic;
  frame: AnalysisFrame | null;
}
