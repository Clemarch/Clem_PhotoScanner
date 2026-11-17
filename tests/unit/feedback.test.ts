// Retours de l'utilisateur sur son paquet de selfies du 16/11 (8 photos, deux personnes).
// Les mesures viennent de son rapport de diagnostic (réglage 3). Il garde les n° 1, 3 et 7.

import { describe, expect, it } from 'vitest';
import { scorePack, type DetectedObject, type FaceMetrics, type MediaItem, type Rgb } from '../../src/engine';

interface FaceInput {
  x: number;
  eyes: number;
  smile: number;
  pout: number;
  sharp: number;
  upper: Rgb;
  lower: Rgb;
}

const box = (x: number) => ({ x: x - 0.1, y: 0.45, width: 0.2, height: 0.22 });

function face(f: FaceInput): FaceMetrics {
  // Expression recalculée comme le moteur : calme 0,7, sourire ou pose jusqu'à +0,3.
  const expression = Math.min(1, 0.7 + 0.3 * Math.max(f.smile, f.pout));
  return {
    box: box(f.x),
    areaRatio: 0.044,
    eyesOpen: f.eyes,
    gaze: 1,
    expression,
    smile: f.smile,
    sharpness: f.sharp,
    cut: false,
    yawDeg: 0,
    pitchDeg: 0,
    offAxisHDeg: 0,
    offAxisVDeg: 0,
    eyeH: 0,
    eyeV: 0,
    talking: 0,
    pout: f.pout,
    upperColor: f.upper,
    lowerColor: f.lower,
    bodyColor: [230, 225, 220],
  };
}

const persons = (left: number, right: number): DetectedObject[] => [
  { label: 'person', score: 0.88, box: { x: left - 0.2, y: 0.4, width: 0.4, height: 0.6 } },
  { label: 'person', score: 0.86, box: { x: right - 0.2, y: 0.4, width: 0.4, height: 0.6 } },
];

const photo = (id: string, faces: FaceMetrics[], objects: DetectedObject[]): MediaItem =>
  ({
    id,
    kind: 'photo',
    isRaw: false,
    sharpness: 680,
    focal35: 23,
    faces,
    objects,
    tiltDeg: 0,
    tiltStrength: 0.06,
    exposure: null,
    color: null,
    signature: null,
  }) as MediaItem;

// Mesures du rapport (position du visage, yeux, sourire, moue, netteté, couleurs haut et bas du visage).
const pack = [
  photo('1', [
    face({ x: 0.57, eyes: 1, smile: 0.77, pout: 0, sharp: 1187, upper: [125, 82, 74], lower: [157, 99, 86] }),
    face({ x: 0.78, eyes: 1, smile: 0.78, pout: 0, sharp: 244, upper: [128, 96, 95], lower: [119, 85, 79] }),
  ], persons(0.57, 0.78)),
  photo('2', [
    face({ x: 0.51, eyes: 1, smile: 0, pout: 0.33, sharp: 575, upper: [136, 99, 91], lower: [149, 97, 87] }),
    face({ x: 0.76, eyes: 1, smile: 0.73, pout: 0, sharp: 279, upper: [124, 96, 94], lower: [114, 85, 79] }),
  ], persons(0.51, 0.76)),
  photo('3', [
    face({ x: 0.52, eyes: 1, smile: 0.78, pout: 0, sharp: 376, upper: [140, 102, 94], lower: [150, 101, 89] }),
    face({ x: 0.76, eyes: 1, smile: 0.77, pout: 0, sharp: 327, upper: [132, 101, 98], lower: [109, 81, 74] }),
  ], persons(0.52, 0.76)),
  photo('4', [
    face({ x: 0.5, eyes: 1, smile: 0.85, pout: 0, sharp: 611, upper: [146, 105, 97], lower: [141, 94, 83] }),
    face({ x: 0.76, eyes: 1, smile: 0.79, pout: 0, sharp: 341, upper: [130, 100, 99], lower: [107, 79, 73] }),
  ], persons(0.5, 0.76)),
  photo('5', [
    face({ x: 0.57, eyes: 1, smile: 0.82, pout: 0, sharp: 546, upper: [139, 100, 92], lower: [139, 93, 82] }),
    face({ x: 0.82, eyes: 1, smile: 0.8, pout: 0, sharp: 319, upper: [125, 97, 96], lower: [104, 77, 72] }),
  ], persons(0.57, 0.82)),
  photo('6', [
    face({ x: 0.56, eyes: 1, smile: 0, pout: 0.16, sharp: 515, upper: [142, 104, 96], lower: [138, 93, 81] }),
    face({ x: 0.81, eyes: 1, smile: 0.81, pout: 0, sharp: 323, upper: [125, 98, 98], lower: [105, 79, 74] }),
  ], persons(0.56, 0.81)),
  // Photo 7 : le visage de gauche n'a pas été trouvé, mais la personne est bien là (détecteur d'objets).
  photo('7', [face({ x: 0.82, eyes: 1, smile: 0.79, pout: 0, sharp: 319, upper: [127, 99, 100], lower: [104, 78, 73] })], persons(0.55, 0.82)),
  photo('8', [
    face({ x: 0.51, eyes: 0.06, smile: 0.51, pout: 0, sharp: 299, upper: [126, 86, 75], lower: [122, 75, 65] }),
    face({ x: 0.79, eyes: 1, smile: 0.8, pout: 0, sharp: 344, upper: [136, 105, 105], lower: [115, 86, 80] }),
  ], persons(0.51, 0.79)),
];

describe('retours de l’utilisateur sur ses selfies du 16/11', () => {
  const scores = scorePack(pack);
  const codes = (id: string) => scores.get(id)!.reasons.map((r) => r.code);

  it('la moue est une pose voulue, pas un défaut', () => {
    expect(codes('2')).not.toContain('moue');
    expect(codes('6')).toContain('pose');
    expect(scores.get('6')!.reasons.find((r) => r.code === 'pose')!.tone).toBe('plus');
  });

  it('photo 7 : aucun visage n’est dit caché, aucun passant n’est inventé', () => {
    expect(codes('7')).not.toContain('visage-cache');
    expect(codes('7')).not.toContain('arriere-plan');
    expect(codes('7')).toContain('visage-non-analyse');
    // Pénalité légère seulement : elle reste au niveau des bonnes photos.
    expect(scores.get('7')!.score).toBeGreaterThan(scores.get('4')!.score - 0.1);
  });

  it('photo 1 : la casquette portée sur la tête n’est pas un masquage', () => {
    expect(codes('1')).not.toContain('visage-masque');
    expect(scores.get('1')!.occlusion).toBeLessThan(0.1);
  });

  it('photo 8 (yeux fermés) reste écartée', () => {
    expect(scores.get('8')!.vetoed).toBe(true);
  });

  it('les photos gardées par l’utilisateur (1, 3, 7) sont toutes dans la moitié haute', () => {
    for (const id of ['1', '3', '7']) expect(scores.get(id)!.rank).toBeLessThanOrEqual(5);
  });
});
