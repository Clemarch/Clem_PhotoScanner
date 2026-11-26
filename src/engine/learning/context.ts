// Vocabulaire de contexte du nouvel œil (jalon 8, point 62) : pour chaque photo déjà regardée par SigLIP 2, à quel point
// elle correspond à chacune des idées du vocabulaire (« méditation », « quelqu'un regarde ailleurs », « lumière dorée »…).
// Les phrases ont été converties une fois en nombres (`tools/vocab/build.py`) : aucun modèle de plus sur l'iPhone, et tout
// l'historique en profite dès qu'une idée est ajoutée. Moteur pur.

import { config } from '../config';
import type { ChoiceRecord } from '../types';
import { decodeEmbedding } from './embeddingCodec';
import { VOCAB } from './vocab.generated';

export interface ContextIdea {
  id: string;
  label: string;
  family: string;
}

let ideas: ContextIdea[] | null = null;
/** Les idées du vocabulaire (lues à la demande : l'écran principal n'embarque pas le vocabulaire). */
export function contextIdeas(): readonly ContextIdea[] {
  ideas ??= VOCAB.map(([id, label, family]) => ({ id, label, family }));
  return ideas;
}

let directions: Float32Array[] | null = null;
/** Directions du texte, normalisées (décodées une fois). */
function textDirections(): Float32Array[] {
  if (!directions)
    directions = VOCAB.map(([, , , v]) => {
      const raw = decodeEmbedding(v)!;
      const n = Math.hypot(...raw) || 1;
      return Float32Array.from(raw, (x) => x / n);
    });
  return directions;
}

const cache = new Map<string, Float32Array | null>();

/** Ressemblance (cosinus) de la photo avec chaque idée, ou null si le nouvel œil ne l'a pas encore regardée. */
export function contextScores(r: Pick<ChoiceRecord, 'key' | 'clip'>): Float32Array | null {
  const cacheKey = `${r.key}|${r.clip?.length ?? 0}|${r.clip?.slice(0, 16) ?? ''}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;
  const clip = decodeEmbedding(r.clip);
  let out: Float32Array | null = null;
  if (clip && clip.length === config.ranker.eyeDims) {
    const n = Math.hypot(...clip) || 1;
    const dirs = textDirections();
    out = new Float32Array(dirs.length);
    for (let j = 0; j < dirs.length; j++) {
      const d = dirs[j]!;
      let s = 0;
      for (let i = 0; i < clip.length; i++) s += clip[i]! * d[i]!;
      out[j] = s / n;
    }
  }
  if (cache.size > 20000) cache.clear();
  cache.set(cacheKey, out);
  return out;
}

/** Idées retenues pour classer les photos d'une même pose (`config.context.families`). */
export function rankingIdeas(): number[] {
  const keep = new Set<string>(config.context.families);
  return contextIdeas().flatMap((idea, i) => (keep.has(idea.family) ? [i] : []));
}

/**
 * Moyenne et écart de chaque idée sur des photos : les scores bruts n'ont pas la même échelle d'une idée à l'autre.
 * Calculés sur les photos d'apprentissage seulement (rien n'est appris sur la séance testée).
 */
export function contextStats(records: Iterable<Pick<ChoiceRecord, 'key' | 'clip'>>): { mean: Float32Array; sd: Float32Array } | null {
  const n = VOCAB.length;
  const sum = new Float64Array(n);
  const sq = new Float64Array(n);
  let count = 0;
  for (const r of records) {
    const s = contextScores(r);
    if (!s) continue;
    count++;
    for (let j = 0; j < n; j++) {
      sum[j]! += s[j]!;
      sq[j]! += s[j]! * s[j]!;
    }
  }
  if (count < 2) return null;
  const mean = Float32Array.from(sum, (v) => v / count);
  const sd = Float32Array.from(sq, (v, j) => Math.sqrt(Math.max(v / count - mean[j]! * mean[j]!, 0)) + 1e-6);
  return { mean, sd };
}

/** Les idées qui décrivent le mieux une photo (pour l'écran « ce que l'œil voit »). */
export function topIdeas(r: Pick<ChoiceRecord, 'key' | 'clip'>, stats: { mean: Float32Array; sd: Float32Array }, count = 6): { idea: ContextIdea; z: number }[] {
  const s = contextScores(r);
  if (!s) return [];
  return contextIdeas().map((idea, j) => ({ idea, z: (s[j]! - stats.mean[j]!) / stats.sd[j]! }))
    .sort((a, b) => b.z - a.z)
    .slice(0, count);
}
