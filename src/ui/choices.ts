// Décision finale d'une photo : le choix de l'utilisateur s'il en a fait un, sinon celui de l'app.

import { FEATURES_VERSION, encodeEmbedding, photoKey, type ChoiceRecord, type MediaItem, type PackAnalysis } from '../engine';

export type Choice = 'garder' | 'supprimer';

export interface Choices {
  byKey: Map<string, ChoiceRecord>;
}

/** `review` : « à vérifier », l'utilisateur n'a pas encore tranché ; la photo reste gardée en attendant. */
export interface FinalState {
  keep: boolean;
  byUser: boolean;
  review: boolean;
}

export function finalKeep(item: MediaItem, pack: PackAnalysis, choices: Choices): FinalState {
  const record = choices.byKey.get(photoKey(item));
  if (record) return { keep: record.choice === 'garder', byUser: true, review: false };
  const decision = pack.decisions.get(item.id);
  return { keep: decision?.keep ?? true, byUser: false, review: decision?.review === true };
}

/** Classe et pastille d'une vignette selon son état. */
export function stateLook(state: FinalState): { css: string; mark: string; label: string } {
  if (state.review) return { css: 'verifier', mark: '?', label: 'à vérifier' };
  return state.keep ? { css: 'garder', mark: '✓', label: 'à garder' } : { css: 'supprimer', mark: '✕', label: 'à supprimer' };
}

export function makeRecord(item: MediaItem, pack: PackAnalysis, choice: Choice): ChoiceRecord {
  const score = pack.scores.get(item.id)!;
  const embedding = encodeEmbedding(item.embedding);
  return { key: photoKey(item), packKey: pack.key, choice, features: score.features, baseScore: score.baseScore, at: Date.now(), v: FEATURES_VERSION, ...(embedding ? { embedding } : {}) };
}
