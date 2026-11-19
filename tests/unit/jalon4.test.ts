import { describe, expect, it } from 'vitest';
import {
  learnWeights,
  measureObstruction,
  measureSegmentation,
  scorePack,
  tiltDefect,
  type ChoiceRecord,
  type FaceMetrics,
  type MediaItem,
} from '../../src/engine';

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
    segmentation: null,
    embedding: null,
    labels: null,
    obstruction: null, camera: null, hands: null,
    ...extra,
  }) as MediaItem;

describe('silhouette : mesures', () => {
  // Masque 20 x 20 : 0 fond, 2 peau du corps, 3 peau du visage.
  const mask = (fill: (x: number, y: number) => number) => Uint8Array.from({ length: 400 }, (_, i) => fill(i % 20, Math.floor(i / 20)));

  it('mesure la peau du corps qui touche les bords gauche et droit, pas le bas (jambes coupées : cadre naturel, 19/11)', () => {
    expect(measureSegmentation(mask(() => 0), 20, 20, []).edgeBodySkin).toBe(0);
    // Jambes coupées par le bas : ne comptent pas.
    expect(measureSegmentation(mask((x, y) => (y === 19 && x >= 8 && x < 12 ? 2 : 0)), 20, 20, []).edgeBodySkin).toBe(0);
    // Une main coupée par le bord gauche, en haut de l'image : 4 pixels sur les 28 des bords examinés (14 lignes × 2).
    const cut = measureSegmentation(mask((x, y) => (x === 0 && y >= 2 && y < 6 ? 2 : 0)), 20, 20, []);
    expect(cut.edgeBodySkin).toBeCloseTo(4 / 28, 3);
    // De la peau au milieu de l'image ne compte pas.
    expect(measureSegmentation(mask((x, y) => (x > 5 && x < 15 && y > 5 && y < 15 ? 2 : 0)), 20, 20, []).edgeBodySkin).toBe(0);
  });

  it('mesure la part de peau dans la boîte de chaque visage', () => {
    const m = mask((x, y) => (x >= 5 && x < 10 && y >= 5 && y < 10 ? (y < 8 ? 3 : 0) : 0));
    const r = measureSegmentation(m, 20, 20, [{ x: 0.25, y: 0.25, width: 0.25, height: 0.25 }]);
    expect(r.faceSkin[0]).toBeCloseTo(0.6, 5);
  });
});

describe('retours du 17/11 (deuxième journée)', () => {
  const seg = (edgeBodySkin: number, faceSkin: (number | null)[] = []) => ({ edgeBodySkin, faceSkin });

  it('selfies n° 15/16 : la main coupée est repérée sur la bonne photo (la plus coupée)', () => {
    const scores = scorePack([
      photo('15', { faces: [face(0.55), face(0.72)], segmentation: seg(0.06) }),
      photo('16', { faces: [face(0.58), face(0.74)], segmentation: seg(0.01) }),
    ]);
    expect(scores.get('15')!.reasons.map((r) => r.code)).toContain('membre-coupe');
    expect(scores.get('16')!.reasons.map((r) => r.code)).not.toContain('membre-coupe');
    expect(scores.get('16')!.rank).toBe(1);
  });

  it('moto (n° 28 à 30) : des pieds cachés ne sont plus un argument', () => {
    // Même peau au bord sur les trois photos (aucune jambe nue coupée) : aucune raison « membre coupé ».
    const scores = scorePack(['28', '29', '30'].map((id) => photo(id, { faces: [face(0.4), face(0.75)], segmentation: seg(0.004) })));
    for (const s of scores.values()) expect(s.reasons.map((r) => r.code)).not.toContain('membre-coupe');
  });

  it('ruelle (n° 25/27) : un passant qui apparaît dans un paysage est signalé et fait préférer l’autre photo', () => {
    const passant = [{ label: 'person', score: 0.39, box: { x: 0.55, y: 0.5, width: 0.08, height: 0.2 } }];
    const scores = scorePack([photo('25', { objects: [] }), photo('27', { objects: passant, sharpness: 320 })]);
    expect(scores.get('27')!.reasons.map((r) => r.code)).toContain('arriere-plan');
    expect(scores.get('25')!.rank).toBe(1);
  });

  it('ruelle (n° 27) : des murs sombres ne sont pas des bords masqués hors d’un avion', () => {
    const scores = scorePack([photo('25', { obstruction: 0.01 }), photo('27', { obstruction: 0.3 })]);
    expect(scores.get('27')!.reasons.map((r) => r.code)).not.toContain('bords-masques');
  });

  it('visage masqué repéré par la silhouette (moins de peau de visage que d’habitude)', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) =>
      photo(id, { faces: [face(0.5)], segmentation: seg(0, [id === 'd' ? 0.35 : 0.7]) }),
    );
    const scores = scorePack(items);
    expect(scores.get('d')!.reasons.map((r) => r.code)).toContain('visage-masque');
    expect(scores.get('a')!.reasons.map((r) => r.code)).not.toContain('visage-masque');
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

  it('pénalise la photo dont le hublot cache plus de paysage (photos reconnues comme prises d’un avion)', () => {
    const wing = [{ index: 908, name: 'wing', score: 0.6 }];
    const scores = scorePack([
      photo('degagee', { obstruction: 0.02, labels: wing }),
      photo('masquee', { obstruction: 0.35, labels: wing }),
    ]);
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
    const weights = learnWeights(Array.from({ length: 60 }, (_, i) => [old(`a${i}`, 'garder', 1), old(`b${i}`, 'supprimer', 0.4)]).flat());
    for (const value of Object.values(weights)) expect(Number.isFinite(value)).toBe(true);
    expect(weights.expression).toBeGreaterThan(0);
  });
});
