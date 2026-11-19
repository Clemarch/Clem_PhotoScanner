// Goûts appris sur l'image : pour une photo, on cherche les choix passés dont l'empreinte lui ressemble le plus
// (d'autres paquets seulement) et on fait voter ces voisins : gardée +1, supprimée -1, pondéré par la ressemblance.
// En test : ce vote n'influence pas les décisions, il sert à mesurer s'il aiderait (voir evaluation.ts).

import { config } from '../config';
import type { ChoiceRecord } from '../types';
import { cosine, decodeEmbedding } from './embeddingCodec';

export interface TasteMemory {
  /** Choix avec empreinte décodée. */
  items: { key: string; packKey: string; keep: boolean; embedding: Int8Array }[];
}

/** Choix consultés au plus : les plus récents (le calcul reste rapide sur l'iPhone quand les choix s'accumulent). */
const MEMORY_MAX = 600;

export function tasteMemory(records: readonly ChoiceRecord[]): TasteMemory {
  const items: TasteMemory['items'] = [];
  const recent = records.filter((r) => r.embedding).sort((a, b) => b.at - a.at).slice(0, MEMORY_MAX);
  for (const r of recent) {
    const embedding = decodeEmbedding(r.embedding);
    if (embedding) items.push({ key: r.key, packKey: r.packKey, keep: r.choice === 'garder', embedding });
  }
  return { items };
}

/**
 * Vote des voisins, entre -1 (ressemble à ce que l'utilisateur supprime) et 1 (à ce qu'il garde) ; 0 sans voisin.
 * `excludePacks` : paquets dont les choix ne doivent pas compter (évaluation honnête, et le paquet en cours).
 */
export function tasteVote(
  embedding: ArrayLike<number> | null,
  memory: TasteMemory,
  excludePacks: ReadonlySet<string>,
  excludeKey?: string,
): number {
  if (!embedding) return 0;
  const c = config.taste;
  const near: { sim: number; keep: boolean }[] = [];
  for (const m of memory.items) {
    if (excludePacks.has(m.packKey) || m.key === excludeKey) continue;
    const sim = cosine(embedding, m.embedding);
    if (sim !== null && sim >= c.minSimilarity) near.push({ sim, keep: m.keep });
  }
  near.sort((a, b) => b.sim - a.sim);
  const top = near.slice(0, c.neighbors);
  const total = top.reduce((s, n) => s + n.sim, 0);
  return total > 0 ? top.reduce((s, n) => s + n.sim * (n.keep ? 1 : -1), 0) / total : 0;
}
