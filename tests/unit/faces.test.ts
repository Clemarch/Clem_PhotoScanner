import { describe, expect, it } from 'vitest';
import { boxFromPoints, cropGray, headAngles, mainFaces, measureFace, type FaceMetrics, type FaceObservation } from '../../src/engine';

const W = 200;
const H = 200;

/** Image avec du détail partout (damier fin). */
const detailed = (() => {
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gray[y * W + x] = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 220 : 30;
  return gray;
})();

const observation = (blendshapes: Record<string, number> = {}, extra: Partial<FaceObservation> = {}): FaceObservation => ({
  box: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
  blendshapes,
  matrix: null,
  ...extra,
});

const measure = (o: FaceObservation, gray = detailed) => measureFace(o, gray, W, H);

/** Matrice de rotation autour de l'axe vertical (la tête tourne à gauche ou à droite). */
function yawMatrix(deg: number): number[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

describe('mesures d’un visage', () => {
  it('note bien un visage neutre de face', () => {
    const face = measure(observation());
    expect(face.eyesOpen).toBe(1);
    expect(face.gaze).toBe(1);
    expect(face.cut).toBe(false);
    expect(face.areaRatio).toBeCloseTo(0.09, 2);
  });

  it('repère les yeux fermés, même un seul', () => {
    expect(measure(observation({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 })).eyesOpen).toBeCloseTo(0.1);
    expect(measure(observation({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.8 })).eyesOpen).toBeCloseTo(0.2);
  });

  it('baisse la note de regard quand les yeux partent sur le côté', () => {
    const away = measure(observation({ eyeLookOutLeft: 0.7, eyeLookInRight: 0.7 }));
    expect(away.gaze).toBeLessThan(0.5);
  });

  it('baisse la note de regard quand la tête est tournée', () => {
    const slight = measure(observation({}, { matrix: yawMatrix(8) }));
    const turned = measure(observation({}, { matrix: yawMatrix(45) }));
    expect(slight.gaze).toBeGreaterThan(0.85);
    expect(turned.gaze).toBeLessThan(0.5);
    expect(Math.abs(turned.yawDeg)).toBeCloseTo(45, 0);
  });

  it('préfère un sourire à une bouche ouverte en pleine parole', () => {
    const neutral = measure(observation());
    const smiling = measure(observation({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8, jawOpen: 0.4 }));
    const talking = measure(observation({ jawOpen: 0.7 }));
    expect(smiling.expression).toBeGreaterThan(neutral.expression);
    expect(talking.expression).toBeLessThan(neutral.expression);
    expect(talking.expression).toBeLessThan(0.35);
  });

  it('mesure la netteté dans la boîte du visage, pas dans le décor', () => {
    // Décor détaillé partout, mais visage uniforme (flou) dans sa boîte.
    const gray = detailed.slice();
    for (let y = 55; y < 125; y++) for (let x = 55; x < 125; x++) gray[y * W + x] = 128;
    expect(measure(observation(), gray).sharpness).toBe(0);
    expect(measure(observation()).sharpness).toBeGreaterThan(1000);
  });

  it('signale un visage coupé par le bord', () => {
    expect(measure(observation({}, { box: { x: -0.02, y: 0.3, width: 0.3, height: 0.3 } })).cut).toBe(true);
    expect(measure(observation({}, { box: { x: 0.72, y: 0.3, width: 0.28, height: 0.3 } })).cut).toBe(true);
  });
});

describe('outils', () => {
  it('calcule la boîte d’un nuage de points', () => {
    expect(boxFromPoints([{ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.1 }])).toEqual({ x: 0.2, y: 0.1, width: 0.39999999999999997, height: 0.4 });
    expect(boxFromPoints([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('découpe une zone en restant dans l’image', () => {
    const crop = cropGray(detailed, W, H, { x: 0.9, y: 0.9, width: 0.5, height: 0.5 });
    expect(crop.width).toBe(20);
    expect(crop.height).toBe(20);
    expect(crop.gray[0]).toBe(detailed[180 * W + 180]);
  });

  it('donne des angles nuls sans matrice', () => {
    expect(headAngles(null)).toEqual({ yawDeg: 0, pitchDeg: 0 });
  });

  it('ne garde que les visages principaux', () => {
    const face = (areaRatio: number) => ({ areaRatio }) as FaceMetrics;
    expect(mainFaces([face(0.05), face(0.04), face(0.004), face(0.0005)])).toHaveLength(2);
    expect(mainFaces(null)).toEqual([]);
  });
});
