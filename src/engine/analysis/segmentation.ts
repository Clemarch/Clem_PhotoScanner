// Silhouette des personnes : masque où chaque pixel porte une classe
// (0 fond, 1 cheveux, 2 peau du corps, 3 peau du visage, 4 vêtements, 5 accessoires et autres).

import { config } from '../config';
import type { Box, SegmentationMetrics } from '../types';

export const SEGMENT = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const;

/**
 * `mask` : classes, ligne par ligne, de taille `width` x `height`.
 * `faceBoxes` : boîtes des visages (en proportions de l'image), dans l'ordre de `item.faces`.
 */
export function measureSegmentation(
  mask: Uint8Array,
  width: number,
  height: number,
  faceBoxes: readonly Box[],
): SegmentationMetrics {
  const band = Math.max(1, Math.round(Math.min(width, height) * config.segmentation.band));
  let edge = 0;
  let edgeSkin = 0;
  // Bords gauche et droit seulement, sans le bas de l'image : des jambes coupées par le bas sont le cadre naturel.
  const lastRow = Math.max(1, Math.round(height * (1 - config.segmentation.ignoreBottom)));
  for (let y = 0; y < lastRow; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (x >= band && x < width - band) continue;
      edge++;
      if (mask[row + x] === SEGMENT.bodySkin) edgeSkin++;
    }
  }
  const faceSkin = faceBoxes.map((box) => {
    const x0 = Math.max(0, Math.floor(box.x * width));
    const y0 = Math.max(0, Math.floor(box.y * height));
    const x1 = Math.min(width, Math.ceil((box.x + box.width) * width));
    const y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
    let n = 0;
    let skin = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        n++;
        if (mask[y * width + x] === SEGMENT.faceSkin) skin++;
      }
    return n === 0 ? null : skin / n;
  });
  return { edgeBodySkin: edge === 0 ? 0 : edgeSkin / edge, faceSkin };
}
