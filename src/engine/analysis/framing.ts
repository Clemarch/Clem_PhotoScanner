// Cadrage : l'image est-elle droite ? On cherche la direction dominante des grandes lignes
// (horizon, bord de mer, bâtiments) et son écart avec l'horizontale ou la verticale.

import { config } from '../config';

export interface Tilt {
  /** Inclinaison en degrés (signe : sens inverse des aiguilles d'une montre positif). */
  degrees: number;
  /** Part des contours alignés sur cette direction, entre 0 et 1. */
  strength: number;
}

export function measureTilt(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): Tilt {
  const cfg = config.framing;
  const binsPerDeg = 2;
  const range = cfg.tiltSearchDeg;
  const bins = new Float64Array(2 * range * binsPerDeg + 1);
  let total = 0;
  const minSq = cfg.tiltEdgeMin * cfg.tiltEdgeMin;
  const DEG = 180 / Math.PI;

  // Image moyennée par blocs de 2 x 2 pixels : divise le bruit (grain, texture fine) par deux
  // sans adoucir les grandes lignes, et allège le calcul sur iPhone.
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  const half = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * width + 2 * x;
      half[y * w + x] = (gray[i]! + gray[i + 1]! + gray[i + width]! + gray[i + width + 1]!) / 4;
    }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // Filtre de Sobel : contraste horizontal (gx) et vertical (gy).
      const gx = half[i - w + 1]! + 2 * half[i + 1]! + half[i + w + 1]! - half[i - w - 1]! - 2 * half[i - 1]! - half[i + w - 1]!;
      const gy = half[i + w - 1]! + 2 * half[i + w]! + half[i + w + 1]! - half[i - w - 1]! - 2 * half[i - w]! - half[i - w + 1]!;
      const magSq = gx * gx + gy * gy;
      if (magSq < minSq) continue;
      const weight = Math.sqrt(magSq);
      total += weight;
      // Direction du contraste, ramenée entre -90° et 90°. Une ligne horizontale a un contraste vertical (0°) ;
      // une ligne verticale un contraste horizontal (±90°) : on la ramène aussi près de 0°.
      let angle = Math.atan2(gx, gy) * DEG;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      if (angle > 45) angle -= 90;
      else if (angle < -45) angle += 90;
      if (Math.abs(angle) > range) continue;
      bins[Math.round((angle + range) * binsPerDeg)]! += weight;
    }
  }
  if (total === 0) return { degrees: 0, strength: 0 };

  // Pic, lissé sur trois cases voisines.
  let best = 0;
  let bestValue = -1;
  for (let k = 1; k < bins.length - 1; k++) {
    const value = bins[k - 1]! + bins[k]! + bins[k + 1]!;
    if (value > bestValue) {
      bestValue = value;
      best = k;
    }
  }
  // Position fine du pic : moyenne pondérée des angles à moins de 2° du pic.
  // Force : part des contours à moins de 1,5° de cette direction.
  const span = 2 * binsPerDeg;
  let sum = 0;
  let weighted = 0;
  for (let k = Math.max(0, best - span); k <= Math.min(bins.length - 1, best + span); k++) {
    sum += bins[k]!;
    weighted += bins[k]! * k;
  }
  const center = sum > 0 ? weighted / sum : best;
  let near = 0;
  for (let k = 0; k < bins.length; k++) if (Math.abs(k - center) <= 1.5 * binsPerDeg) near += bins[k]!;
  return { degrees: center / binsPerDeg - range, strength: near / total };
}

/** Pénalité d'inclinaison, entre 0 (droite ou mesure peu fiable) et 1 (franchement penchée). */
export function tiltDefect(tiltDeg: number | null, strength: number | null): number {
  const cfg = config.framing;
  if (tiltDeg === null || strength === null || strength < cfg.tiltStrengthMin) return 0;
  const excess = Math.abs(tiltDeg) - cfg.tiltToleranceDeg;
  return Math.min(1, Math.max(0, excess / (cfg.tiltFullDeg - cfg.tiltToleranceDeg)));
}
