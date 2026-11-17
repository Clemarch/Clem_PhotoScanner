// Décision finale d'une photo : le choix de l'utilisateur s'il en a fait un, sinon celui de l'app.

import { photoKey, type ChoiceRecord, type MediaItem, type PackAnalysis } from '../engine';

export type Choice = 'garder' | 'supprimer';

export interface Choices {
  byKey: Map<string, ChoiceRecord>;
}

export function finalKeep(item: MediaItem, pack: PackAnalysis, choices: Choices): { keep: boolean; byUser: boolean } {
  const record = choices.byKey.get(photoKey(item));
  if (record) return { keep: record.choice === 'garder', byUser: true };
  return { keep: pack.decisions.get(item.id)?.keep ?? true, byUser: false };
}

export function makeRecord(item: MediaItem, pack: PackAnalysis, choice: Choice): ChoiceRecord {
  const score = pack.scores.get(item.id)!;
  return { key: photoKey(item), packKey: pack.key, choice, features: score.features, baseScore: score.baseScore, at: Date.now() };
}
