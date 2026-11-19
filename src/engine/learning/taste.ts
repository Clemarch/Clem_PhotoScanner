// Goûts appris sur l'image : pour une photo, on cherche les choix passés dont l'empreinte lui ressemble le plus
// (d'autres paquets seulement) et on fait voter ces voisins : gardée +1, supprimée -1, pondéré par la ressemblance.
// En test : ce vote n'influence pas les décisions, il sert à mesurer s'il aiderait (voir evaluation.ts).

import { config } from '../config';
import type { ChoiceRecord } from '../types';
import { decodeEmbedding } from './embeddingCodec';

export interface TasteMemory {
  /** Choix avec empreinte décodée et ramenée à une longueur de 1 (la ressemblance n'est plus qu'un produit). */
  items: { key: string; packKey: string; keep: boolean; embedding: Float32Array }[];
}

/** Vecteur ramené à une longueur de 1 ; null s'il est nul. */
function unit(v: ArrayLike<number>): Float32Array | null {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  if (!(n > 0)) return null;
  const inv = 1 / Math.sqrt(n);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! * inv;
  return out;
}

export function tasteMemory(records: readonly ChoiceRecord[]): TasteMemory {
  const items: TasteMemory['items'] = [];
  const recent = records.filter((r) => r.embedding).sort((a, b) => b.at - a.at).slice(0, config.taste.memoryMax);
  for (const r of recent) {
    const decoded = decodeEmbedding(r.embedding);
    const embedding = decoded ? unit(decoded) : null;
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
  const e = embedding ? unit(embedding) : null;
  if (!e) return 0;
  const c = config.taste;
  const near: { sim: number; keep: boolean }[] = [];
  for (const m of memory.items) {
    if (excludePacks.has(m.packKey) || m.key === excludeKey) continue;
    if (m.embedding.length !== e.length) continue;
    let sim = 0;
    for (let i = 0; i < e.length; i++) sim += e[i]! * m.embedding[i]!;
    if (sim >= c.minSimilarity) near.push({ sim, keep: m.keep });
  }
  near.sort((a, b) => b.sim - a.sim);
  const top = near.slice(0, c.neighbors);
  const total = top.reduce((s, n) => s + n.sim, 0);
  return total > 0 ? top.reduce((s, n) => s + n.sim * (n.keep ? 1 : -1), 0) / total : 0;
}
