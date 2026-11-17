import { describe, expect, it } from 'vitest';
import { scorePack, type FaceMetrics, type MediaItem } from '../../src/engine';

const face = (extra: Partial<FaceMetrics> = {}): FaceMetrics => ({
  box: { x: 0.3, y: 0.3, width: 0.2, height: 0.25 },
  areaRatio: 0.05,
  eyesOpen: 0.95,
  gaze: 0.9,
  expression: 0.6,
  smile: 0.2,
  sharpness: 400,
  cut: false,
  yawDeg: 0,
  pitchDeg: 0,
  offAxisHDeg: 0,
  offAxisVDeg: 0,
  eyeH: 0,
  eyeV: 0,
  ...extra,
});

const photo = (id: string, faces: FaceMetrics[] | null, sharpness = 300): MediaItem =>
  ({ id, kind: 'photo', isRaw: false, sharpness, faces }) as MediaItem;

const codes = (score: { reasons: { code: string }[] } | undefined) => score?.reasons.map((r) => r.code) ?? [];

describe('note des photos d’un paquet', () => {
  it('ne choisit pas la plus nette si un visage y est caché', () => {
    // Le cas réel : 2 personnes, et sur la photo la plus nette une casquette cache un visage.
    const scores = scorePack([
      photo('casquette', [face()], 900),
      photo('bonne', [face(), face()], 300),
      photo('autre', [face({ gaze: 0.6 }), face()], 300),
    ]);
    expect(scores.get('bonne')!.rank).toBe(1);
    expect(scores.get('casquette')!.rank).toBe(3);
    expect(codes(scores.get('casquette'))).toContain('visage-cache');
    expect(scores.get('casquette')!.reasons.find((r) => r.code === 'visage-cache')).toMatchObject({ count: 1, expected: 2 });
  });

  it('écarte une photo aux yeux fermés', () => {
    const scores = scorePack([photo('ok', [face()]), photo('clin', [face({ eyesOpen: 0.1 })], 900)]);
    expect(scores.get('clin')!.vetoed).toBe(true);
    expect(scores.get('clin')!.rank).toBe(2);
    expect(codes(scores.get('clin'))).toContain('yeux-fermes');
  });

  it('écarte une photo où un visage est coupé', () => {
    const scores = scorePack([photo('ok', [face()]), photo('coupe', [face({ cut: true })])]);
    expect(scores.get('coupe')!.vetoed).toBe(true);
    expect(codes(scores.get('coupe'))).toContain('visage-coupe');
  });

  it('lève le veto quand tout le paquet est concerné : la moins mauvaise gagne', () => {
    const scores = scorePack([photo('a', [face({ eyesOpen: 0.05 })]), photo('b', [face({ eyesOpen: 0.2 })])]);
    expect([...scores.values()].some((s) => s.vetoed)).toBe(false);
    expect(scores.get('b')!.rank).toBe(1);
  });

  it('le visage le plus raté pèse plus que la moyenne', () => {
    const scores = scorePack([
      photo('un-rate', [face({ gaze: 1 }), face({ gaze: 0.1 })]),
      photo('deux-moyens', [face({ gaze: 0.6 }), face({ gaze: 0.6 })]),
    ]);
    expect(scores.get('deux-moyens')!.rank).toBe(1);
    expect(codes(scores.get('un-rate'))).toContain('regard-ailleurs');
  });

  it('ignore un passant au loin', () => {
    const scores = scorePack([
      photo('a', [face(), face({ areaRatio: 0.003, eyesOpen: 0, gaze: 0 })]),
      photo('b', [face({ gaze: 0.5 })]),
    ]);
    expect(scores.get('a')!.faceCount).toBe(1);
    expect(scores.get('a')!.vetoed).toBe(false);
    expect(scores.get('a')!.rank).toBe(1);
  });

  it('compare la netteté des visages à l’intérieur du paquet', () => {
    const scores = scorePack([photo('net', [face({ sharpness: 800 })]), photo('boug', [face({ sharpness: 60 })])]);
    expect(scores.get('net')!.rank).toBe(1);
    expect(codes(scores.get('boug'))).toContain('visage-flou');
    expect(codes(scores.get('net'))).toContain('visage-net');
  });

  it('compare la netteté de chaque personne à elle-même, pas à sa voisine', () => {
    // À gauche un visage toujours mesuré vers 320, à droite un visage vers 550 : aucun des deux n'est flou.
    const left = (sharpness: number) => face({ box: { x: 0.1, y: 0.3, width: 0.2, height: 0.25 }, sharpness });
    const right = (sharpness: number) => face({ box: { x: 0.6, y: 0.3, width: 0.2, height: 0.25 }, sharpness });
    const scores = scorePack([
      photo('a', [right(1187), left(244)]),
      photo('b', [left(327), right(376)]),
      photo('c', [left(341), right(611)]),
      photo('d', [left(319), right(546)]),
    ]);
    for (const id of ['a', 'b', 'c', 'd']) expect(codes(scores.get(id))).not.toContain('visage-flou');
  });

  it('pénalise une photo sans visage dans un paquet de portraits', () => {
    const scores = scorePack([photo('a', [face()]), photo('b', [face()]), photo('vide', [], 900)]);
    expect(scores.get('vide')!.rank).toBe(3);
    expect(codes(scores.get('vide'))).toContain('aucun-visage');
  });

  it('classe un paysage par netteté seulement', () => {
    const scores = scorePack([photo('a', [], 100), photo('b', [], 400), photo('c', [], 380)]);
    expect(scores.get('b')!.rank).toBe(1);
    expect(scores.get('b')!.faceScore).toBeNull();
    expect(codes(scores.get('b'))).toContain('plus-nette');
    expect(scores.get('a')!.reasons[0]).toMatchObject({ code: 'moins-nette', refId: 'b' });
    expect(codes(scores.get('c'))).toEqual([]);
  });

  it('retombe sur la netteté quand la recherche de visages n’a pas tourné', () => {
    const scores = scorePack([photo('a', null, 100), photo('b', null, 400)]);
    expect(scores.get('b')!.rank).toBe(1);
    expect(scores.get('b')!.expectedFaces).toBe(0);
  });

  it('garde toutes les notes entre 0 et 1, et supporte un paquet d’une photo', () => {
    const scores = scorePack([photo('seule', [face({ smile: 0.9 })])]);
    const s = scores.get('seule')!;
    expect(s.rank).toBe(1);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(1);
    expect(scorePack([]).size).toBe(0);
  });
});
