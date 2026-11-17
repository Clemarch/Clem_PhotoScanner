import { describe, expect, it } from 'vitest';
import {
  learnWeights,
  measureBody,
  measureObstruction,
  scorePack,
  tiltDefect,
  type BodyPoint,
  type ChoiceRecord,
  type FaceMetrics,
  type MediaItem,
} from '../../src/engine';

/** Corps de 33 points, tous visibles au milieu de l'image ; on déplace ensuite poignets, doigts, chevilles. */
function body(over: Record<number, Partial<BodyPoint>> = {}): BodyPoint[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  points[0] = { x: 0.5, y: 0.3, visibility: 0.95 }; // nez
  for (const [k, v] of Object.entries(over)) points[Number(k)] = { ...points[Number(k)]!, ...v };
  return points;
}

describe('corps : mains et pieds coupés', () => {
  it('ne signale rien pour un corps entièrement dans l’image', () => {
    expect(measureBody(body())).toMatchObject({ cutHands: 0, cutFeet: 0 });
  });

  it('repère une main coupée par le bas de l’image (coude dedans, poignet dehors)', () => {
    const b = measureBody(body({ 13: { x: 0.4, y: 0.85 }, 15: { x: 0.4, y: 1.08, visibility: 0.2 } }));
    expect(b.cutHands).toBe(1);
  });

  it('repère des doigts coupés même si le poignet est juste dans l’image', () => {
    expect(measureBody(body({ 14: { y: 0.8 }, 16: { y: 0.98 }, 20: { y: 1.02 } })).cutHands).toBe(1);
  });

  it('repère une main en partie visible au bord, même si le coude est hors champ (selfie très proche)', () => {
    // Coude hors champ ; poignet bien dans l'image, doigts sous le bord.
    const b = measureBody(body({ 13: { x: 0.4, y: 1.15, visibility: 0.2 }, 15: { x: 0.42, y: 0.93 }, 19: { x: 0.43, y: 1.01, visibility: 0.4 } }));
    expect(b.cutHands).toBe(1);
  });

  it('ne compte pas une main hors champ si le coude l’est aussi (bras entier hors cadre)', () => {
    expect(measureBody(body({ 13: { y: 1.2 }, 15: { y: 1.4 }, 17: { y: 1.42 }, 19: { y: 1.45 }, 21: { y: 1.41 } })).cutHands).toBe(0);
  });

  it('repère des pieds coupés (genou dedans, cheville dehors)', () => {
    expect(measureBody(body({ 25: { y: 0.9 }, 27: { y: 1.1 }, 26: { y: 0.9 }, 28: { y: 1.1 } })).cutFeet).toBe(2);
  });
});

const face = (x: number): FaceMetrics =>
  ({
    box: { x: x - 0.08, y: 0.3, width: 0.16, height: 0.2 },
    areaRatio: 0.04,
    eyesOpen: 1,
    gaze: 1,
    expression: 0.9,
    smile: 0.8,
    sharpness: 300,
    cut: false,
    yawDeg: 0,
    pitchDeg: 0,
    offAxisHDeg: 0,
    offAxisVDeg: 0,
    eyeH: 0,
    eyeV: 0,
    talking: 0,
    pout: 0,
    upperColor: null,
    lowerColor: null,
    bodyColor: null,
  }) as FaceMetrics;

const photo = (id: string, extra: Partial<MediaItem>): MediaItem =>
  ({
    id,
    kind: 'photo',
    isRaw: false,
    sharpness: 300,
    focal35: 23,
    faces: null,
    objects: null,
    tiltDeg: null,
    tiltStrength: null,
    exposure: null,
    color: null,
    signature: null,
    bodies: null,
    obstruction: null,
    ...extra,
  }) as MediaItem;

