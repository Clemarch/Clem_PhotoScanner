// Sélection : quelles photos garder dans un paquet.
// Le quota est un plafond, jamais un objectif ; on garde toujours au moins une photo par paquet.

import { config } from '../config';
import { signatureDistance } from '../analysis/color';
import type { Decision, MediaItem, PhotoScore, PoseGroup } from '../types';

/** Ressemblance entre deux photos, entre 0 (différentes) et 1 (identiques). */
function similarity(a: MediaItem, b: MediaItem): number {
  const d = signatureDistance(a.signature, b.signature);
  if (d === Infinity) return 0.5;
  return Math.max(0, 1 - d / (2 * config.poses.fromFirst));
}

export function selectPack(
  items: readonly MediaItem[],
  scores: ReadonlyMap<string, PhotoScore>,
  poses: readonly PoseGroup[],
): Map<string, Decision> {
  const cfg = config.selection;
  const decisions = new Map<string, Decision>();
  const poseOf = new Map<string, string>();
  for (const group of poses) for (const item of group.items) poseOf.set(item.id, group.label);
  const scoreOf = (item: MediaItem) => scores.get(item.id)?.score ?? 0;
  const vetoed = (item: MediaItem) => scores.get(item.id)?.vetoed ?? false;
  const set = (item: MediaItem, d: Omit<Decision, 'pose'>) => decisions.set(item.id, { ...d, pose: poseOf.get(item.id) ?? 'A' });

  if (items.length === 1) {
    set(items[0]!, { keep: true, code: 'seule' });
    return decisions;
  }

  const kept: MediaItem[] = [];
  for (const group of poses) {
    const candidates = group.items.filter((item) => !vetoed(item)).sort((a, b) => scoreOf(b) - scoreOf(a));
    for (const item of group.items.filter(vetoed)) set(item, { keep: false, code: 'veto' });
    if (candidates.length === 0) continue;

    const budget = Math.max(1, Math.ceil(cfg.poseShare * group.items.length));
    const best = candidates[0]!;
    const groupKept = [best];
    set(best, { keep: true, code: 'meilleure' });

    // Choix suivants : bonne note et différente de ce qui est déjà gardé.
    let remaining = candidates.slice(1);
    while (remaining.length > 0) {
      const pick = remaining
        .map((item) => ({
          item,
          value:
            cfg.diversityScore * scoreOf(item) +
            cfg.diversityWeight * (1 - Math.max(...groupKept.map((k) => similarity(item, k)))),
        }))
        .sort((a, b) => b.value - a.value)[0]!.item;
      remaining = remaining.filter((item) => item !== pick);
      const nearest = groupKept
        .map((k) => ({ k, d: signatureDistance(pick.signature, k.signature) }))
        .sort((a, b) => a.d - b.d)[0]!;
      if (groupKept.length >= budget) set(pick, { keep: false, code: 'budget', refId: best.id });
      else if (scoreOf(pick) < scoreOf(best) - cfg.scoreMargin) set(pick, { keep: false, code: 'moins-bonne', refId: best.id });
      else if (nearest.d < cfg.nearDuplicate) set(pick, { keep: false, code: 'trop-proche', refId: nearest.k.id });
      else {
        groupKept.push(pick);
        set(pick, { keep: true, code: 'variete' });
      }
    }
    kept.push(...groupKept);
  }

  // Plafond du paquet : au-delà, on retire les moins bien notées.
  const cap = Math.max(1, Math.ceil(cfg.packShare * items.length));
  if (kept.length > cap) {
    const ordered = [...kept].sort((a, b) => scoreOf(b) - scoreOf(a));
    for (const item of ordered.slice(cap)) set(item, { keep: false, code: 'plafond' });
  }

  // Au moins une photo par paquet.
  if (![...decisions.values()].some((d) => d.keep)) {
    const best = [...items].sort((a, b) => (scores.get(a.id)?.rank ?? 99) - (scores.get(b.id)?.rank ?? 99))[0]!;
    set(best, { keep: true, code: 'minimum' });
  }
  return decisions;
}
