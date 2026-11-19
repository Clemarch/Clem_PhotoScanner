import { describe, expect, it } from 'vitest';
import {
  BACKUP_VERSION,
  FEATURE_NAMES,
  analyzeDay,
  cosine,
  decodeBackup,
  decodeEmbedding,
  encodeBackup,
  encodeEmbedding,
  evaluateDay,
  mergeChoices,
  photoKey,
  tasteMemory,
  tasteVote,
  type ChoiceRecord,
  type Features,
  type MediaItem,
} from '../../src/engine';

const features = (over: Partial<Features> = {}): Features => ({
  ...(Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0.5])) as Features),
  ...over,
});

const record = (key: string, choice: 'garder' | 'supprimer', extra: Partial<ChoiceRecord> = {}): ChoiceRecord => ({
  key,
  packKey: 'p1',
  choice,
  features: features(),
  baseScore: 0.8,
  at: 1000,
  ...extra,
});

describe('empreinte compacte', () => {
  it('garde la ressemblance entre deux images après compression sur 8 bits', () => {
    const a = Array.from({ length: 64 }, (_, i) => Math.sin(i) * 0.1);
    const b = a.map((v, i) => v + (i % 7 === 0 ? 0.02 : 0));
    const exact = cosine(a, b)!;
    const packed = cosine(decodeEmbedding(encodeEmbedding(a)), decodeEmbedding(encodeEmbedding(b)))!;
    expect(Math.abs(exact - packed)).toBeLessThan(0.01);
    expect(decodeEmbedding(encodeEmbedding(a))!.length).toBe(64);
  });

  it('refuse une empreinte vide ou un texte invalide', () => {
    expect(encodeEmbedding(null)).toBeNull();
    expect(encodeEmbedding([0, 0])).toBeNull();
    expect(decodeEmbedding('@@@')).toBeNull();
    expect(cosine([1, 0], [1, 0, 0])).toBeNull();
  });
});

describe('fichier de sauvegarde des goûts', () => {
  it('aller-retour sans perte utile (mesures au millième, commentaire, empreinte)', () => {
    const r = record('IMG_1|1', 'garder', { comment: 'beau sourire', v: 2, embedding: encodeEmbedding([0.1, -0.2, 0.3])!, features: features({ sourire: 0.8123 }) });
    const file = JSON.parse(JSON.stringify(encodeBackup([r], 5)));
    const back = decodeBackup(file);
    expect(back.skipped).toBe(0);
    expect(back.records[0]).toMatchObject({ key: 'IMG_1|1', choice: 'garder', comment: 'beau sourire', v: 2, embedding: r.embedding });
    expect(back.records[0]!.features.sourire).toBeCloseTo(0.812, 3);
  });

  it('refuse un autre fichier ou une version plus récente, ignore les lignes abîmées', () => {
    expect(() => decodeBackup({ hello: 1 })).toThrow(/pas une sauvegarde/);
    expect(() => decodeBackup({ ...encodeBackup([], 0), version: BACKUP_VERSION + 1 })).toThrow(/plus récente/);
    const file = encodeBackup([record('a', 'garder')], 0) as unknown as { choices: unknown[] };
    file.choices.push(['cassé'], null);
    const back = decodeBackup(file);
    expect(back.records).toHaveLength(1);
    expect(back.skipped).toBe(2);
  });

  it('une mesure ajoutée plus tard ne décale pas les colonnes des anciennes sauvegardes', () => {
    const file = encodeBackup([record('a', 'garder', { features: features({ regard: 0.9 }) })], 0);
    // Ancienne sauvegarde : colonnes dans un autre ordre, une mesure inconnue en plus.
    const idx = file.features.indexOf('regard');
    file.features = ['inconnue', ...file.features];
    file.choices[0]![5] = [0.3 as unknown as number, ...file.choices[0]![5]];
    const back = decodeBackup(file);
    expect(back.records[0]!.features.regard).toBeCloseTo(0.9, 3);
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it('restauration : fusion, rien n’est effacé, le choix le plus récent l’emporte', () => {
    const current = [record('a', 'garder', { at: 10 }), record('b', 'supprimer', { at: 10 })];
    const incoming = [record('a', 'supprimer', { at: 5 }), record('b', 'garder', { at: 20 }), record('c', 'garder', { at: 1 })];
    const { merged, added, updated } = mergeChoices(current, incoming);
    expect(merged).toHaveLength(3);
    expect(merged.find((r) => r.key === 'a')!.choice).toBe('garder');
    expect(merged.find((r) => r.key === 'b')!.choice).toBe('garder');
    expect([added, updated]).toEqual([1, 1]);
  });
});

describe('goûts par l’image (test)', () => {
  const emb = (x: number) => encodeEmbedding([x, 1 - x, 0.5])!;
  it('vote des voisins : ressemble à ce que l’utilisateur garde → positif', () => {
    const memory = tasteMemory([
      record('k1', 'garder', { packKey: 'q1', embedding: emb(0.9) }),
      record('k2', 'garder', { packKey: 'q2', embedding: emb(0.85) }),
      record('s1', 'supprimer', { packKey: 'q3', embedding: emb(0.1) }),
    ]);
    expect(tasteVote([0.88, 0.12, 0.5], memory, new Set())).toBeGreaterThan(0);
    expect(tasteVote([0.1, 0.9, 0.5], memory, new Set())).toBeLessThan(0);
  });

  it('les choix du paquet évalué ne votent pas (pas de triche)', () => {
    const memory = tasteMemory([record('k1', 'garder', { packKey: 'q1', embedding: emb(0.9) })]);
    expect(tasteVote([0.9, 0.1, 0.5], memory, new Set(['q1']))).toBe(0);
  });
});

describe('accord honnête', () => {
  const item = (id: string, at: number, sharpness: number): MediaItem =>
    ({
      id,
      kind: 'photo',
      fileName: `${id}.jpg`,
      isRaw: false,
      capturedAt: at,
      sharpness,
      focal35: 24,
      faces: [],
      objects: [],
      tiltDeg: null,
      tiltStrength: null,
      exposure: null,
      color: null,
      signature: null,
      segmentation: null,
      embedding: [1, 0, 0],
      labels: null,
      obstruction: null,
      camera: true,
      hands: null,
    }) as unknown as MediaItem;

  it('compte les choix de la séance, et l’accord honnête n’utilise pas ces choix pour apprendre', () => {
    const items = [item('a', 1000, 500), item('b', 2000, 100)];
    const day = analyzeDay(items, 60);
    const pack = day.packs[0]!;
    const records = [
      record(photoKey(items[0]!), 'supprimer', { packKey: pack.key }),
      record(photoKey(items[1]!), 'garder', { packKey: pack.key }),
    ];
    const a = evaluateDay(day, records);
    expect(a.total).toBe(2);
    // Sans autre choix que ceux du paquet, rien n'est appris : l'app garde la plus nette, l'utilisateur l'autre.
    expect(a.honest).toBe(0);
    expect(a.withTaste).toBeNull();
  });
});
