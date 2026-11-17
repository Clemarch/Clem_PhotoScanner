// Couleurs, contraste et empreinte d'une image.

import type { ColorStats } from '../types';

type Pixels = Uint8Array | Uint8ClampedArray;

/** Mesure les couleurs sur un pixel sur `step` (dans chaque direction) : largement suffisant et rapide. */
export function measureColor(rgba: Pixels, width: number, height: number, step = 2): ColorStats {
  let n = 0;
  let satSum = 0;
  let lumSum = 0;
  let lumSq = 0;
  let warm = 0;
  let warmIntensity = 0;
  // Vivacité (Hasler et Süsstrunk) : écarts rouge-vert et jaune-bleu.
  let rgSum = 0;
  let rgSq = 0;
  let ybSum = 0;
  let ybSq = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const p = (y * width + x) * 4;
      const r = rgba[p]! / 255;
      const g = rgba[p + 1]! / 255;
      const b = rgba[p + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
      satSum += sat;
      lumSum += lum;
      lumSq += lum * lum;
      const rg = r - g;
      const yb = (r + g) / 2 - b;
      rgSum += rg;
      rgSq += rg * rg;
      ybSum += yb;
      ybSq += yb * yb;

      // Teinte entre le rouge-orangé et le jaune (environ 10° à 60°), assez saturée et lumineuse.
      if (sat > 0.3 && max > 0.3 && max === r && r - min > 0) {
        const hue = (60 * (g - b)) / (max - min);
        if (hue >= 10 && hue <= 60) {
          warm++;
          warmIntensity += sat * max;
        }
      }
    }
  }
  if (n === 0) return { saturation: 0, colorfulness: 0, warmFraction: 0, warmStrength: 0, contrast: 0, mean: 0 };

  const meanLum = lumSum / n;
  const std = (sum: number, sq: number) => Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
  const rgMean = rgSum / n;
  const ybMean = ybSum / n;
  const colorfulness = Math.hypot(std(rgSum, rgSq), std(ybSum, ybSq)) + 0.3 * Math.hypot(rgMean, ybMean);

  return {
    saturation: satSum / n,
    colorfulness: Math.min(1, colorfulness / 0.6),
    warmFraction: warm / n,
    warmStrength: warm > 0 ? warmIntensity / warm : 0,
    contrast: Math.min(1, std(lumSum, lumSq) / 0.35),
    mean: meanLum,
  };
}

/** Empreinte : vignette de 8 x 8 pixels en couleur (moyenne de chaque case), 192 nombres de 0 à 255. */
export function imageSignature(rgba: Pixels, width: number, height: number, size = 8): number[] {
  const out = new Array<number>(size * size * 3).fill(0);
  const counts = new Array<number>(size * size).fill(0);
  const step = Math.max(1, Math.floor(Math.min(width, height) / (size * 8)));
  for (let y = 0; y < height; y += step) {
    const cy = Math.min(size - 1, Math.floor((y * size) / height));
    for (let x = 0; x < width; x += step) {
      const cx = Math.min(size - 1, Math.floor((x * size) / width));
      const c = cy * size + cx;
      const p = (y * width + x) * 4;
      out[c * 3]! += rgba[p]!;
      out[c * 3 + 1]! += rgba[p + 1]!;
      out[c * 3 + 2]! += rgba[p + 2]!;
      counts[c]!++;
    }
  }
  return out.map((v, i) => Math.round(v / Math.max(1, counts[Math.floor(i / 3)]!)));
}

/** Différence entre deux empreintes : 0 = identiques, 1 = opposées. Infinity si l'une manque. */
export function signatureDistance(a: readonly number[] | null, b: readonly number[] | null): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length / 255;
}
