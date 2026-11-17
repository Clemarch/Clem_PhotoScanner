import { describe, expect, it } from 'vitest';
import { relativeSharpness, rgbaToGray, sharpnessFromGray, type MediaItem } from '../../src/engine';

const W = 96;
const H = 96;

/** Damier : une image pleine de contours nets. */
function checkerboard(cell: number): Uint8Array {
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) gray[y * W + x] = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 230 : 25;
  return gray;
}

/** Flou simple : moyenne des voisins, répétée. */
function blur(src: Uint8Array, passes: number): Uint8Array {
  let current = src;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            sum += current[yy * W + xx]!;
            n++;
          }
        next[y * W + x] = Math.round(sum / n);
      }
    current = next;
  }
  return current;
}

const measure = (gray: Uint8Array) => sharpnessFromGray(gray, W, H, 8, 0.25);

describe('netteté globale', () => {
  it('vaut zéro pour une image unie', () => {
    expect(measure(new Uint8Array(W * H).fill(128))).toBe(0);
  });

  it('baisse quand l’image est plus floue', () => {
    const sharp = checkerboard(6);
    const soft = blur(sharp, 2);
    const softer = blur(sharp, 6);
    expect(measure(sharp)).toBeGreaterThan(measure(soft));
    expect(measure(soft)).toBeGreaterThan(measure(softer));
  });

  it('ne pénalise pas un sujet net entouré d’un fond flou', () => {
    const sharp = checkerboard(6);
    const blurred = blur(sharp, 6);
    // Sujet net dans le quart central, fond flou partout ailleurs.
    const portrait = blurred.slice();
    for (let y = 24; y < 72; y++) for (let x = 24; x < 72; x++) portrait[y * W + x] = sharp[y * W + x]!;
    expect(measure(portrait)).toBeGreaterThan(measure(blurred) * 3);
    expect(measure(portrait)).toBeGreaterThan(measure(sharp) * 0.6);
  });

  it('supporte les images minuscules', () => {
    expect(sharpnessFromGray(new Uint8Array(4), 2, 2, 8, 0.25)).toBe(0);
    expect(Number.isFinite(sharpnessFromGray(new Uint8Array(25).fill(9), 5, 5, 8, 0.25))).toBe(true);
  });

  it('convertit les couleurs en gris', () => {
    const gray = rgbaToGray(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(gray[0]).toBeGreaterThanOrEqual(254);
    expect(gray[1]).toBe(0);
  });
});

describe('netteté relative dans un paquet', () => {
  const item = (id: string, sharpness: number | null) => ({ id, sharpness }) as MediaItem;

  it('classe les photos et rapporte chacune à la meilleure', () => {
    const result = relativeSharpness([item('a', 50), item('b', 200), item('c', 100)]);
    expect(result.get('b')).toEqual({ rank: 1, ratio: 1 });
    expect(result.get('c')).toEqual({ rank: 2, ratio: 0.5 });
    expect(result.get('a')).toEqual({ rank: 3, ratio: 0.25 });
  });

  it('ignore les photos non mesurées', () => {
    const result = relativeSharpness([item('a', null), item('b', 10)]);
    expect(result.has('a')).toBe(false);
    expect(result.get('b')?.rank).toBe(1);
  });
});
