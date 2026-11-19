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
    segmentation: null,
    embedding: null,
    labels: null,
    obstruction: null, camera: null, hands: null,
    ...extra,
  }) as MediaItem;

const scoresOf = (values: Record<string, number>, vetoed: string[] = []): Map<string, PhotoScore> =>
  new Map(
    Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .map(([id, score], i) => [
        id,
        { id, score, rank: i + 1, vetoed: vetoed.includes(id), failed: vetoed.includes(id) } as PhotoScore,
      ]),
  );

describe('groupes de pose', () => {
  it('rafale avec zoom (plage du 17/11) : une seule pose malgré une empreinte qui change', () => {
    // Empreintes fines assez différentes (zoom 33 → 58 mm) mais prises à 1 ou 2 s d'écart, même nombre de visages.
    const e = (a: number) => [Math.cos(a), Math.sin(a), 0];
    const items = [0, 0.5, 0.9, 1.1].map((a, i) => item(String(i), i * 1.5, { embedding: e(a), signature: sig(40 + i * 60, 120, 120) }));
    expect(groupPoses(items)).toHaveLength(1);
  });

  it('nouvelle pose si la scène change vraiment, même en rafale', () => {
    const items = [item('a', 0, { embedding: [1, 0, 0] }), item('b', 1, { embedding: [0, 1, 0] })];
    expect(groupPoses(items)).toHaveLength(2);
  });

  it('hors rafale, l’empreinte fine décide', () => {
    const items = [item('a', 0, { embedding: [1, 0, 0] }), item('b', 10, { embedding: [0.95, 0.31, 0] }), item('c', 20, { embedding: [0.5, 0.86, 0] })];
    expect(groupPoses(items).map((g) => g.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });

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

  it('une seule photo gardée par pose, la mieux notée (demande de l’utilisateur, 18/11)', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(String(i + 1), i * 2, { signature: sig(110 + i * 4, 120, 120) }));
    const scores = scoresOf({ '1': 0.9, '2': 0.7, '3': 0.95, '4': 0.94, '5': 0.6, '6': 0.8, '7': 0.92, '8': 0.5 });
    const d = selectPack(items, scores, pose(items));
    expect([...d].filter(([, x]) => x.keep).map(([id]) => id)).toEqual(['3']);
    expect(d.get('3')!.code).toBe('meilleure');
    // Paysage (aucun visage attendu) : même une photo presque aussi bonne est à supprimer, l'app tranche.
    expect(d.get('4')!.keep).toBe(false);
  });

  it('deux photos identiques d’un paysage (bateau du 18/11, n° 19 et 20) : une seule gardée', () => {
    const items = [item('19', 0, { signature: sig(60, 120, 120) }), item('20', 1, { signature: sig(62, 120, 120) })];
    const d = selectPack(items, scoresOf({ '19': 0.99, '20': 1 }), pose(items));
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(1);
    expect(d.get('20')!.keep).toBe(true);
  });

  it('photos de personnes identiques (rien ne change) : seule la meilleure est gardée (utilisateur, 19/11)', () => {
    const ids = ['9', '10', '11', '12'];
    const items = ids.map((id, i) => item(id, i * 2, { signature: sig(120 + i, 120, 120) }));
    const scores = scoresOf({ '9': 0.87, '10': 0.86, '11': 0.84, '12': 0.8 });
    for (const s of scores.values()) s.expectedFaces = 2;
    const d = selectPack(items, scores, pose(items));
    expect(d.get('9')).toMatchObject({ keep: true, code: 'meilleure' });
    for (const id of ['10', '11', '12']) expect(d.get(id)!.keep).toBe(false);
  });

  it('ne garde pas une seconde photo trop moins bonne que la meilleure', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(String(i), i, { signature: sig(100 + i * 3, 120, 120) }));
    const values = Object.fromEntries(items.map((it, i) => [it.id, i === 0 ? 0.95 : 0.6]));
    const d = selectPack(items, scoresOf(values), pose(items));
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(1);
    expect([...d.values()].every((x) => x.keep || x.code === 'moins-bonne' || x.code === 'trop-proche')).toBe(true);
  });

  it('écarte un quasi-doublon de la meilleure', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(String(i), i, { signature: sig(120 + (i === 1 ? 1 : i * 4), 120, 120) }));
    const values = Object.fromEntries(items.map((it, i) => [it.id, i === 0 ? 0.95 : i === 1 ? 0.94 : 0.5]));
    const d = selectPack(items, scoresOf(values), pose(items));
    expect(d.get('1')!.code).toBe('trop-proche');
    expect(d.get('1')!.refId).toBe('0');
  });

  it('paquet entièrement raté : toutes les photos peuvent être supprimées', () => {
    const items = [item('a', 0), item('b', 1)];
    const d = selectPack(items, scoresOf({ a: 0.9, b: 0.8 }, ['a', 'b']), pose(items));
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(0);
    expect(d.get('a')!.code).toBe('ratee');
  });

  it('photo seule ratée : supprimable ; photo seule correcte : gardée', () => {
    const one = [item('a', 0)];
    expect(selectPack(one, scoresOf({ a: 0.3 }, ['a']), pose(one)).get('a')).toMatchObject({ keep: false, code: 'ratee' });
    expect(selectPack(one, scoresOf({ a: 0.3 }), pose(one)).get('a')).toMatchObject({ keep: true, code: 'seule' });
  });

  it('garde au moins une photo si une seule n’est pas ratée', () => {
    const items = [item('a', 0), item('b', 1)];
    const d = selectPack(items, scoresOf({ a: 0.9, b: 0.5 }, ['a']), pose(items));
    expect(d.get('b')!.keep).toBe(true);
    expect(d.get('a')!.code).toBe('veto');
  });

  it('un paquet de 2 photos de poses différentes garde les 2', () => {
    const items = [item('a', 0, { signature: sig(60, 120, 120) }), item('b', 30, { signature: sig(200, 40, 40) })];
    const d = selectPack(items, scoresOf({ a: 0.9, b: 0.7 }), [
      { id: 'p1', label: 'A', items: [items[0]!] },
      { id: 'p2', label: 'B', items: [items[1]!] },
    ]);
    expect([...d.values()].filter((x) => x.keep)).toHaveLength(2);
  });

  it('écarte un quasi-doublon d’après l’empreinte fine', () => {
    const v = (x: number) => [x, 1 - x, 0.3];
    const items = [item('a', 0, { embedding: v(0.6) }), item('b', 1, { embedding: v(0.6001) }), item('c', 2, { embedding: v(0.2) })];
    const scores = scoresOf({ a: 0.9, b: 0.89, c: 0.89 });
    for (const sc of scores.values()) sc.expectedFaces = 1;
    const d = selectPack(items, scores, [{ id: 'p', label: 'A', items }]);
    expect(d.get('b')).toMatchObject({ keep: false, code: 'trop-proche', refId: 'a' });
    expect(d.get('c')).toMatchObject({ keep: true, review: true });
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

  it('reconnaît les documents, la nourriture et les animaux grâce au classement de scène', () => {
    const lab = (index: number) => [{ index, name: 'x', score: 0.6 }];
    expect(classifyPack([item('a', 0, { labels: lab(916) })], 0, () => [])).toBe('document');
    expect(classifyPack([item('a', 0, { labels: lab(963) })], 0, () => [])).toBe('nourriture');
    expect(classifyPack([item('a', 0, { labels: lab(207) })], 0, () => [])).toBe('animal');
    // Avec des personnes, le type reste celui des personnes.
    const f = { areaRatio: 0.04 } as FaceMetrics;
    expect(classifyPack([item('a', 0, { labels: lab(207), focal35: 26 })], 1, () => [f])).toBe('portrait');
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
    // Préférence constante sur 100 paquets : l'apprentissage, prudent avec peu de choix, s'y fie.
    const records = Array.from({ length: 50 }, (_, i) => [
      record(`a${i}`, 'garder', { couleurs: 0.9 }, 0.78, `p${i}`),
      record(`b${i}`, 'supprimer', { couleurs: 0.3 }, 0.82, `p${i}`),
      record(`c${i}`, 'garder', { couleurs: 1 }, 0.75, `q${i}`),
      record(`d${i}`, 'supprimer', { couleurs: 0.4 }, 0.8, `q${i}`),
    ]).flat();
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
    // Peu de choix (4) : ajustement minime.
    const few = learnWeights(many.slice(0, 4));
    expect(Math.abs(learnedAdjustment(features({ sourire: 1 }), few))).toBeLessThan(0.02);
    expect(Math.abs(learnedAdjustment(features({ sourire: 1 }), weights))).toBeLessThanOrEqual(0.2);
  });
});

