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
  /** Écran « Photos seules » (point 74) : les poses d'une seule photo, réunies ; chacune est validée à part. */
  parts?: PoseTask[];
}

/**
 * Ordre du tri éclair (utilisateur, 28/11, point 74) : d'abord les poses de plusieurs photos, à comparer ; puis un seul
 * écran avec toutes les photos restées seules, à valider d'un coup.
 */
export function singlesLast(tasks: readonly PoseTask[]): PoseTask[] {
  const poses = tasks.filter((t) => t.items.length > 1 || t.parts);
  const singles = tasks.filter((t) => t.items.length === 1 && !t.parts);
  if (singles.length <= 1) return [...poses, ...singles];
  const first = singles[0]!;
  const union = (pick: (t: PoseTask) => Set<string>) => new Set(singles.flatMap((t) => [...pick(t)]));
  return [
    ...poses,
    {
      ...first,
      key: `seules|${first.key}`,
      items: singles.flatMap((t) => t.items),
      proposed: union((t) => t.proposed),
      appProposed: union((t) => t.appProposed),
      review: union((t) => t.review),
      margin: Infinity,
      sure: false,
      parts: singles,
    },
  ];
}

export const poseKey = (pack: PackAnalysis, pose: PoseGroup): string => `${pack.key}|${photoKey(pose.items[0]!)}`;

export function poseMargin(pack: PackAnalysis, pose: PoseGroup): number {
  const scores = pose.items.map((it) => pack.scores.get(it.id)?.score ?? 0).sort((a, b) => b - a);
  return scores.length < 2 ? Infinity : scores[0]! - scores[1]!;
}

/**
 * `state(item, pack)` : décision finale actuelle (garder ? à vérifier ?), choix de l'utilisateur compris.
 * Toutes les poses entrent dans la file, photos seules comprises (utilisateur, 27/11 : « je souhaite toutes les voir,
 * avec la décision de les supprimer ou non » ; une photo bougée, seule et gardée, ne lui avait jamais été montrée).
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
      const margin = poseMargin(pack, pose);
      tasks.push({
        key: poseKey(pack, pose),
        packNumber: i + 1,
        pack,
        pose,
        items: pose.items,
        proposed: new Set(pose.items.filter((_, k) => states[k]!.keep).map((it) => it.id)),
        appProposed: new Set(pose.items.filter((it) => pack.decisions.get(it.id)?.keep !== false).map((it) => it.id)),
        // « À vérifier », ou presque aussi bonne (proposée à la suppression, 25/11) : signalée dans le tri éclair.
        review: new Set(pose.items.filter((it, k) => states[k]!.review || pack.decisions.get(it.id)?.code === 'presque').map((it) => it.id)),
        margin,
        sure: !single && isSure(margin, calibration),
      });
    }
  });
  return tasks;
}
