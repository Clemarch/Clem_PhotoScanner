import { describe, expect, it } from 'vitest';
import { boxFromPoints, cropGray, headPose, lensDirection, mainFaces, measureFace, type FaceMetrics, type FaceObservation } from '../../src/engine';

const W = 200;
const H = 200;

/** Image avec du détail partout (damier fin). */
const detailed = (() => {
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gray[y * W + x] = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 220 : 30;
  return gray;
})();

const observation = (blendshapes: Record<string, number> = {}, extra: Partial<FaceObservation> = {}): FaceObservation => ({
  box: centered,
  blendshapes,
  matrix: null,
  ...extra,
});

// Visage centré par défaut : l'objectif est droit devant lui.
const centered = { x: 0.35, y: 0.35, width: 0.3, height: 0.3 };
const measure = (o: FaceObservation, gray = detailed) => measureFace(o, gray, W, H, 23);

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
    expect(measure(observation({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 })).eyesOpen).toBe(0);
    expect(measure(observation({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.8 })).eyesOpen).toBe(0);
  });

  it('ne départage pas deux visages aux yeux ouverts sur un simple plissement', () => {
    // Sourire ou lunettes : le détecteur annonce 25 à 30 % de « clignement » alors que les yeux sont ouverts.
    expect(measure(observation({ eyeBlinkLeft: 0.28, eyeBlinkRight: 0.25 })).eyesOpen).toBe(1);
    expect(measure(observation({ eyeBlinkLeft: 0.04, eyeBlinkRight: 0.03 })).eyesOpen).toBe(1);
    expect(measure(observation({ eyeBlinkLeft: 0.5, eyeBlinkRight: 0.5 })).eyesOpen).toBeCloseTo(0.57, 2);
  });

  it('baisse la note de regard quand la tête est tournée', () => {
    const slight = measure(observation({}, { matrix: yawMatrix(8) }));
    const turned = measure(observation({}, { matrix: yawMatrix(45) }));
    expect(slight.gaze).toBe(1);
    expect(turned.gaze).toBe(0);
    expect(Math.abs(turned.yawDeg)).toBeCloseTo(45, 0);
  });

  it('sur un selfie, accepte un visage au bord de l’image tourné vers l’objectif', () => {
    // Cas réel : caméra selfie (23 mm), image en hauteur, visage centré à 80 % de la largeur.
    const atRight = { x: 0.7, y: 0.4, width: 0.2, height: 0.2 };
    const lens = lensDirection(0.8, 0.5, 3024, 4032, 23);
    expect(lens.hDeg).toBeCloseTo(-18.7, 0);

    const towardLens = measureFace(observation({}, { box: atRight, matrix: yawMatrix(-20) }), detailed, 150, 200, 23);
    expect(towardLens.yawDeg).toBeCloseTo(-20, 0);
    expect(Math.abs(towardLens.offAxisHDeg)).toBeLessThan(3);
    expect(towardLens.gaze).toBe(1);

    // Même place, tête tournée de l'autre côté : il ne regarde pas l'objectif.
    const away = measureFace(observation({}, { box: atRight, matrix: yawMatrix(20) }), detailed, 150, 200, 23);
    expect(away.gaze).toBeLessThan(0.1);
  });

  it('au téléobjectif, la position dans l’image ne change presque rien', () => {
    expect(Math.abs(lensDirection(0.8, 0.5, 3024, 4032, 77).hDeg)).toBeLessThan(6.5);
    expect(lensDirection(0.5, 0.5, 3024, 4032, 23)).toEqual({ hDeg: -0, vDeg: 0 });
  });

  it('accepte une tête tournée dont les yeux reviennent vers l’objectif', () => {
    const headTurned = measure(observation({}, { matrix: yawMatrix(24) }));
    const eyesBack = measure(
      observation({ eyeLookInLeft: 0.7, eyeLookOutRight: 0.7 }, { matrix: yawMatrix(24) }),
    );
    expect(eyesBack.gaze).toBeGreaterThan(headTurned.gaze);
    expect(eyesBack.gaze).toBe(1);
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
    for (let y = 65; y < 135; y++) for (let x = 65; x < 135; x++) gray[y * W + x] = 128;
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
    expect(headPose(null)).toEqual({ yawDeg: 0, pitchDeg: 0 });
  });

  it('ne garde que les visages principaux', () => {
    const face = (areaRatio: number) => ({ areaRatio }) as FaceMetrics;
    expect(mainFaces([face(0.05), face(0.04), face(0.004), face(0.0005)])).toHaveLength(2);
    expect(mainFaces(null)).toEqual([]);
  });
});
