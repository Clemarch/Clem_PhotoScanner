// Exposition : part de pixels brûlés (blanc pur, détails perdus) et bouchés (noir pur).

import { config } from '../config';
import type { Exposure } from '../types';

export function measureExposure(gray: Uint8Array | Uint8ClampedArray): Exposure {
  const { highlightFrom, shadowBelow } = config.exposure;
  if (gray.length === 0) return { highlights: 0, shadows: 0, mean: 0 };
  let high = 0;
  let low = 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    sum += v;
    if (v >= highlightFrom) high++;
    else if (v < shadowBelow) low++;
  }
  return { highlights: high / gray.length, shadows: low / gray.length, mean: sum / gray.length };
}
