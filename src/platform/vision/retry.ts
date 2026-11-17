// Seconde recherche de visage : quand le détecteur d'objets voit une personne mais qu'aucun visage n'a été trouvé
// sur elle (tête inclinée, petit visage), on cherche à nouveau sur un recadrage autour de sa tête.

import type { DetectedObject, FaceObservation } from '../../engine';
import type { FaceDetector } from './faceDetector';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inside = (b: DetectedObject['box'], x: number, y: number) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

export async function findFaces(
  detector: FaceDetector,
  bitmap: ImageBitmap,
  objects: readonly DetectedObject[] | null,
): Promise<{ observations: FaceObservation[]; retried: number }> {
  const first = detector.detect(bitmap);
  const W = bitmap.width;
  const H = bitmap.height;
  const centers = () => all.map((o) => ({ x: o.box.x + o.box.width / 2, y: o.box.y + o.box.height / 2 }));
  const all = [...first];

  const persons = (objects ?? [])
    .filter((o) => o.label === 'person' && o.score >= 0.5 && o.box.width * o.box.height >= 0.02)
    .filter((p) => !centers().some((c) => inside(p.box, c.x, c.y)))
    .slice(0, 3);

  let retried = 0;
  for (const p of persons) {
    // Haut de la silhouette : la tête et un peu de marge.
    const x0 = clamp01(p.box.x - 0.1 * p.box.width);
    const x1 = clamp01(p.box.x + 1.1 * p.box.width);
    const y0 = clamp01(p.box.y - 0.05 * p.box.height);
    const y1 = clamp01(p.box.y + 0.6 * p.box.height);
    const sx = Math.floor(x0 * W);
    const sy = Math.floor(y0 * H);
    const sw = Math.floor((x1 - x0) * W);
    const sh = Math.floor((y1 - y0) * H);
    if (sw < 48 || sh < 48) continue;
    const crop = await createImageBitmap(bitmap, sx, sy, sw, sh);
    try {
      for (const o of detector.detect(crop)) {
        const box = {
          x: (sx + o.box.x * sw) / W,
          y: (sy + o.box.y * sh) / H,
          width: (o.box.width * sw) / W,
          height: (o.box.height * sh) / H,
        };
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        // Déjà trouvé lors de la première recherche ?
        if (all.some((f) => inside(f.box, cx, cy))) continue;
        all.push({ ...o, box });
        retried++;
      }
    } finally {
      crop.close();
    }
  }
  return { observations: all, retried };
}
