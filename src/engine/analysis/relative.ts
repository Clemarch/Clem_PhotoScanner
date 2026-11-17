import type { MediaItem, RelativeSharpness } from '../types';

/** Compare la netteté des photos d'un même paquet : jugement relatif, jamais absolu. */
export function relativeSharpness(items: readonly MediaItem[]): Map<string, RelativeSharpness> {
  const measured = items
    .filter((item): item is MediaItem & { sharpness: number } => item.sharpness !== null)
    .sort((a, b) => b.sharpness - a.sharpness);
  const best = measured[0]?.sharpness ?? 0;
  const result = new Map<string, RelativeSharpness>();
  measured.forEach((item, i) => {
    result.set(item.id, { rank: i + 1, ratio: best > 0 ? item.sharpness / best : 1 });
  });
  return result;
}
