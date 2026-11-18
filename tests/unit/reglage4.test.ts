import { describe, expect, it } from 'vitest';
import { analyzeDay, asideKind, scorePack, type FaceMetrics, type MediaItem } from '../../src/engine';

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

const photo = (id: string, at: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({
    id,
    kind: 'photo',
    fileName: `${id}.jpg`,
    isRaw: false,
    capturedAt: at,
    sharpness: 300,
    focal35: 24,
    faces: [],
    objects: [],
    tiltDeg: null,
    tiltStrength: null,
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
  }) as MediaItem;

describe('fichiers mis de côté (réglage 4)', () => {
  it('une capture d’écran (sans appareil photo) est mise de côté, jamais proposée à la suppression', () => {
    const day = analyzeDay([photo('a', 1000), photo('capture', 2000, { camera: false }), photo('b', 3000)], 60);
    expect(day.setAside.map((i) => i.id)).toEqual(['capture']);
    expect(day.packs[0]!.pack.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(asideKind(day.setAside[0]!)).toBe('capture');
  });

  it('une photo d’écran ou de document sans visage est mise de côté', () => {
    const screen = photo('ecran', 1000, { labels: [{ index: 664, name: 'monitor', score: 0.6 }] });
    const doc = photo('menu', 1000, { labels: [{ index: 922, name: 'menu', score: 0.45 }] });
    expect(asideKind(screen)).toBe('document');
    expect(asideKind(doc)).toBe('document');
    // Peu sûr, ou une personne devant la télévision : reste une photo à trier.
    expect(asideKind(photo('doute', 1000, { labels: [{ index: 664, name: 'monitor', score: 0.2 }] }))).toBeNull();
    expect(asideKind(photo('tv', 1000, { labels: [{ index: 851, name: 'television', score: 0.6 }], faces: [face(0.5)] }))).toBeNull();
    // Métadonnées inconnues : on ne présume rien.
    expect(asideKind(photo('inconnu', 1000, { camera: null }))).toBeNull();
  });
});

describe('gestes (réglage 4)', () => {
  it('un V de la victoire fait préférer la photo, à expressions égales', () => {
    const v = { gesture: 'Victory', score: 0.85, box: { x: 0.6, y: 0.5, width: 0.1, height: 0.15 } };
    const scores = scorePack([
      photo('sans', 1000, { faces: [face(0.3), face(0.7)] }),
      photo('avec-v', 2000, { faces: [face(0.3), face(0.7)], hands: [v] }),
    ]);
    const sans = scores.get('sans')!;
    const avec = scores.get('avec-v')!;
    expect(avec.score).toBeGreaterThan(sans!.score);
    expect(avec.reasons.some((r) => r.code === 'geste')).toBe(true);
  });

  it('une main sans geste particulier ou peu sûre ne change rien', () => {
    const scores = scorePack([
      photo('a', 1000, { faces: [face(0.5)], hands: [{ gesture: 'None', score: 0.9, box: { x: 0, y: 0, width: 0.1, height: 0.1 } }] }),
      photo('b', 2000, { faces: [face(0.5)], hands: [{ gesture: 'Victory', score: 0.4, box: { x: 0, y: 0, width: 0.1, height: 0.1 } }] }),
    ]);
    expect(scores.get('a')!.score).toBeCloseTo(scores.get('b')!.score, 6);
  });
});
