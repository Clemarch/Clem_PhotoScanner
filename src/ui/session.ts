import type { DeviceReport } from '../platform/device';
import type { AnalyzeResult } from '../platform/image/types';

/** Résultat d'une analyse complète (une journée de photos). */
export interface Session {
  /** Identifiant de l'analyse (heure de lancement), pour conserver son rapport. */
  id: string;
  results: AnalyzeResult[];
  /** Adresse locale de chaque miniature (jamais envoyée nulle part). */
  thumbnails: Map<string, string>;
  /** Images moyennes pour la visionneuse. */
  previews: Map<string, string>;
  /** Fichiers d'origine (références, rien n'est copié), pour zoomer en pleine définition. */
  originals: Map<string, File>;
  totalMs: number;
  cancelled: boolean;
  wakeLock: boolean;
  /** Méthode utilisée, reprises, ou raison de l'échec (pour le rapport). */
  wakeLockInfo: string;
  heapBeforeMB: number | null;
  heapAfterMB: number | null;
  device: DeviceReport;
  /** Message d'erreur si la recherche de visages n'a pas pu démarrer (l'app continue alors sans). */
  faceError: string | null;
}
