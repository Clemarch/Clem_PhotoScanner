import { describe, expect, it } from 'vitest';
import { groupPoses, scorePack, type FaceMetrics, type MediaItem } from '../../src/engine';
import { measureSegmentation } from '../../src/engine/analysis/segmentation';
import { scoreFactors } from '../../src/ui/compare';
import { analyzeContent } from '../../src/engine/analysis/content';

const face = (x: number, over: Partial<FaceMetrics> = {}): FaceMetrics =>
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
    ...over,
  }) as FaceMetrics;

const photo = (id: string, atSeconds: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({
    id,
    kind: 'photo',
    fileName: `${id}.jpg`,
    isRaw: false,
    capturedAt: 1_800_000_000_000 + atSeconds * 1000,
    sharpness: 800,
    focal35: 24,
    faces: [],
    objects: [],
    tiltDeg: 0,
    tiltStrength: 0.05,
    exposure: null,
    color: null,
    signature: null,
    segmentation: null,
    embedding: null,
    labels: null,
    obstruction: null,
    camera: true,
    hands: null,
    ...extra,
  }) as unknown as MediaItem;


const solo = (id: string, at: number, over: Partial<FaceMetrics> = {}, extra: Partial<MediaItem> = {}) =>
  photo(id, at, { faces: [face(0.5, { upperColor: [200, 150, 120], lowerColor: [200, 150, 120], bodyColor: [30, 30, 40], ...over })], ...extra });

describe('retours du 19/11 au soir', () => {
  it('planche de surf tenue : ce qui passe devant les personnes n’est pas un défaut', () => {
    const board = [{ label: 'surfboard', score: 0.74, box: { x: 0.4, y: 0, width: 0.2, height: 1 } }];
    const items = [solo('a', 0), solo('b', 1), solo('c', 2), solo('d', 3, { bodyColor: [40, 90, 220] })];
    expect(scorePack(items).get('d')!.features.devant).toBeGreaterThan(0.3);
    const withBoard = items.map((it) => ({ ...it, objects: board }) as MediaItem);
    const scores = scorePack(withBoard);
    expect(scores.get('d')!.features.devant).toBe(0);
    expect(scores.get('d')!.reasons.some((r) => r.code === 'devant')).toBe(false);
  });

  it('personne seule tête baissée : pas comptée comme ayant les yeux fermés ; un vrai clignement, si', () => {
    const scores = scorePack([solo('baisse', 0, { eyesOpen: 0.11, pitchDeg: 42, offAxisVDeg: 42 }), solo('cligne', 1, { eyesOpen: 0.0, pitchDeg: 4 })]);
    expect(scores.get('baisse')!.vetoed).toBe(false);
    expect(scores.get('cligne')!.vetoed).toBe(true);
  });

  it('personne seule : regarder ailleurs ne baisse pas la note', () => {
    const scores = scorePack([solo('face', 0), solo('ailleurs', 1, { gaze: 0.04, yawDeg: -48 })]);
    expect(Math.abs(scores.get('face')!.score - scores.get('ailleurs')!.score)).toBeLessThan(0.01);
  });

  it('rafale très ressemblante : même pose même si le visage se déplace dans l’image', () => {
    const items = [photo('a', 0, { faces: [face(0.87)], embedding: [1, 0, 0] }), photo('b', 1, { faces: [face(0.7)], embedding: [0.9, 0.42, 0] })];
    expect(groupPoses(items)).toHaveLength(1);
  });

  it('la netteté qui compte est celle du visage, pas celle de l’arrière-plan', () => {
    const scores = scorePack([solo('fond-net', 0, { sharpness: 150 }, { sharpness: 2000 }), solo('visage-net', 1, { sharpness: 400 }, { sharpness: 500 })]);
    expect(scores.get('visage-net')!.score).toBeGreaterThan(scores.get('fond-net')!.score);
  });

  it('jambes coupées par le bas : pas de membre coupé', () => {
    const mask = new Uint8Array(400).map((_, i) => (Math.floor(i / 20) >= 17 ? 2 : 0));
    expect(measureSegmentation(mask, 20, 20, []).edgeBodySkin).toBe(0);
  });

  it('comparaison : la netteté de l’image entière n’apparaît pas quand il y a des visages', () => {
    const scores = scorePack([solo('a', 0, {}, { sharpness: 2000 }), solo('b', 1, { smile: 0.2, expression: 0.5 }, { sharpness: 300 })]);
    const rows = scoreFactors(scores.get('a')!, scores.get('b')!, true);
    expect(rows.some((r) => r.feature === 'nettete')).toBe(false);
    expect(rows.find((r) => r.feature === 'expression')!.favours).toBe('a');
  });
});

describe('retours du 20/11', () => {
  it('une tasse tenue en main par la personne n’est pas un objet gênant ; posée loin d’elle, si', () => {
    const f = face(0.5);
    const person = { label: 'person', score: 0.95, box: { x: 0.3, y: 0.2, width: 0.4, height: 0.8 } };
    const tenue = { label: 'cup', score: 0.8, box: { x: 0.45, y: 0.6, width: 0.08, height: 0.1 } };
    expect(analyzeContent([f], [], [person, tenue]).distractions).toEqual([]);
    const posee = { label: 'cup', score: 0.8, box: { x: 0.72, y: 0.6, width: 0.08, height: 0.1 } };
    expect(analyzeContent([f], [], [person, posee]).distractions).toEqual(['cup']);
  });
});
