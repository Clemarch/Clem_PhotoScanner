// File du tri éclair : les poses où il y a un choix à faire, dans l'ordre de la journée, avec la proposition de l'app.

import { photoKey, type DayAnalysis, type PackAnalysis } from '../pipeline';
import type { MediaItem, PoseGroup } from '../types';
import { isSure, type Calibration } from './calibration';

export interface PoseTask {
  /** Identifiant stable de la pose : paquet et première photo. */
  key: string;
  packNumber: number;
  pack: PackAnalysis;
  pose: PoseGroup;
  items: MediaItem[];
  /** Photos que l'app (ou l'utilisateur, s'il a déjà choisi) propose de garder. */
  proposed: Set<string>;
  /** Photos que l'app elle-même propose de garder (sans les choix déjà faits) : mesure de sa justesse. */
  appProposed: Set<string>;
  /** Photos « à vérifier » (presque aussi bonnes) : signalées dans l'écran. */
  review: Set<string>;
  /** Écart de note entre la meilleure photo et la suivante (Infinity : photo seule). */
  margin: number;
  /** L'app a fait ses preuves à cet écart : pose montrée seulement à la demande. */
  sure: boolean;
}

export const poseKey = (pack: PackAnalysis, pose: PoseGroup): string => `${pack.key}|${photoKey(pose.items[0]!)}`;

export function poseMargin(pack: PackAnalysis, pose: PoseGroup): number {
  const scores = pose.items.map((it) => pack.scores.get(it.id)?.score ?? 0).sort((a, b) => b - a);
  return scores.length < 2 ? Infinity : scores[0]! - scores[1]!;
}

/**
 * `state(item, pack)` : décision finale actuelle (garder ? à vérifier ?), choix de l'utilisateur compris.
 * Une pose entre dans la file si elle demande un choix : 2 photos ou plus, ou une photo seule proposée à la
 * suppression ou « à vérifier ».
 */
export function buildQueue(
  day: DayAnalysis,
  state: (item: MediaItem, pack: PackAnalysis) => { keep: boolean; review: boolean },
  calibration: Calibration,
): PoseTask[] {
  const tasks: PoseTask[] = [];
  day.packs.forEach((pack, i) => {
    for (const pose of pack.poses) {
      const states = pose.items.map((it) => state(it, pack));
      const single = pose.items.length === 1;
      if (single && states[0]!.keep && !states[0]!.review) continue;
      const margin = poseMargin(pack, pose);
      tasks.push({
        key: poseKey(pack, pose),
        packNumber: i + 1,
        pack,
        pose,
        items: pose.items,
        proposed: new Set(pose.items.filter((_, k) => states[k]!.keep).map((it) => it.id)),
        appProposed: new Set(pose.items.filter((it) => pack.decisions.get(it.id)?.keep !== false).map((it) => it.id)),
        review: new Set(pose.items.filter((_, k) => states[k]!.review).map((it) => it.id)),
        margin,
        sure: !single && isSure(margin, calibration),
      });
    }
  });
  return tasks;
}
