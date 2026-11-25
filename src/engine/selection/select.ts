// Sélection : quelles photos garder dans un paquet.
// Pas de quota (utilisateur, 17/11). Dans une pose : la meilleure, plus les photos bonnes et nettement différentes
// (utilisateur, 19/11). On garde au moins une photo par paquet, sauf si toutes sont ratées.

/** Quasi-doublons : même photo à peu de chose près. */
function nearDuplicate(a: MediaItem, b: MediaItem): boolean {
  const similar = embeddingSimilarity(a.embedding, b.embedding);
  if (similar !== null) return similar >= config.selection.nearDuplicateSimilar;
  return signatureDistance(a.signature, b.signature) < config.selection.nearDuplicate;
}

import { config } from '../config';
import { signatureDistance } from '../analysis/color';
import { embeddingSimilarity } from '../analysis/embedding';
import type { Decision, MediaItem, PhotoScore, PoseGroup } from '../types';
import { poseDifference, type DifferenceLevel, type PoseDifference } from './difference';

const RANK: Record<DifferenceLevel, number> = { aucune: 0, legere: 1, nette: 2 };

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
  // Photo ratée en elle-même (défaut rédhibitoire, très floue) : jamais gardée d'office.
  const vetoed = (item: MediaItem) => scores.get(item.id)?.failed ?? scores.get(item.id)?.vetoed ?? false;
  const set = (item: MediaItem, d: Omit<Decision, 'pose'>) => decisions.set(item.id, { ...d, pose: poseOf.get(item.id) ?? 'A' });

  // Paquet entièrement raté : tout peut être supprimé (choix de l'utilisateur, 17/11).
  if (items.length > 0 && items.every(vetoed)) {
    for (const item of items) set(item, { keep: false, code: 'ratee' });
    return decisions;
  }

  if (items.length === 1) {
    // Seule photo du paquet, mais probablement prise par erreur (pied, sol, flou) : l'utilisateur tranche.
    set(items[0]!, scores.get(items[0]!.id)?.accidental ? { keep: true, review: true, code: 'a-verifier' } : { keep: true, code: 'seule' });
    return decisions;
  }

  for (const group of poses) {
    const candidates = group.items.filter((item) => !vetoed(item)).sort((a, b) => scoreOf(b) - scoreOf(a));
    for (const item of group.items.filter(vetoed)) set(item, { keep: false, code: 'veto' });
    if (candidates.length === 0) continue;

    const best = candidates[0]!;
    const groupKept = [best];
    // Photo probablement prise par erreur : jamais gardée d'office, l'utilisateur tranche.
    if (scores.get(best.id)?.accidental) set(best, { keep: true, review: true, code: 'a-verifier' });
    else set(best, { keep: true, code: 'meilleure' });

    // Autres photos de la pose (utilisateur, 19/11) : gardées si bonnes ET différentes de chaque photo déjà gardée ;
    // à vérifier si légèrement différentes ou un peu moins bonnes ; supprimées si identiques ou nettement moins bonnes.
    for (const pick of candidates.slice(1)) {
      const gap = scoreOf(best) - scoreOf(pick);
      // Quasi identique à l'image, sauf si un visage change nettement (un sourire bouge à peine l'empreinte).
      const twin = groupKept.find((k) => nearDuplicate(pick, k) && poseDifference(pick, k).level !== 'nette');
      if (twin) {
        set(pick, { keep: false, code: 'trop-proche', refId: twin.id });
        continue;
      }
      // Différence avec la photo gardée la plus proche : c'est elle qui compte.
      let closest: { ref: MediaItem; diff: PoseDifference } | null = null;
      for (const k of groupKept) {
        const diff = poseDifference(pick, k);
        if (!closest || RANK[diff.level] < RANK[closest.diff.level]) closest = { ref: k, diff };
      }
      const blocked = (scores.get(pick.id)?.reasons ?? []).some((r) => cfg.blocking.includes(r.code)) || scores.get(pick.id)?.accidental;
      const diff = closest!.diff;
      if (diff.level === 'aucune') set(pick, { keep: false, code: 'trop-proche', refId: closest!.ref.id });
      else if (!blocked && diff.level === 'nette' && gap <= cfg.keepMargin + 1e-9) {
        groupKept.push(pick);
        set(pick, { keep: true, code: 'differente', refId: best.id, differences: diff.kinds });
      } else if (!blocked && gap <= cfg.reviewMargin + 1e-9) {
        // Presque aussi bonne, un peu différente : proposée à la suppression (utilisateur, 25/11, point 55), signalée
        // pour qu'on la regarde. Elle ne compte pas parmi les photos gardées de la pose.
        set(pick, { keep: false, code: 'presque', refId: best.id, differences: diff.kinds });
      } else set(pick, { keep: false, code: 'moins-bonne', refId: best.id });
    }
  }

  // Au moins une photo par paquet.
  if (![...decisions.values()].some((d) => d.keep)) {
    const best = [...items].sort((a, b) => (scores.get(a.id)?.rank ?? 99) - (scores.get(b.id)?.rank ?? 99))[0]!;
    set(best, { keep: true, code: 'minimum' });
  }
  return decisions;
}
