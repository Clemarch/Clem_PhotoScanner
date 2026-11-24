import { describe, expect, it } from 'vitest';
import {
  accuracy,
  analyzeDay,
  buildQueue,
  calibrate,
  decodeBackup,
  emotionSummary,
  encodeBackup,
  encodeEmbedding,
  isSure,
  mergeValidations,
  shadowCompare,
  type ChoiceRecord,
  type FaceMetrics,
  type MediaItem,
  type PoseValidation,
} from '../../src/engine';

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


const val = (id: string, margin: number, proposed: string[], kept: string[], ms = 3000): PoseValidation => ({
  id,
  at: 1,
  sessionId: 's',
  packKey: 'p',
  margin,
  keys: ['a', 'b', 'c'],
  proposed,
  kept,
  ms,
});

describe('tri éclair : justesse et confiance calibrée (jalon 6)', () => {
  it('justesse par pose et par photo, validations trop rapides écartées', () => {
    // 3 : acceptée trop vite sans rien changer (écartée) ; 4 : corrigée vite (comptée : on a regardé).
    const a = accuracy([val('1', 0.1, ['a'], ['a']), val('2', 0.1, ['a'], ['b']), val('3', 0.1, ['a'], ['a'], 300), val('4', 0.1, ['a'], ['c'], 300)]);
    expect(a.poses).toEqual({ right: 1, total: 3 });
    expect(a.photos).toEqual({ right: 5, total: 9 });
  });

  it('une pose n’est « sûre » qu’après 30 poses validées à 90 % dans sa tranche d’écart', () => {
    const good = Array.from({ length: 30 }, (_, i) => val(`g${i}`, 0.2, ['a'], ['a']));
    expect(isSure(0.2, calibrate(good))).toBe(true);
    expect(isSure(0.01, calibrate(good))).toBe(false);
    expect(isSure(0.2, calibrate(good.slice(0, 29)))).toBe(false);
    const mixed = [...good, ...Array.from({ length: 5 }, (_, i) => val(`m${i}`, 0.2, ['a'], ['b']))];
    expect(isSure(0.2, calibrate(mixed))).toBe(false);
  });

  it('fusion des journaux : la validation la plus récente l’emporte', () => {
    const merged = mergeValidations([{ ...val('x', 0.1, ['a'], ['a']), at: 1 }], [{ ...val('x', 0.1, ['a'], ['b']), at: 2 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.kept).toEqual(['b']);
  });

  it('sauvegarde : journal, choix « validé » et proposition de l’app conservés ; anciennes sauvegardes lisibles', () => {
    const record: ChoiceRecord = { key: 'k', packKey: 'p', choice: 'garder', features: {} as ChoiceRecord['features'], baseScore: 0.5, at: 1, via: 'pose', app: 'supprimer' };
    const file = JSON.parse(JSON.stringify(encodeBackup([record], 5, [val('v', Infinity, ['a'], ['a'])])));
    const back = decodeBackup(file);
    expect(back.records[0]).toMatchObject({ via: 'pose', app: 'supprimer' });
    expect(back.validations[0]!.margin).toBe(Infinity);
    delete file.validations;
    file.choices = file.choices.map((row: unknown[]) => row.slice(0, 9));
    expect(decodeBackup(file).validations).toEqual([]);
  });
});

describe('tri éclair : file des poses', () => {
  const twoFaces = (smile: number) => [face(0.3, { smile }), face(0.7)];
  it('poses de plusieurs photos dans la file, proposition de l’app cochée ; photo seule gardée : sautée', () => {
    const items = [
      photo('a', 0, { faces: twoFaces(0.8), embedding: [1, 0, 0] }),
      photo('b', 1, { faces: twoFaces(0.79), embedding: [1, 0.01, 0] }),
      photo('paysage', 600, { faces: [], embedding: [0, 1, 0] }),
    ];
    const day = analyzeDay(items, 60, {}, new Set(), true);
    const queue = buildQueue(day, (it, p) => ({ keep: p.decisions.get(it.id)?.keep ?? true, review: p.decisions.get(it.id)?.review === true }), calibrate([]));
    expect(queue).toHaveLength(1);
    expect(queue[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(queue[0]!.proposed.size).toBeGreaterThan(0);
    expect(queue[0]!.sure).toBe(false);
    expect(queue[0]!.margin).toBeGreaterThanOrEqual(0);
  });
});

describe('nouvel œil en coulisse (réglage 13)', () => {
  // Empreintes CLIP de deux « styles » de photos : l'utilisateur garde toujours le style A.
  const unit = (seed: number) => {
    const v = Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.37 + seed));
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  const styleA = unit(1);
  const styleB = unit(2);
  const rec = (key: string, clip: number[], base: number): ChoiceRecord => ({
    key,
    packKey: 'p',
    choice: 'garder',
    features: {} as ChoiceRecord['features'],
    baseScore: base,
    at: 1,
    clip: encodeEmbedding(clip.map((x, i) => x + 0.02 * Math.cos(i + key.length)))!,
    emo: [0.5, 0.5, 0.5, 0.5, 0.2, 0.1],
  });

  it('apprend sur les autres séances et devine mieux que la formule quand la formule se trompe', () => {
    const records: ChoiceRecord[] = [];
    const validations: PoseValidation[] = [];
    for (const session of ['s1', 's2', 's3'])
      for (let i = 0; i < 20; i++) {
        const a = `${session}-${i}-a`;
        const b = `${session}-${i}-b`;
        // La formule préfère toujours la mauvaise photo (B).
        records.push(rec(a, styleA, 0.5), rec(b, styleB, 0.6));
        validations.push({ id: `${session}|${i}`, at: 1, sessionId: session, packKey: 'p', margin: 0.1, keys: [a, b], proposed: [b], kept: [a], ms: 3000 });
      }
    const s = shadowCompare(validations, records);
    expect(s.sessions).toBe(3);
    expect(s.tested).toBe(60);
    expect(s.formula).toBe(0);
    expect(s.eye).toBe(60);
  });

  it('une seule séance : pas de comparaison (rien pour apprendre sans tricher)', () => {
    const records = [rec('a', styleA, 0.5), rec('b', styleB, 0.6)];
    const s = shadowCompare([{ id: 's|1', at: 1, sessionId: 's', packKey: 'p', margin: 0.1, keys: ['a', 'b'], proposed: ['b'], kept: ['a'], ms: 3000 }], records);
    expect(s.tested).toBe(0);
    expect(s.pairs).toBe(1);
  });

  it('résumé des émotions des visages principaux, et sauvegarde des nouvelles mesures', () => {
    const happy = { probs: [0, 0, 0, 0, 0.9, 0.1, 0, 0], valence: 0.8, arousal: 0.2 };
    const sad = { probs: [0, 0, 0, 0, 0.1, 0.3, 0.6, 0], valence: -0.4, arousal: 0.1 };
    const item = photo('x', 0, { faces: [face(0.3, { emotion: happy }), face(0.7, { emotion: sad })] });
    const s = emotionSummary(item)!;
    expect(s[0]).toBeCloseTo(-0.4);
    expect(s[2]).toBeCloseTo(0.1);
    expect(s[5]).toBeCloseTo(0.6);
    const r = rec('k', styleA, 0.5);
    const back = decodeBackup(JSON.parse(JSON.stringify(encodeBackup([r], 1)))).records[0]!;
    expect(back.clip).toBe(r.clip);
    expect(back.emo).toEqual(r.emo);
  });
});