describe('retours du 17/11 : selfies n° 30 et 31 (la main en bas est coupée sur la 30)', () => {
  // Les deux selfies : le bras qui tient le téléphone est coupé sur les deux ; sur la n° 30, l'autre main aussi.
  const selfieArm = { 13: { x: 0.85, y: 0.8 }, 15: { x: 1.1, y: 0.9, visibility: 0.1 } };
  const withNose = (x: number, over: Record<number, Partial<BodyPoint>>) => body({ 0: { x, y: 0.4 }, ...over });
  const items = [
    photo('30', {
      faces: [face(0.55), face(0.72)],
      bodies: [
        measureBody(withNose(0.55, { 14: { x: 0.5, y: 0.85 }, 16: { x: 0.5, y: 1.05, visibility: 0.2 } })),
        measureBody(withNose(0.72, selfieArm)),
      ],
    }),
    photo('31', {
      faces: [face(0.58), face(0.74)],
      bodies: [measureBody(withNose(0.58, {})), measureBody(withNose(0.74, selfieArm))],
    }),
  ];

  it('seule la coupure en plus du bras du selfie compte', () => {
    const scores = scorePack(items);
    expect(scores.get('30')!.extraCutLimbs).toBe(1);
    expect(scores.get('31')!.extraCutLimbs).toBe(0);
    expect(scores.get('30')!.reasons.map((r) => r.code)).toContain('main-coupee');
    expect(scores.get('31')!.rank).toBe(1);
  });
});

describe('photos par le hublot', () => {
  it('juge l’inclinaison par rapport à la photo la plus droite du paquet', () => {
    expect(tiltDefect(-5.5, 0.05, 5.5)).toBe(0);
    // 11° contre 5,5° pour la plus droite : 4° au-delà de la tolérance de 1,5°, pénalité presque pleine.
    expect(tiltDefect(-11, 0.05, 5.5)).toBeCloseTo(0.89, 2);
    expect(tiltDefect(-11, 0.05, 0)).toBe(1);
    expect(tiltDefect(-11, 0.02, 0)).toBe(0);
    const scores = scorePack([photo('a', { tiltDeg: -5.5, tiltStrength: 0.05 }), photo('b', { tiltDeg: -11, tiltStrength: 0.05 })]);
    expect(scores.get('a')!.reasons.map((r) => r.code)).not.toContain('horizon');
    expect(scores.get('b')!.reasons.map((r) => r.code)).toContain('horizon');
  });

  it('mesure les bords masqués par une zone sombre et uniforme (montant du hublot)', () => {
    const W = 240;
    const H = 180;
    const make = (frame: number) => {
      const gray = new Uint8Array(W * H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) gray[y * W + x] = x < frame * W ? 25 : 120 + ((x * 7 + y * 13) % 60);
      return gray;
    };
    expect(measureObstruction(make(0), W, H)).toBe(0);
    expect(measureObstruction(make(0.25), W, H)).toBeCloseTo(0.25, 1);
    // Un ciel sombre mais au milieu de l'image (pas collé au bord) ne compte pas.
    const gray = make(0);
    for (let y = 60; y < 120; y++) for (let x = 80; x < 160; x++) gray[y * W + x] = 25;
    expect(measureObstruction(gray, W, H)).toBe(0);
  });

  it('ne compte pas les bords sombres sur une photo de personnes (vêtements sombres)', () => {
    const withFaces = (id: string, obstruction: number) =>
      photo(id, { faces: [face(0.5)], obstruction });
    const scores = scorePack([withFaces('a', 0.02), withFaces('b', 0.25)]);
    expect(scores.get('b')!.reasons.map((r) => r.code)).not.toContain('bords-masques');
  });

  it('pénalise la photo dont le hublot cache plus de paysage', () => {
    const scores = scorePack([photo('degagee', { obstruction: 0.02 }), photo('masquee', { obstruction: 0.25 })]);
    expect(scores.get('masquee')!.reasons.map((r) => r.code)).toContain('bords-masques');
    expect(scores.get('degagee')!.rank).toBe(1);
  });
});

describe('photo très floue', () => {
  it('est ratée, donc supprimable même seule', () => {
    const scores = scorePack([photo('floue', { sharpness: 12, faces: [] })]);
    expect(scores.get('floue')!.failed).toBe(true);
    expect(scores.get('floue')!.reasons.map((r) => r.code)).toContain('tres-floue');
  });
});

describe('apprentissage et critères ajoutés depuis', () => {
  it('accepte des choix enregistrés avant l’ajout des nouveaux critères', () => {
    const old = (key: string, choice: 'garder' | 'supprimer', expression: number): ChoiceRecord =>
      ({ key, packKey: 'p', choice, baseScore: 0.8, at: 0, features: { expression } }) as unknown as ChoiceRecord;
    const weights = learnWeights([old('a', 'garder', 1), old('b', 'supprimer', 0.4)]);
    for (const value of Object.values(weights)) expect(Number.isFinite(value)).toBe(true);
    expect(weights.expression).toBeGreaterThan(0);
  });
});
