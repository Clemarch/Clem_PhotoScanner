import { describe, expect, it } from 'vitest';
import {
  analyzeDay,
  classifyPack,
  groupPoses,
  imageSignature,
  learnWeights,
  learnedAdjustment,
  measureColor,
  scorePack,
  selectPack,
  signatureDistance,
  FEATURE_NAMES,
  type ChoiceRecord,
  type ColorStats,
  type FaceMetrics,
  type Features,
  type MediaItem,
  type PhotoScore,
} from '../../src/engine';

const T0 = Date.UTC(2026, 10, 16, 18, 4, 0);

/** Empreinte uniforme d'une couleur, avec une petite variation pour distinguer des quasi-doublons. */
const sig = (r: number, g: number, b: number): number[] => Array.from({ length: 64 }, () => [r, g, b]).flat();

const item = (id: string, seconds: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({
    id,
    kind: 'photo',
    isRaw: false,
    fileName: `IMG_${id}.HEIC`,
    capturedAt: T0 + seconds * 1000,
    sharpness: 500,
    focal35: 24,
    faces: [],
    objects: null,
    tiltDeg: null,
    tiltStrength: null,
    exposure: null,
    color: null,
    signature: sig(120, 120, 120),
    ...extra,
  }) as MediaItem;

const scoresOf = (values: Record<string, number>, vetoed: string[] = []): Map<string, PhotoScore> =>
  new Map(
    Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .map(([id, score], i) => [id, { id, score, rank: i + 1, vetoed: vetoed.includes(id) } as PhotoScore]),
  );

describe('groupes de pose', () => {
  it('garde ensemble des photos semblables prises à la suite', () => {
    const groups = groupPoses([item('a', 0), item('b', 2, { signature: sig(124, 120, 118) }), item('c', 4)]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['a', 'b', 'c']]);
    expect(groups[0]!.label).toBe('A');
  });

  it('ouvre un nouveau groupe quand le cadre change', () => {
    const groups = groupPoses([item('a', 0), item('b', 2), item('c', 4, { signature: sig(30, 60, 200) }), item('d', 6, { signature: sig(32, 60, 198) })]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(groups.map((g) => g.label)).toEqual(['A', 'B']);
  });

  it('ouvre un nouveau groupe après une pause', () => {
    expect(groupPoses([item('a', 0), item('b', 40)])).toHaveLength(2);
  });

  it('ouvre un nouveau groupe quand un visage se déplace beaucoup', () => {
    const at = (x: number) => [{ box: { x, y: 0.3, width: 0.1, height: 0.1 }, areaRatio: 0.05 } as FaceMetrics];
    expect(groupPoses([item('a', 0, { faces: at(0.2) }), item('b', 2, { faces: at(0.6) })])).toHaveLength(2);
    expect(groupPoses([item('a', 0, { faces: at(0.2) }), item('b', 2, { faces: at(0.24) })])).toHaveLength(1);
  });
});

describe('sélection', () => {
  const pose = (items: MediaItem[]) => groupPoses(items);

  it('garde 2 photos sur 8 d’une même pose, les meilleures et différentes', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(String(i + 1), i * 2, { signature: sig(110 + i * 4, 120, 120) }));
    const scores = scoresOf({ '1': 0.9, '2': 0.7, '3': 0.95, '4': 0.93, '5': 0.6, '6': 0.8, '7': 0.92, '8': 0.5 });
    const d = selectPack(items, scores, pose(items));
    const kept = [...d].filter(([, x]) => x.keep).map(([id]) => id);
    expect(kept).toHaveLength(2);
    expect(kept).toContain('3');
    expect(d.get('3')!.code).toBe('meilleure');
    expect(d.get('8')!.keep).toBe(false);
  });

  it('la qualité d’abord : ne préfère jamais une photo moins bonne parce qu’elle est différente (pose B du 17/11)', () => {
    // 9, 11 et 12 se ressemblent et sont les mieux notées ; 17 est différente mais moins bonne.
    // Écart d'empreinte entre photos voisines : environ 0,017, comme dans le rapport (0,02 à 0,04).
    const ids = ['9', '10', '11', '12', '13', '14', '15', '16', '17'];
    const items = ids.map((id, i) => item(id, i * 2, { signature: sig(60 + i * 13, 120, 120) }));
    const d = selectPack(
      items,
      scoresOf({ '9': 0.87, '10': 0.84, '11': 0.869, '12': 0.868, '13': 0.83, '14': 0.78, '15': 0.8, '16': 0.82, '17': 0.83 }),
      pose(items),
    );
    expect(d.get('9')!.keep).toBe(true);
    expect(d.get('11')!.keep).toBe(true);
    expect(d.get('17')!.keep).toBe(false);
    // Le refus s'explique par les photos mieux notées gardées à sa place.
    expect(d.get('17')).toMatchObject({ code: 'budget', keptIds: ['9', '11'] });
  });

  it('ne garde pas une seconde photo trop moins bonne que la meilleure', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(String(i), i, { signature: sig(100 + i * 3, 120, 120) }));
    const values = Object.fromEntries(items.map((it, i) => [it.id, i === 0 ? 0.95 : 0.6]));
    const d = selectPack(items, scoresOf(values), pose(items));
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(1);
    expect([...d.values()].some((x) => x.code === 'moins-bonne')).toBe(true);
  });

  it('écarte un quasi-doublon de la meilleure', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(String(i), i, { signature: sig(120 + (i === 1 ? 1 : i * 4), 120, 120) }));
    const values = Object.fromEntries(items.map((it, i) => [it.id, i === 0 ? 0.95 : i === 1 ? 0.94 : 0.5]));
    const d = selectPack(items, scoresOf(values), pose(items));
    expect(d.get('1')!.code).toBe('trop-proche');
    expect(d.get('1')!.refId).toBe('0');
  });

  it('écarte les photos sous veto et garde quand même au moins une photo', () => {
    const items = [item('a', 0), item('b', 1)];
    const d = selectPack(items, scoresOf({ a: 0.9, b: 0.8 }, ['a', 'b']), pose(items));
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(1);
    expect(d.get('a')!.keep).toBe(true);
    expect(d.get('a')!.code).toBe('minimum');
  });

  it('respecte le plafond du paquet (25 %) même avec plusieurs poses', () => {
    const colors = [10, 60, 110, 160, 210];
    const items = colors.map((c, i) => item(String(i), i * 2, { signature: sig(c, 255 - c, 120) }));
    const d = selectPack(items, scoresOf(Object.fromEntries(items.map((it, i) => [it.id, 0.9 - i * 0.01]))), pose(items));
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(2);
    expect([...d.values()].filter((x) => x.code === 'plafond')).toHaveLength(3);
  });

  it('garde la photo seule d’un paquet', () => {
    const items = [item('a', 0)];
    expect(selectPack(items, scoresOf({ a: 0.3 }), pose(items)).get('a')).toMatchObject({ keep: true, code: 'seule' });
  });
});

