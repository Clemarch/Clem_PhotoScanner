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

/**
 * Photos reliées à la main à une pose (28/11, « un bouton pour relier une photo seule à une pose ») : la photo quitte
 * son paquet pour celui de la photo choisie. Les paquets restent dans l'ordre de la journée ; un paquet vidé disparaît.
 */
function applyLinks(packs: { pack: Pack; joined: string[] }[], links: ReadonlyMap<string, string>): { pack: Pack; joined: string[] }[] {
  if (links.size === 0) return packs;
  const packOf = new Map<string, number>();
  packs.forEach((p, i) => p.pack.items.forEach((it) => packOf.set(photoKey(it), i)));
  const items = packs.map((p) => [...p.pack.items]);
  for (const [from, to] of links) {
    const a = packOf.get(from);
    const b = packOf.get(to);
    if (a === undefined || b === undefined || a === b) continue;
    const k = items[a]!.findIndex((it) => photoKey(it) === from);
    const [moved] = items[a]!.splice(k, 1);
    items[b]!.push(moved!);
    items[b]!.sort((x, y) => (x.capturedAt ?? 0) - (y.capturedAt ?? 0));
    packOf.set(from, b);
  }
  return packs.flatMap((p, i) =>
    items[i]!.length === 0 ? [] : [{ ...p, pack: { ...p.pack, items: items[i]!, startAt: items[i]![0]!.capturedAt, endAt: items[i]![items[i]!.length - 1]!.capturedAt } }],
  );
}

/** `joinWithPrevious` : clés des paquets que l'utilisateur a rattachés au paquet précédent. */
export function analyzeDay(
  items: readonly MediaItem[],
  gapSeconds: number,
  learned: LearnedWeights = {},
  joinWithPrevious: ReadonlySet<string> = new Set(),
  /** Paquets découpés selon ce que montrent les photos (vrai) ou selon le temps seulement (faux). */
  byContent = false,
  /** Photos reliées à la main à une autre photo (clé → clé) : même pose. */
  links: ReadonlyMap<string, string> = new Map(),
): DayAnalysis {
  const day = groupIntoPacks(items, gapSeconds, byContent);
  const packs = applyLinks(joinPacks(day.packs, joinWithPrevious), links).map(({ pack, joined }): PackAnalysis => {
    const byKey = new Map(pack.items.map((it) => [photoKey(it), it.id]));
    const forced = new Map([...links].flatMap(([from, to]) => (byKey.has(from) && byKey.has(to) ? [[byKey.get(from)!, byKey.get(to)!] as const] : [])));
    const poses = groupPoses(pack.items, forced);
    const { scene, sceneOf, scores } = scorePackDetailed(
      pack.items,
      learned,
      poses.map((pose) => pose.items),
    );
    return { pack, key: packKey(pack), scene, sceneOf, scores, poses, decisions: selectPack(pack.items, scores, poses), joined };
  });
  return { packs, undated: day.undated, setAside: day.setAside, dayIndex: day.dayIndex };
}
