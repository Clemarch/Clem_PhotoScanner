import { describe, expect, it } from 'vitest';
import { analyzeDay, decodeBackup, encodeBackup, groupIntoPacks, mergeChoices, scorePack, type ChoiceRecord, type FaceMetrics, type MediaItem } from '../../src/engine';
import { backupName } from '../../src/platform/storage/backupFile';

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

const sizes = (items: MediaItem[], gap = 60, byContent = true) => groupIntoPacks(items, gap, byContent).packs.map((p) => p.items.map((i) => i.id).join(''));

describe('paquets selon ce que montrent les photos (utilisateur, 19/11)', () => {
  const plage = [1, 0, 0];
  const volcan = [0, 1, 0];
  it('le même paysage revu 1 h plus tard reste dans le même paquet', () => {
    expect(sizes([photo('a', 0, { embedding: plage }), photo('b', 3600, { embedding: [0.95, 0.31, 0] })])).toEqual(['ab']);
  });
  it('une autre scène, même 30 s après, ouvre un nouveau paquet', () => {
    expect(sizes([photo('a', 0, { embedding: plage }), photo('b', 30, { embedding: volcan })])).toEqual(['a', 'b']);
  });
  it('une rafale reste ensemble même si le cadrage change beaucoup (ressemblance 0,5)', () => {
    expect(sizes([photo('a', 0, { embedding: plage }), photo('b', 4, { embedding: [0.5, 0.87, 0] })])).toEqual(['ab']);
  });
  it('rafale entre deux scènes sans rapport (selfie puis portrait, 20/11) : deux paquets', () => {
    expect(sizes([photo('a', 0, { embedding: plage }), photo('b', 4, { embedding: volcan })])).toEqual(['a', 'b']);
  });
  it('compare aux dernières photos du paquet, pas seulement à la précédente', () => {
    const items = [photo('a', 0, { embedding: plage }), photo('b', 5, { embedding: [0.5, 0.87, 0] }), photo('c', 120, { embedding: plage })];
    expect(sizes(items)).toEqual(['abc']);
  });
  it('une personne seule après une photo de groupe : nouveau paquet, même en rafale', () => {
    const person = (x: number) => ({ label: 'person', score: 0.9, box: { x, y: 0.2, width: 0.2, height: 0.7 } });
    const items = [
      photo('groupe', 0, { embedding: plage, objects: [person(0.1), person(0.4), person(0.7)] }),
      photo('seule', 9, { embedding: [0.7, 0.71, 0], objects: [person(0.4)] }),
    ];
    expect(sizes(items)).toEqual(['groupe', 'seule']);
  });
  it('jamais réunies au-delà de 3 h, même ressemblantes', () => {
    expect(sizes([photo('a', 0, { embedding: plage }), photo('b', 4 * 3600, { embedding: plage })])).toEqual(['a', 'b']);
  });
  it('sans empreinte : retour à l’écart de temps', () => {
    expect(sizes([photo('a', 0), photo('b', 50), photo('c', 200)])).toEqual(['ab', 'c']);
  });
  it('réglage « par le temps » : l’empreinte est ignorée', () => {
    expect(sizes([photo('a', 0, { embedding: plage }), photo('b', 30, { embedding: volcan })], 60, false)).toEqual(['ab']);
  });
});

describe('yeux plissés jugés par personne (soleil de face, 19/11)', () => {
  // Deux personnes ; celle de droite plisse les yeux sur toutes les photos.
  const group = (eyesRight: number[], eyesLeft: number[] = eyesRight.map(() => 1)) =>
    scorePack(eyesRight.map((e, i) => photo(`p${i}`, i, { faces: [face(0.3, { eyesOpen: eyesLeft[i]! }), face(0.7, { eyesOpen: e })] })));

  it('quelqu’un qui plisse les yeux partout n’est pas compté comme ayant cligné', () => {
    const scores = group([0.1, 0.4, 0.38, 0.0, 0.45]);
    for (const s of scores.values()) expect(s.vetoed).toBe(false);
    expect(scores.get('p3')!.reasons.some((r) => r.code === 'yeux-plisses')).toBe(true);
  });
  it('un vrai clignement (yeux grands ouverts sur les autres photos) reste un défaut', () => {
    const scores = group([0.9, 0.85, 0.1, 0.95, 0.9]);
    expect(scores.get('p2')!.vetoed).toBe(true);
    expect(scores.get('p2')!.reasons.some((r) => r.code === 'yeux-fermes')).toBe(true);
  });
  it('deux vrais clignements sur quatre photos restent des défauts (audit du 19/11)', () => {
    const scores = group([0.9, 0.1, 0.1, 0.9]);
    expect(scores.get('p1')!.vetoed).toBe(true);
    expect(scores.get('p2')!.vetoed).toBe(true);
  });
  it('avec moins de 3 photos de la personne, pas d’exception', () => {
    const scores = group([0.1, 0.2]);
    expect([...scores.values()].every((s) => s.vetoed)).toBe(true);
  });
});

describe('accords silencieux et sauvegarde (19/11)', () => {
  const record = (key: string, implicit: boolean): ChoiceRecord => ({
    key,
    packKey: 'p',
    choice: 'supprimer',
    features: {} as ChoiceRecord['features'],
    baseScore: 0.5,
    at: 1,
    ...(implicit ? { implicit: true } : {}),
  });
  it('la sauvegarde garde la marque « laissé tel quel »', () => {
    const back = decodeBackup(JSON.parse(JSON.stringify(encodeBackup([record('a', true), record('b', false)], 5)))).records;
    expect(back.find((r) => r.key === 'a')!.implicit).toBe(true);
    expect(back.find((r) => r.key === 'b')!.implicit).toBeUndefined();
  });
  it('restauration : un vrai choix l’emporte toujours sur un accord silencieux, même plus récent', () => {
    const explicitOld = { ...record('a', false), choice: 'garder' as const, at: 1 };
    const implicitNew = { ...record('a', true), at: 99 };
    expect(mergeChoices([implicitNew], [explicitOld]).merged[0]!.choice).toBe('garder');
    expect(mergeChoices([explicitOld], [implicitNew]).merged[0]!.choice).toBe('garder');
  });
  it('une ancienne sauvegarde (9 colonnes) se lit toujours', () => {
    const file = encodeBackup([record('a', false)], 5);
    file.choices = file.choices.map((row) => row.slice(0, 9) as typeof row);
    expect(decodeBackup(file).records).toHaveLength(1);
  });
  it('nom du fichier daté, rangé du plus ancien au plus récent', () => {
    const name = backupName(new Date(2026, 10, 19, 19, 20).getTime(), 182);
    expect(name).toBe('Photo Triage 2026-11-19 19h20 (182 choix)');
    expect(backupName(new Date(2026, 10, 20, 8, 5).getTime(), 190) > name).toBe(true);
  });
});

describe('même paysage revu 1 h plus tard (photos 17 et 18 du 19/11)', () => {
  it('un seul paquet, une seule pose : la meilleure gardée, l’autre à départager', () => {
    const day = analyzeDay([photo('large', 0, { embedding: [1, 0, 0] }), photo('zoom', 4200, { embedding: [0.8, 0.6, 0] })], 60, {}, new Set(), true);
    expect(day.packs).toHaveLength(1);
    expect(day.packs[0]!.poses).toHaveLength(1);
    const codes = [...day.packs[0]!.decisions.values()].map((d) => d.code).sort();
    expect(codes).toEqual(['a-verifier', 'meilleure']);
  });
});
