import type { DeviceReport } from '../platform/device';
import type { AnalyzeResult } from '../platform/image/types';

/** Résultat d'une analyse complète (une journée de photos). */
export interface Session {
  results: AnalyzeResult[];
  /** Adresse locale de chaque miniature (jamais envoyée nulle part). */
  thumbnails: Map<string, string>;
  totalMs: number;
  cancelled: boolean;
  wakeLock: boolean;
  heapBeforeMB: number | null;
  heapAfterMB: number | null;
  device: DeviceReport;
}
