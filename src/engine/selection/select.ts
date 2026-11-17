// Sélection : quelles photos garder dans un paquet.
// Le quota est un plafond, jamais un objectif ; on garde toujours au moins une photo par paquet.

import { config } from '../config';
import { signatureDistance } from '../analysis/color';
import type { Decision, MediaItem, PhotoScore, PoseGroup } from '../types';

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

    // Choix suivants, dans l'ordre des notes : la qualité d'abord. On saute seulement les quasi-doublons
    // (deux fois la même photo) ; une photo n'est jamais écartée au profit d'une moins bonne.
    for (const pick of candidates.slice(1)) {
      const nearest = groupKept
        .map((k) => ({ k, d: signatureDistance(pick.signature, k.signature) }))
        .sort((x, y) => x.d - y.d)[0]!;
      const keptIds = groupKept.map((k) => k.id);
      if (scoreOf(pick) < scoreOf(best) - cfg.scoreMargin) set(pick, { keep: false, code: 'moins-bonne', refId: best.id, keptIds });
      else if (nearest.d < cfg.nearDuplicate) set(pick, { keep: false, code: 'trop-proche', refId: nearest.k.id });
      else if (groupKept.length >= budget) set(pick, { keep: false, code: 'budget', refId: best.id, keptIds });
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
    const keptIds = ordered.slice(0, cap).map((item) => item.id);
    for (const item of ordered.slice(cap)) set(item, { keep: false, code: 'plafond', keptIds });
  }

  // Au moins une photo par paquet.
  if (![...decisions.values()].some((d) => d.keep)) {
    const best = [...items].sort((a, b) => (scores.get(a.id)?.rank ?? 99) - (scores.get(b.id)?.rank ?? 99))[0]!;
    set(best, { keep: true, code: 'minimum' });
  }
  return decisions;
}
