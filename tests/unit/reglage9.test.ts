import { describe, expect, it } from 'vitest';
import { scorePack, selectPack, type FaceMetrics, type MediaItem, type PhotoScore } from '../../src/engine';
import { poseDifference } from '../../src/engine/selection/difference';

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

const photo = (id: string, at: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({
    id,
    kind: 'photo',
    fileName: `${id}.jpg`,
    isRaw: false,
    capturedAt: at,
    sharpness: 800,
    focal35: 24,
    faces: [face(0.3), face(0.7)],
    objects: [],
    tiltDeg: 0,
    tiltStrength: 0.05,
    exposure: null,
    color: null,
    signature: null,
    segmentation: null,
    embedding: [1, 0, 0],
    labels: null,
    obstruction: null,
    camera: true,
    hands: null,
    ...extra,
  }) as unknown as MediaItem;

const scoresOf = (values: Record<string, number>, expectedFaces = 2): Map<string, PhotoScore> =>
  new Map(Object.entries(values).map(([id, score], i) => [id, { id, score, rank: i + 1, vetoed: false, failed: false, reasons: [], expectedFaces } as unknown as PhotoScore]));

const pose = (items: MediaItem[]) => [{ id: 'p', label: 'A', items }];

describe('plusieurs photos d’une même pose (utilisateur, 19/11)', () => {
  it('différence : identique, légère (tête 8°), nette (sourire, tête 15°, personnes qui bougent, cadrage)', () => {
    const a = photo('a', 0);
    expect(poseDifference(a, photo('b', 1)).level).toBe('aucune');
    expect(poseDifference(a, photo('b', 1, { faces: [face(0.3, { yawDeg: 8 }), face(0.7)] })).level).toBe('legere');
    expect(poseDifference(a, photo('b', 1, { faces: [face(0.3, { smile: 0.2 }), face(0.7)] })).kinds).toContain('expression');
    expect(poseDifference(a, photo('b', 1, { faces: [face(0.3, { yawDeg: 15 }), face(0.7)] })).level).toBe('nette');
    const persons = (x: number) => [{ label: 'person', score: 0.9, box: { x, y: 0.4, width: 0.1, height: 0.3 } }];
    expect(poseDifference(photo('p', 0, { faces: [], objects: persons(0.2) }), photo('q', 1, { faces: [], objects: persons(0.35) })).kinds).toContain('personnes');
    expect(poseDifference(a, photo('b', 1, { embedding: [0.6, 0.8, 0] })).kinds).toContain('cadrage');
  });

  it('garde la meilleure, plus les bonnes nettement différentes ; supprime les identiques', () => {
    const items = [
      photo('best', 0),
      photo('autre-sourire', 1, { faces: [face(0.3, { smile: 0.2 }), face(0.7)] }),
      photo('identique', 2),
      photo('differente-mais-moins-bonne', 3, { faces: [face(0.3, { yawDeg: 20 }), face(0.7)] }),
    ];
    const d = selectPack(items, scoresOf({ best: 0.9, 'autre-sourire': 0.86, identique: 0.89, 'differente-mais-moins-bonne': 0.7 }), pose(items));
    expect(d.get('best')).toMatchObject({ keep: true, code: 'meilleure' });
    expect(d.get('autre-sourire')).toMatchObject({ keep: true, code: 'differente' });
    expect(d.get('identique')).toMatchObject({ keep: false, code: 'trop-proche' });
    expect(d.get('differente-mais-moins-bonne')!.keep).toBe(false);
  });

  it('une photo différente mais avec un défaut (regard ailleurs en groupe) n’est pas gardée en plus', () => {
    const items = [photo('best', 0), photo('regard', 1, { faces: [face(0.3, { yawDeg: 20 }), face(0.7)] })];
    const scores = scoresOf({ best: 0.9, regard: 0.88 });
    scores.get('regard')!.reasons = [{ code: 'regard-ailleurs', tone: 'moins' }];
    expect(selectPack(items, scores, pose(items)).get('regard')!.keep).toBe(false);
  });

  it('paysage : seule une différence nette garde une seconde photo (deux vues presque pareilles → une seule)', () => {
    const items = [photo('a', 0, { faces: [] }), photo('b', 1, { faces: [], embedding: [0.9, 0.436, 0] })];
    const d = selectPack(items, scoresOf({ a: 0.95, b: 0.94 }, 0), pose(items));
    expect(d.get('b')!.keep).toBe(false);
  });
});

describe('regard en groupe et photo prise par erreur (19/11)', () => {
  it('en groupe, quelqu’un qui regarde ailleurs est signalé et fait préférer l’autre photo', () => {
    const scores = scorePack([
      photo('tous', 0),
      photo('ailleurs', 1, { faces: [face(0.3), face(0.7, { gaze: 0.3 })] }),
    ]);
    expect(scores.get('ailleurs')!.reasons.some((r) => r.code === 'regard-ailleurs')).toBe(true);
    expect(scores.get('tous')!.score).toBeGreaterThan(scores.get('ailleurs')!.score);
  });

  it('seule sur la photo, une personne peut regarder ailleurs sans être signalée', () => {
    const scores = scorePack([photo('a', 0, { faces: [face(0.5, { gaze: 0.3 })] })]);
    expect(scores.get('a')!.reasons.some((r) => r.code === 'regard-ailleurs')).toBe(false);
  });

  it('photo du pied (aucune personne, floue, très penchée) : à vérifier au lieu d’être gardée d’office', () => {
    const items = [photo('pied', 0, { faces: [], sharpness: 133, tiltDeg: -12.9, tiltStrength: 0.04 })];
    const scores = scorePack(items);
    expect(scores.get('pied')!.accidental).toBe(true);
    expect(selectPack(items, scores, pose(items)).get('pied')).toMatchObject({ keep: true, review: true, code: 'a-verifier' });
  });
});