describe('apprentissage centré sur le paquet', () => {
  it('départage les photos sans relever tout le paquet', () => {
    const f = (equilibre: number): Features =>
      ({ ...(Object.fromEntries(FEATURE_NAMES.map((n) => [n, 1])) as Features), equilibre });
    const items = [item('a', 0, { color: { saturation: 0.4, colorfulness: 0.4, warmFraction: 0, warmStrength: 0, contrast: 0.4, mean: 0.45 } }),
      item('b', 2, { color: { saturation: 0.4, colorfulness: 0.4, warmFraction: 0, warmStrength: 0, contrast: 0.4, mean: 0.25 } })];
    const scores = scorePack(items, { equilibre: 0.3 });
    const a = scores.get('a')!;
    const b = scores.get('b')!;
    // Les ajustements se compensent : l'un monte, l'autre descend.
    expect(a.learned).toBeGreaterThan(0);
    expect(b.learned).toBeLessThan(0);
    expect(a.learned + b.learned).toBeCloseTo(0, 5);
    void f;
  });
});

describe('journée complète', () => {
  it('réunit à la main un paquet au précédent', () => {
    const items = [item('a', 0), item('b', 2), item('c', 200), item('d', 400)];
    const separate = analyzeDay(items, 60);
    expect(separate.packs).toHaveLength(3);
    const joined = analyzeDay(items, 60, {}, new Set([separate.packs[1]!.key]));
    expect(joined.packs).toHaveLength(2);
    expect(joined.packs[0]!.pack.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(joined.packs[0]!.joined).toEqual([separate.packs[1]!.key]);
  });

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
