// Décision finale d'une photo : le choix de l'utilisateur s'il en a fait un, sinon celui de l'app.

import { FEATURES_VERSION, config, emotionSummary, decodeEmbedding, encodeEmbedding, mainFaces, photoKey, type ChoiceRecord, type MediaItem, type PackAnalysis } from '../engine';

/** Empreintes des visages principaux recadrés (les plus grands d'abord), codées ; absentes si non calculées. */
export function faceClipsOf(item: MediaItem): string[] | undefined {
  const out = mainFaces(item.faces)
    .filter((f) => f.clip?.length === config.ranker.eyeDims)
    .sort((a, b) => b.areaRatio - a.areaRatio)
    .flatMap((f) => encodeEmbedding(f.clip!) ?? []);
  return out.length ? out : undefined;
}

/**
 * Photo que le nouvel œil doit (re)voir : jamais vue, ou vue avant qu'il regarde aussi les visages un par un
 * (point 63) alors qu'elle en a. RAW, vidéos, captures et photos en échec sont exclus ailleurs.
 */
export function needsEye(item: MediaItem): boolean {
  if (item.clip?.length !== config.ranker.eyeDims) return true;
  return mainFaces(item.faces).length > 0 && (item.eyeV ?? 1) < config.ranker.eyeVersion;
}

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
  if (record) return { keep: record.choice === 'garder', byUser: !record.implicit, review: false };
  const decision = pack.decisions.get(item.id);
  return { keep: decision?.keep ?? true, byUser: false, review: decision?.review === true };
}

/** Classe et pastille d'une vignette selon son état. */
export function stateLook(state: FinalState): { css: string; mark: string; label: string } {
  if (state.review) return { css: 'verifier', mark: '?', label: 'à vérifier' };
  return state.keep ? { css: 'garder', mark: '✓', label: 'à garder' } : { css: 'supprimer', mark: '✕', label: 'à supprimer' };
}

/** `implicit` : accord silencieux avec l'app (photo laissée telle quelle, puis envoyée à la suppression). */
export function makeRecord(item: MediaItem, pack: PackAnalysis, choice: Choice, implicit = false, via?: 'pose'): ChoiceRecord {
  const score = pack.scores.get(item.id)!;
  const embedding = encodeEmbedding(item.embedding);
  const clip = encodeEmbedding(item.clip ?? null);
  const emo = emotionSummary(item);
  const fclip = faceClipsOf(item);
  return { key: photoKey(item), packKey: pack.key, choice, features: score.features, baseScore: score.baseScore, at: Date.now(), v: FEATURES_VERSION, ...(embedding ? { embedding } : {}), ...(implicit ? { implicit: true } : {}),
    ...(via ? { via } : {}),
    // Proposition de l'app à cet instant (« à vérifier » compte comme gardée) : mesure honnête de sa justesse.
    app: pack.decisions.get(item.id)?.keep === false ? 'supprimer' : 'garder',
    // « Nouvel œil » (en coulisse) : empreinte CLIP et émotions des visages, si elles ont été mesurées.
    ...(clip ? { clip } : {}),
    ...(emo ? { emo } : {}),
    ...(fclip ? { fclip } : {}) };
}

/**
 * Choix faits avant que le nouvel œil ait fini de regarder leurs photos (il tourne en arrière-plan pendant que l'on
 * trie) : complétés avec son empreinte et les émotions des visages dès qu'elles existent. Sans cela, presque aucune
 * séance n'avait ces mesures et la comparaison du nouvel œil n'apparaissait jamais (25/11). Rien d'autre ne change.
 */
export function eyePatches(records: readonly ChoiceRecord[], items: readonly MediaItem[]): ChoiceRecord[] {
  const byKey = new Map(items.map((it) => [photoKey(it), it]));
  const out: ChoiceRecord[] = [];
  for (const r of records) {
    const it = byKey.get(r.key);
    // Seulement l'empreinte du nouvel œil actuel (SigLIP 2) : les anciennes (CLIP) n'ont pas la même taille.
    if (!it?.clip || it.clip.length !== config.ranker.eyeDims) continue;
    const hasClip = r.clip?.length && decodeEmbedding(r.clip)?.length === config.ranker.eyeDims;
    const fclip = r.fclip ? undefined : faceClipsOf(it);
    if (hasClip && !fclip) continue;
    const clip = hasClip ? r.clip : encodeEmbedding(it.clip);
    if (!clip) continue;
    // Émotions : celles du dernier passage de l'œil sur la photo (identiques, ou mesurées plus finement).
    const emo = emotionSummary(it) ?? r.emo;
    out.push({ ...r, clip, ...(emo ? { emo } : {}), ...(fclip ? { fclip } : {}) });
  }
  return out;
}

/** Choix complété par les mesures du nouvel œil d'un correctif (`eyePatches`), sans toucher au reste du choix. */
export function withEye(r: ChoiceRecord, patch: ChoiceRecord): ChoiceRecord {
  return { ...r, ...(patch.clip ? { clip: patch.clip } : {}), ...(patch.emo ? { emo: patch.emo } : {}), ...(patch.fclip ? { fclip: patch.fclip } : {}) };
}
