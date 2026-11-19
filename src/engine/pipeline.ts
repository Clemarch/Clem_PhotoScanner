// Enchaîne les étapes pour une journée : paquets, notes, poses, sélection, choix de l'utilisateur.

import { groupIntoPacks } from './grouping/packs';
import { groupPoses } from './grouping/poses';
import { scorePackDetailed } from './scoring/pack';
import { selectPack } from './selection/select';
import type { Decision, LearnedWeights, MediaItem, Pack, PhotoScore, PoseGroup, SceneType } from './types';

/** Identifiant stable d'une photo d'une analyse à l'autre : nom de fichier et date de prise de vue. */
export const photoKey = (item: MediaItem): string => `${item.fileName}|${item.capturedAt ?? ''}`;

export interface PackAnalysis {
  pack: Pack;
  /** Identifiant stable du paquet (date de sa première photo). */
  key: string;
  scene: SceneType;
  /** Type de chaque photo, décidé par groupe de pose (un paquet peut mêler personnes et paysages). */
  sceneOf: Map<string, SceneType>;
  scores: Map<string, PhotoScore>;
  poses: PoseGroup[];
  /** Décision de l'app. */
  decisions: Map<string, Decision>;
  /** Paquets rattachés à celui-ci à la main par l'utilisateur (clés d'origine). */
  joined: string[];
}

export interface DayAnalysis {
  packs: PackAnalysis[];
  undated: MediaItem[];
  setAside: MediaItem[];
  dayIndex: Map<string, number>;
}

const packKey = (pack: Pack): string => String(pack.startAt ?? pack.id);

/** Rattache à la main un paquet au précédent (une même série prise sur plusieurs minutes, ex. par le hublot). */
function joinPacks(packs: readonly Pack[], joinWithPrevious: ReadonlySet<string>): { pack: Pack; joined: string[] }[] {
  const out: { pack: Pack; joined: string[] }[] = [];
  for (const pack of packs) {
    const previous = out[out.length - 1];
    if (previous && joinWithPrevious.has(packKey(pack))) {
      previous.pack = { ...previous.pack, items: [...previous.pack.items, ...pack.items], endAt: pack.endAt };
      previous.joined.push(packKey(pack));
    } else out.push({ pack, joined: [] });
  }
  return out;
}

/** `joinWithPrevious` : clés des paquets que l'utilisateur a rattachés au paquet précédent. */
export function analyzeDay(
  items: readonly MediaItem[],
  gapSeconds: number,
  learned: LearnedWeights = {},
  joinWithPrevious: ReadonlySet<string> = new Set(),
  /** Paquets découpés selon ce que montrent les photos (vrai) ou selon le temps seulement (faux). */
  byContent = false,
): DayAnalysis {
  const day = groupIntoPacks(items, gapSeconds, byContent);
  const packs = joinPacks(day.packs, joinWithPrevious).map(({ pack, joined }): PackAnalysis => {
    const poses = groupPoses(pack.items);
    const { scene, sceneOf, scores } = scorePackDetailed(
      pack.items,
      learned,
      poses.map((pose) => pose.items),
    );
    return { pack, key: packKey(pack), scene, sceneOf, scores, poses, decisions: selectPack(pack.items, scores, poses), joined };
  });
  return { packs, undated: day.undated, setAside: day.setAside, dayIndex: day.dayIndex };
}