describe('couleurs et type de photo', () => {
  const image = (r: number, g: number, b: number, w = 20, h = 20) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([r, g, b, 255], i * 4);
    return rgba;
  };

  it('reconnaît un ciel orangé de coucher de soleil', () => {
    const orange = measureColor(image(240, 140, 40), 20, 20);
    expect(orange.warmFraction).toBe(1);
    expect(orange.warmStrength).toBeGreaterThan(0.7);
    const blue = measureColor(image(60, 110, 200), 20, 20);
    expect(blue.warmFraction).toBe(0);
  });

  it('mesure la vivacité et le contraste', () => {
    expect(measureColor(image(128, 128, 128), 20, 20).colorfulness).toBe(0);
    const half = image(0, 0, 0);
    for (let i = 0; i < 200; i++) half.set([255, 255, 255, 255], i * 4);
    expect(measureColor(half, 20, 20, 1).contrast).toBe(1);
  });

  it('compare les empreintes', () => {
    const a = imageSignature(image(200, 100, 50), 20, 20);
    expect(a).toHaveLength(192);
    expect(signatureDistance(a, a)).toBe(0);
    expect(signatureDistance(a, imageSignature(image(55, 155, 205), 20, 20))).toBeCloseTo((145 + 55 + 155) / 3 / 255, 4);
    expect(signatureDistance(null, a)).toBe(Infinity);
  });

  const color = (extra: Partial<ColorStats>): ColorStats => ({
    saturation: 0.4,
    colorfulness: 0.4,
    warmFraction: 0,
    warmStrength: 0,
    contrast: 0.4,
    mean: 0.45,
    ...extra,
  });

  it('devine le type de paquet', () => {
    const f = { areaRatio: 0.04 } as FaceMetrics;
    expect(classifyPack([item('a', 0, { focal35: 23 })], 2, () => [f, f])).toBe('selfie');
    expect(classifyPack([item('a', 0, { focal35: 26 })], 1, () => [f])).toBe('portrait');
    expect(classifyPack([item('a', 0)], 4, () => [f, f, f, f])).toBe('groupe');
    expect(classifyPack([item('a', 0, { color: color({ warmFraction: 0.3, warmStrength: 0.6 }) })], 0, () => [])).toBe('coucher');
    expect(classifyPack([item('a', 0, { color: color({}) })], 0, () => [])).toBe('paysage');
  });

  it('coucher de soleil : préfère les couleurs chaudes les plus intenses', () => {
    const sunset = (id: string, warm: number) =>
      item(id, 0, { color: color({ warmFraction: 0.3 * warm, warmStrength: 0.6, contrast: 0.5, colorfulness: 0.5 }) });
    const scores = scorePack([sunset('pale', 0.6), sunset('intense', 1), sunset('moyen', 0.8)]);
    expect(scores.get('intense')!.rank).toBe(1);
    expect(scores.get('pale')!.rank).toBe(3);
    expect(scores.get('intense')!.reasons.map((r) => r.code)).toContain('couleurs-vives');
    expect(scores.get('pale')!.reasons.map((r) => r.code)).toContain('couleurs-ternes');
  });

  it('paysage : préfère l’exposition équilibrée à une photo trop sombre ou trop claire', () => {
    const land = (id: string, mean: number) => item(id, 0, { color: color({ mean }) });
    const scores = scorePack([land('sombre', 0.18), land('equilibree', 0.46), land('claire', 0.8)]);
    expect(scores.get('equilibree')!.rank).toBe(1);
  });
});

