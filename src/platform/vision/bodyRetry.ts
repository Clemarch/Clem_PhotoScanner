// Seconde recherche du corps : quand le détecteur d'objets voit une personne mais que le modèle de pose n'a pas
// trouvé son corps (selfie très proche, personne petite), on cherche à nouveau sur un recadrage autour d'elle.

import type { BodyPoint, DetectedObject } from '../../engine';
import type { BodyDetector } from './bodyDetector';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export async function findBodies(
  detector: BodyDetector,
  bitmap: ImageBitmap,
  objects: readonly DetectedObject[] | null,
): Promise<{ bodies: BodyPoint[][]; retried: number }> {
  const bodies = detector.detect(bitmap);
  const W = bitmap.width;
  const H = bitmap.height;
  // Une personne est « couverte » si le nez d'un corps trouvé est dans son rectangle.
  const covered = (box: DetectedObject['box']) =>
    bodies.some((points) => {
      const nose = points[0];
      return !!nose && nose.x >= box.x && nose.x <= box.x + box.width && nose.y >= box.y && nose.y <= box.y + box.height;
    });
  const persons = (objects ?? [])
    .filter((o) => o.label === 'person' && o.score >= 0.5 && o.box.width * o.box.height >= 0.05)
    .filter((o) => !covered(o.box))
    .slice(0, 3);

  let retried = 0;
  for (const p of persons) {
    // Marge autour de la personne, pour que le modèle voie aussi les bords de l'image.
    const x0 = clamp01(p.box.x - 0.15 * p.box.width);
    const x1 = clamp01(p.box.x + 1.15 * p.box.width);
    const y0 = clamp01(p.box.y - 0.1 * p.box.height);
    const y1 = clamp01(p.box.y + 1.1 * p.box.height);
    const sx = Math.floor(x0 * W);
    const sy = Math.floor(y0 * H);
    const sw = Math.floor((x1 - x0) * W);
    const sh = Math.floor((y1 - y0) * H);
    if (sw < 64 || sh < 64) continue;
    const crop = await createImageBitmap(bitmap, sx, sy, sw, sh);
    try {
      for (const points of detector.detect(crop)) {
        // Retour aux proportions de l'image entière (un point hors du recadrage peut sortir de 0..1, c'est voulu).
        bodies.push(points.map((q) => ({ x: (sx + q.x * sw) / W, y: (sy + q.y * sh) / H, visibility: q.visibility })));
        retried++;
      }
    } finally {
      crop.close();
    }
  }
  return { bodies, retried };
}
