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
  scores: Map<string, PhotoScore>;
  poses: PoseGroup[];
  /** Décision de l'app. */
  decisions: Map<string, Decision>;
}

export interface DayAnalysis {
  packs: PackAnalysis[];
  undated: MediaItem[];
  setAside: MediaItem[];
  dayIndex: Map<string, number>;
}

export function analyzeDay(items: readonly MediaItem[], gapSeconds: number, learned: LearnedWeights = {}): DayAnalysis {
  const day = groupIntoPacks(items, gapSeconds);
  const packs = day.packs.map((pack): PackAnalysis => {
    const { scene, scores } = scorePackDetailed(pack.items, learned);
    const poses = groupPoses(pack.items);
    return { pack, key: String(pack.startAt ?? pack.id), scene, scores, poses, decisions: selectPack(pack.items, scores, poses) };
  });
  return { packs, undated: day.undated, setAside: day.setAside, dayIndex: day.dayIndex };
}
