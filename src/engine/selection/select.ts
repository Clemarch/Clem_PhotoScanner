// Sélection : quelles photos garder dans un paquet.
// Seules les notes décident : pas de quota (retiré à la demande de l'utilisateur, 17/11 : un paquet de 2 photos peut
// garder les 2). On garde au moins une photo par paquet, sauf si toutes sont ratées.

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
    set(items[0]!, { keep: true, code: 'seule' });
    return decisions;
  }

  for (const group of poses) {
    const candidates = group.items.filter((item) => !vetoed(item)).sort((a, b) => scoreOf(b) - scoreOf(a));
    for (const item of group.items.filter(vetoed)) set(item, { keep: false, code: 'veto' });
    if (candidates.length === 0) continue;

    const best = candidates[0]!;
    const groupKept = [best];
    set(best, { keep: true, code: 'meilleure' });

    // Une photo par pose : l'app tranche (demande de l'utilisateur, 18/11 : « deux photos identiques, c'est à l'app
    // d'en supprimer une »). Seule exception : une photo de personnes presque aussi bien notée est « à vérifier ».
    const people = (scores.get(best.id)?.expectedFaces ?? 0) > 0;
    for (const pick of candidates.slice(1)) {
      const twin = groupKept.find((k) => nearDuplicate(pick, k));
      const gap = scoreOf(best) - scoreOf(pick);
      if (twin) set(pick, { keep: false, code: 'trop-proche', refId: twin.id });
      else if (people && gap <= cfg.reviewMargin + 1e-9) {
        groupKept.push(pick);
        set(pick, { keep: true, review: true, code: 'a-verifier', refId: best.id });
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
