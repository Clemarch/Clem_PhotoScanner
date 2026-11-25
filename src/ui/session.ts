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
  /** « Nouvel œil » : raison s'il n'a pas pu tourner (absent des séances d'avant le 21/11). */
  eyeInfo?: string | null;
  /** « Nouvel œil » : comment s'est passé son dernier démarrage (mémoire de l'analyse rendue, essais), pour le rapport. */
  eyeStart?: string | null;
  /** Photos reprises d'une analyse interrompue (non refaites). */
  resumed?: number;
  /** Photos qui avaient déjà un choix avant cette séance (déjà triées une première fois). */
  retriaged?: number;
  /** Séance reprise après une fermeture de l'app par iOS (les photos d'origine ne sont plus accessibles). */
  restored?: boolean;
  /** Séance rouverte depuis la liste des séances (les photos d'origine ne sont plus accessibles). */
  reopened?: boolean;
}
