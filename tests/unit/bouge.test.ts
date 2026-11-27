import { describe, expect, it } from 'vitest';
import { analyzeDay, measureMotion, offAxisDeg, type MediaItem } from '../../src/engine';

// Flou de bougé (point 67) : traînées de lumière en biais, repérées même quand le Laplacien croit la photo nette.
const W = 300;
const H = 400;
function image(f: (x: number, y: number) => number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = Math.max(0, Math.min(255, Math.round(f(x, y))));
  return g;
}
// Pseudo-hasard reproductible.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('flou de bougé (point 67)', () => {
  it('traînées en biais : contours alignés partout ; scène ordinaire ou horizon : non', () => {
    // Traînées à 30° de la verticale.
    const a = (60 * Math.PI) / 180;
    const streaks = measureMotion(image((x, y) => 128 + 100 * Math.sin((x * Math.sin(a) - y * Math.cos(a)) / 3)), W, H);
    expect(streaks.coherence).toBeGreaterThan(0.9);
    expect(streaks.local).toBeGreaterThan(0.9);
    expect(offAxisDeg(streaks.angleDeg)).toBeGreaterThan(20);
    // Scène sans direction : bruit.
    const noise = measureMotion(image(() => rnd() * 255), W, H);
    expect(noise.coherence).toBeLessThan(0.3);
    // Horizon (rayures horizontales) : aligné, mais à l'horizontale.
    const horizon = measureMotion(image((_, y) => 128 + 100 * Math.sin(y / 4)), W, H);
    expect(horizon.coherence).toBeGreaterThan(0.9);
    expect(offAxisDeg(horizon.angleDeg)).toBeLessThan(5);
  });

  it('une photo seule, sans personne et bougée, est proposée à la suppression (donc montrée dans le tri éclair)', () => {
    const base = { kind: 'photo', isRaw: false, sharpness: 400, focal35: 24, faces: [], objects: [], tiltDeg: 0, tiltStrength: 0.01, exposure: null, color: null, signature: null, segmentation: null, embedding: null, labels: null, obstruction: null, camera: true, hands: null } as unknown as MediaItem;
    const shaken = { ...base, id: 'b', fileName: 'b.jpg', capturedAt: 1_800_000_000_000, motion: { coherence: 0.78, local: 0.75, angleDeg: 118 } } as MediaItem;
    const day = analyzeDay([shaken], 60, {}, new Set(), true);
    const d = day.packs[0]!.decisions.get('b')!;
    expect(d.keep).toBe(false);
    expect(d.code).toBe('ratee');
    // Même photo, traînées horizontales (horizon) : gardée sans question.
    const level = { ...shaken, motion: { coherence: 0.9, local: 0.8, angleDeg: 2 } };
    expect(analyzeDay([level], 60, {}, new Set(), true).packs[0]!.decisions.get('b')!.keep).toBe(true);
  });
});
