// Journal des poses validées dans le tri éclair, et ce qu'on en tire : justesse honnête de l'app, et confiance
// calibrée (l'app ne saute une pose que si, sur les poses déjà validées au même écart de note, elle avait presque
// toujours raison). Moteur pur : aucune dépendance au navigateur.

import { config } from '../config';

/** Une pose validée par l'utilisateur dans le tri éclair. */
export interface PoseValidation {
  /** `<séance>|<pose>` : une validation par pose et par séance (la dernière l'emporte). */
  id: string;
  at: number;
  sessionId: string;
  packKey: string;
  /** Écart de note entre la meilleure photo de la pose et la suivante (Infinity : photo seule). */
  margin: number;
  /** Clés (`photoKey`) des photos de la pose. */
  keys: string[];
  /** Photos que l'app proposait de garder. */
  proposed: string[];
  /** Photos gardées par l'utilisateur. */
  kept: string[];
  /** Temps passé sur la pose (ms). */
  ms: number;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((k) => b.includes(k));

/** Validation trop rapide pour compter (tout accepté sans regarder). Une correction, même rapide, compte : on a
 *  regardé puisqu'on a changé quelque chose. */
export const tooFast = (v: PoseValidation): boolean => v.ms < config.triage.minValidMs && sameSet(v.proposed, v.kept);

/** Tranche d'écart de note (0 : très proches … dernière : très différentes). */
export function bucketOf(margin: number): number {
  const edges = config.triage.marginBuckets;
  let i = 0;
  while (i < edges.length && margin >= edges[i]!) i++;
  return i;
}

export interface Calibration {
  /** Par tranche d'écart : poses validées et poses où la proposition de l'app était exactement juste. */
  buckets: { poses: number; right: number }[];
}

export function calibrate(validations: readonly PoseValidation[]): Calibration {
  const buckets = Array.from({ length: config.triage.marginBuckets.length + 1 }, () => ({ poses: 0, right: 0 }));
  for (const v of validations) {
    if (tooFast(v) || v.keys.length < 2) continue;
    const b = buckets[bucketOf(v.margin)]!;
    b.poses++;
    if (sameSet(v.proposed, v.kept)) b.right++;
  }
  return { buckets };
}

/** La pose peut-elle être sautée ? Seulement si l'app a fait ses preuves à cet écart de note. */
export function isSure(margin: number, calibration: Calibration): boolean {
  const b = calibration.buckets[bucketOf(margin)];
  const t = config.triage;
  return !!b && b.poses >= t.sureMinPoses && b.right / b.poses >= t.sureMinRate;
}

export interface Accuracy {
  poses: { right: number; total: number };
  photos: { right: number; total: number };
}

/** Justesse de l'app sur des poses validées (validations trop rapides écartées). */
export function accuracy(validations: readonly PoseValidation[]): Accuracy {
  const out: Accuracy = { poses: { right: 0, total: 0 }, photos: { right: 0, total: 0 } };
  for (const v of validations) {
    if (tooFast(v) || v.keys.length < 2) continue;
    out.poses.total++;
    if (sameSet(v.proposed, v.kept)) out.poses.right++;
    for (const k of v.keys) {
      out.photos.total++;
      if (v.proposed.includes(k) === v.kept.includes(k)) out.photos.right++;
    }
  }
  return out;
}

/** Fusion de journaux (sauvegarde restaurée) : la validation la plus récente de chaque pose l'emporte. */
export function mergeValidations(current: readonly PoseValidation[], incoming: readonly PoseValidation[]): PoseValidation[] {
  const byId = new Map(current.map((v) => [v.id, v]));
  for (const v of incoming) {
    const existing = byId.get(v.id);
    if (!existing || v.at > existing.at) byId.set(v.id, v);
  }
  return [...byId.values()].sort((a, b) => a.at - b.at);
}
