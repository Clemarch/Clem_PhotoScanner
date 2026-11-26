// « Nouvel œil » en coulisse (jalon 6, réglage 13) : un classement personnel appris sur les poses validées dans le tri
// éclair, à partir des mesures actuelles, des émotions des visages (HSEmotion) et de l'empreinte CLIP. Il ne décide
// rien : on mesure honnêtement s'il devine mieux que la formule quelle photo vous gardez, en testant chaque séance
// avec un apprentissage fait sur les autres séances seulement. Moteur pur.

import { config } from '../config';
import { mainFaces } from '../analysis/faces';
import { FEATURE_NAMES, type ChoiceRecord, type MediaItem } from '../types';
import { decodeEmbedding } from './embeddingCodec';
import { unusable, type PoseValidation } from '../triage/calibration';

const HAPPY = 4;
const NEUTRAL = 5;
const NEGATIVE = [0, 1, 2, 3, 6];

/**
 * Résumé des émotions des visages principaux (ceux qui comptent dans la photo) :
 * [valence la plus basse, valence moyenne, joie la plus basse, joie moyenne, neutre le plus haut, négatif le plus haut].
 * Null si aucun visage n'a été mesuré.
 */
export function emotionSummary(item: MediaItem): number[] | null {
  const emotions = mainFaces(item.faces)
    .map((f) => f.emotion)
    .filter((e): e is NonNullable<typeof e> => !!e);
  if (emotions.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const valence = emotions.map((e) => e.valence);
  const happy = emotions.map((e) => e.probs[HAPPY] ?? 0);
  const neutral = emotions.map((e) => e.probs[NEUTRAL] ?? 0);
  const negative = emotions.map((e) => NEGATIVE.reduce((s, k) => s + (e.probs[k] ?? 0), 0));
  return [Math.min(...valence), mean(valence), Math.min(...happy), mean(happy), Math.max(...neutral), Math.max(...negative)];
}

/** Vecteur d'une photo pour le classement : mesures actuelles, émotions (et si elles existent), empreinte CLIP. */
export function eyeVector(r: ChoiceRecord): number[] | null {
  const clip = decodeEmbedding(r.clip);
  // Seulement les empreintes du modèle actuel (SigLIP 2, 768 valeurs) : celles de CLIP (512, réglage 13) ne se comparent pas.
  if (!clip || clip.length !== config.ranker.eyeDims) return null;
  const norm = Math.hypot(...clip) || 1;
  const c = config.ranker;
  const emo = r.emo && r.emo.length === 6 ? r.emo : null;
  return [
    ...FEATURE_NAMES.map((name) => r.features[name] ?? 0.5),
    ...(emo ?? [0, 0, 0, 0, 0, 0]),
    emo ? 1 : 0,
    ...Array.from(clip, (v) => (v / norm) * c.clipScale),
  ];
}

export interface RankerModel {
  w: number[];
}

/** Régression logistique sans constante sur les différences (gardée − supprimée), avec un frein (L2) contre le par-cœur. */
export function trainRanker(pairs: readonly { keep: number[]; drop: number[] }[]): RankerModel | null {
  if (pairs.length === 0) return null;
  const c = config.ranker;
  const dims = pairs[0]!.keep.length;
  const diffs = pairs.map((p) => p.keep.map((v, i) => v - p.drop[i]!));
  const w = new Array<number>(dims).fill(0);
  for (let it = 0; it < c.iterations; it++) {
    const grad = new Array<number>(dims).fill(0);
    for (const d of diffs) {
      let z = 0;
      for (let i = 0; i < dims; i++) z += w[i]! * d[i]!;
      const g = -1 / (1 + Math.exp(z)); // dérivée de log(1 + e^(−z))
      for (let i = 0; i < dims; i++) grad[i]! += (g * d[i]!) / diffs.length;
    }
    for (let i = 0; i < dims; i++) w[i]! -= c.rate * (grad[i]! + c.lambda * w[i]!);
  }
  return { w };
}

export const rankScore = (model: RankerModel, x: readonly number[]): number => model.w.reduce((s, wi, i) => s + wi * x[i]!, 0);

export interface ShadowComparison {
  /** Séances qui ont des poses validées exploitables. */
  sessions: number;
  /** Paires « gardée / supprimée » exploitables (avec empreinte CLIP). */
  pairs: number;
  /** Paires testées (séance testée avec un apprentissage fait sur les autres). */
  tested: number;
  /** Paires où la formule actuelle met la photo gardée devant. */
  formula: number;
  /** Paires où le nouvel œil met la photo gardée devant. */
  eye: number;
  /** Même décompte, séance par séance (séances testées seulement). */
  bySession: { sessionId: string; tested: number; formula: number; eye: number }[];
}

/** Comparaison honnête, séance par séance, entre la formule et le classement personnel. */
export function shadowCompare(validations: readonly PoseValidation[], records: readonly ChoiceRecord[]): ShadowComparison {
  const byKey = new Map(records.map((r) => [r.key, r]));
  // Vecteur calculé une fois par photo (une photo gardée figure dans autant de paires que de photos supprimées).
  const vectors = new Map<string, number[] | null>();
  const vectorOf = (key: string): number[] | null => {
    if (!vectors.has(key)) {
      const r = byKey.get(key);
      vectors.set(key, r ? eyeVector(r) : null);
    }
    return vectors.get(key)!;
  };
  type Pair = { keep: number[]; drop: number[]; formula: boolean; keys: readonly [string, string] };
  const pairsBySession = new Map<string, Pair[]>();
  for (const v of validations) {
    if (unusable(v)) continue;
    const kept = v.keys.filter((k) => v.kept.includes(k));
    const dropped = v.keys.filter((k) => !v.kept.includes(k));
    for (const a of kept)
      for (const b of dropped) {
        const ra = byKey.get(a);
        const rb = byKey.get(b);
        const xa = vectorOf(a);
        const xb = vectorOf(b);
        if (!ra || !rb || !xa || !xb) continue;
        const list = pairsBySession.get(v.sessionId) ?? [];
        list.push({ keep: xa, drop: xb, formula: ra.baseScore > rb.baseScore, keys: [a, b] });
        pairsBySession.set(v.sessionId, list);
      }
  }
  const out: ShadowComparison = { sessions: pairsBySession.size, pairs: 0, tested: 0, formula: 0, eye: 0, bySession: [] };
  for (const list of pairsBySession.values()) out.pairs += list.length;
  for (const [session, test] of pairsBySession) {
    // Une même photo peut figurer dans plusieurs séances (journée analysée deux fois) : ses paires sont retirées de
    // l'apprentissage, sinon la séance testée serait apprise par cœur.
    const testKeys = new Set(test.flatMap((p) => p.keys));
    const train = [...pairsBySession]
      .filter(([s]) => s !== session)
      .flatMap(([, l]) => l)
      .filter((p) => !testKeys.has(p.keys[0]) && !testKeys.has(p.keys[1]));
    if (train.length < config.ranker.minTrainPairs) continue;
    // Au plus `maxTrainPairs` paires, prises à intervalles réguliers : le calcul reste court sur l'iPhone.
    const step = Math.max(1, train.length / config.ranker.maxTrainPairs);
    const sample = train.length > config.ranker.maxTrainPairs ? Array.from({ length: config.ranker.maxTrainPairs }, (_, i) => train[Math.floor(i * step)]!) : train;
    const model = trainRanker(sample)!;
    const here = { sessionId: session, tested: 0, formula: 0, eye: 0 };
    for (const p of test) {
      here.tested++;
      if (p.formula) here.formula++;
      if (rankScore(model, p.keep) > rankScore(model, p.drop)) here.eye++;
    }
    out.tested += here.tested;
    out.formula += here.formula;
    out.eye += here.eye;
    out.bySession.push(here);
  }
  return out;
}