describe('apprentissage des goûts', () => {
  const features = (over: Partial<Features>): Features => ({
    ...(Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0.5])) as Features),
    ...over,
  });
  const record = (key: string, choice: 'garder' | 'supprimer', f: Partial<Features>, baseScore = 0.8, pack = 'p1'): ChoiceRecord => ({
    key,
    packKey: pack,
    choice,
    features: features(f),
    baseScore,
    at: 0,
  });

  it('n’apprend rien sans choix opposés dans un même paquet', () => {
    expect(learnWeights([])).toEqual({});
    expect(learnWeights([record('a', 'garder', {}), record('b', 'garder', {})])).toEqual({});
    expect(learnWeights([record('a', 'garder', {}, 0.8, 'p1'), record('b', 'supprimer', {}, 0.8, 'p2')])).toEqual({});
  });

  it('apprend qu’un critère compte quand l’utilisateur garde toujours la photo qui l’a', () => {
    // L'utilisateur garde les photos à couleurs vives, même un peu moins bien notées par l'app.
    const records = [
      record('a', 'garder', { couleurs: 0.9 }, 0.78),
      record('b', 'supprimer', { couleurs: 0.3 }, 0.82),
      record('c', 'garder', { couleurs: 1 }, 0.75, 'p2'),
      record('d', 'supprimer', { couleurs: 0.4 }, 0.8, 'p2'),
    ];
    const weights = learnWeights(records);
    expect(weights.couleurs).toBeGreaterThan(0.05);
    const vivid = learnedAdjustment(features({ couleurs: 1 }), weights);
    const dull = learnedAdjustment(features({ couleurs: 0.2 }), weights);
    expect(vivid).toBeGreaterThan(dull);
    // Avec ce bonus, l'app classe désormais comme l'utilisateur sur ces exemples.
    expect(0.78 + learnedAdjustment(records[0]!.features, weights)).toBeGreaterThan(0.82 + learnedAdjustment(records[1]!.features, weights));
  });

  it('reste plafonné', () => {
    const many = Array.from({ length: 40 }, (_, i) => [
      record(`k${i}`, 'garder', { sourire: 1 }, 0.5, `p${i}`),
      record(`s${i}`, 'supprimer', { sourire: 0 }, 0.95, `p${i}`),
    ]).flat();
    const weights = learnWeights(many);
    expect(Math.abs(weights.sourire!)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(learnedAdjustment(features({ sourire: 1 }), weights))).toBeLessThanOrEqual(0.2);
  });
});

describe('journée complète', () => {
  it('enchaîne paquets, notes, poses et décisions', () => {
    const items = [item('a', 0), item('b', 2), item('c', 4), item('d', 600)];
    const day = analyzeDay(items, 60);
    expect(day.packs).toHaveLength(2);
    expect(day.packs[0]!.poses).toHaveLength(1);
    expect([...day.packs[0]!.decisions.values()].filter((d) => d.keep)).toHaveLength(1);
    expect(day.packs[1]!.decisions.get('d')).toMatchObject({ keep: true, code: 'seule' });
    expect(day.packs[0]!.key).toBe(String(T0));
  });
});
