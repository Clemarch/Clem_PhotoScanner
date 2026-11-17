import { describe, expect, it } from 'vitest';
import { measureExposure, measureTilt, tiltDefect } from '../../src/engine';

const W = 400;
const H = 300;

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mer et ciel séparés par une ligne d'horizon inclinée de `deg` degrés (sens inverse des aiguilles d'une montre).
 *  Transition douce sur un ou deux pixels, comme dans une vraie photo réduite. */
function horizon(deg: number, noise = 0): Uint8Array {
  const gray = new Uint8Array(W * H);
  const slope = Math.tan((deg * Math.PI) / 180);
  const rand = random(7);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const lineY = H / 2 - slope * (x - W / 2);
      const sky = 1 / (1 + Math.exp((y - lineY) / 0.8));
      gray[y * W + x] = Math.max(0, Math.min(255, 60 + 140 * sky + (rand() - 0.5) * noise));
    }
  return gray;
}

describe('inclinaison de la photo', () => {
  it('trouve un horizon droit', () => {
    const tilt = measureTilt(horizon(0), W, H);
    expect(Math.abs(tilt.degrees)).toBeLessThan(0.5);
    expect(tilt.strength).toBeGreaterThan(0.5);
  });

  it('mesure l’angle et le sens d’un horizon penché', () => {
    expect(measureTilt(horizon(4), W, H).degrees).toBeCloseTo(4, 0);
    expect(measureTilt(horizon(-3), W, H).degrees).toBeCloseTo(-3, 0);
  });

  it('reste utilisable avec un bruit très fort (bien plus que dans une vraie photo)', () => {
    // Erreur tolérée : 1°, sous la tolérance de 1,5° à partir de laquelle une photo est dite penchée.
    const tilt = measureTilt(horizon(5, 30), W, H);
    expect(Math.abs(tilt.degrees - 5)).toBeLessThan(1);
  });

  it('trouve l’horizon sous un ciel nuageux', () => {
    // Nuages : grandes taches douces et contrastées dans le ciel, horizon net penché de 3°.
    const gray = horizon(3, 6);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (gray[y * W + x]! < 130) continue;
        const cloud = 45 * Math.sin(x / 23 + Math.sin(y / 17) * 2) * Math.cos(y / 19 + x / 61);
        gray[y * W + x] = Math.max(0, Math.min(255, gray[y * W + x]! + cloud));
      }
    const tilt = measureTilt(gray, W, H);
    expect(tilt.degrees).toBeCloseTo(3, 0);
    expect(tilt.strength).toBeGreaterThan(0.1);
  });

  it('donne une force faible sans grande ligne droite', () => {
    const rand = random(3);
    const gray = Uint8Array.from({ length: W * H }, () => Math.floor(rand() * 255));
    expect(measureTilt(gray, W, H).strength).toBeLessThan(0.1);
  });

  it('convertit l’inclinaison en défaut', () => {
    expect(tiltDefect(1, 0.5)).toBe(0);
    expect(tiltDefect(-6, 0.5)).toBe(1);
    expect(tiltDefect(3.75, 0.5)).toBeCloseTo(0.5);
    expect(tiltDefect(8, 0.05)).toBe(0);
    expect(tiltDefect(null, null)).toBe(0);
  });
});

describe('exposition', () => {
  it('compte les pixels brûlés et bouchés', () => {
    const gray = Uint8Array.from([255, 252, 128, 128, 3, 0, 100, 200, 128, 128]);
    const e = measureExposure(gray);
    expect(e.highlights).toBeCloseTo(0.2);
    expect(e.shadows).toBeCloseTo(0.2);
    expect(e.mean).toBeCloseTo(1322 / 10);
    expect(measureExposure(new Uint8Array(0))).toEqual({ highlights: 0, shadows: 0, mean: 0 });
  });
});
