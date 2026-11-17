import { describe, expect, it } from 'vitest';
import { groupIntoPacks, type MediaItem } from '../../src/engine';

const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);

function photo(id: string, secondsAfterStart: number | null, extra: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    kind: 'photo',
    fileName: `IMG_${id}.HEIC`,
    format: 'HEIC',
    isRaw: false,
    sizeBytes: 2_000_000,
    capturedAt: secondsAfterStart === null ? null : T0 + secondsAfterStart * 1000,
    dateSource: secondsAfterStart === null ? 'absente' : 'exif',
    width: 4032,
    height: 3024,
    orientation: 1,
    focal35: 24,
    sharpness: null,
    faces: null,
    objects: null,
    tiltDeg: null,
    tiltStrength: null,
    exposure: null,
    color: null,
    signature: null,
    ...extra,
  };
}

const ids = (items: MediaItem[]) => items.map((item) => item.id);

describe('découpage en paquets', () => {
  it('renvoie une journée vide sans photo', () => {
    const day = groupIntoPacks([], 300);
    expect(day.packs).toEqual([]);
    expect(day.undated).toEqual([]);
  });

  it('garde ensemble les photos rapprochées et coupe sur un grand écart', () => {
    const day = groupIntoPacks([photo('1', 0), photo('2', 20), photo('3', 50), photo('4', 1000), photo('5', 1010)], 300);
    expect(day.packs.map((p) => ids(p.items))).toEqual([['1', '2', '3'], ['4', '5']]);
    expect(day.packs[0]!.startAt).toBe(T0);
    expect(day.packs[0]!.endAt).toBe(T0 + 50_000);
  });

  it('ne coupe pas quand l’écart est exactement égal au seuil', () => {
    expect(groupIntoPacks([photo('1', 0), photo('2', 300)], 300).packs).toHaveLength(1);
    expect(groupIntoPacks([photo('1', 0), photo('2', 301)], 300).packs).toHaveLength(2);
  });

  it('mesure l’écart avec la photo précédente, pas avec le début du paquet', () => {
    // 20 photos espacées de 4 minutes : un seul long shooting.
    const items = Array.from({ length: 20 }, (_, i) => photo(String(i + 1), i * 240));
    expect(groupIntoPacks(items, 300).packs).toHaveLength(1);
  });

  it('remet les photos dans l’ordre chronologique', () => {
    const day = groupIntoPacks([photo('3', 30), photo('1', 0), photo('2', 10)], 300);
    expect(ids(day.packs[0]!.items)).toEqual(['1', '2', '3']);
  });

  it('départage les photos de même date par le nom, avec les nombres dans l’ordre naturel', () => {
    const day = groupIntoPacks(
      [photo('a', 0, { fileName: 'IMG_10.HEIC' }), photo('b', 0, { fileName: 'IMG_2.HEIC' })],
      300,
    );
    expect(ids(day.packs[0]!.items)).toEqual(['b', 'a']);
  });

  it('un seuil plus petit produit plus de paquets', () => {
    const items = [photo('1', 0), photo('2', 40), photo('3', 80), photo('4', 400)];
    expect(groupIntoPacks(items, 30).packs).toHaveLength(4);
    expect(groupIntoPacks(items, 60).packs).toHaveLength(2);
    expect(groupIntoPacks(items, 600).packs).toHaveLength(1);
  });

  it('sépare les photos sans date au lieu de les mélanger', () => {
    const day = groupIntoPacks([photo('1', 0), photo('x', null), photo('2', 10)], 300);
    expect(ids(day.packs[0]!.items)).toEqual(['1', '2']);
    expect(ids(day.undated)).toEqual(['x']);
  });

  it('met de côté les RAW et les vidéos', () => {
    const day = groupIntoPacks(
      [
        photo('1', 0),
        photo('raw', 5, { format: 'DNG', isRaw: true, fileName: 'IMG_9.DNG' }),
        photo('vid', 6, { kind: 'video', format: 'VIDEO', fileName: 'IMG_8.MOV' }),
      ],
      300,
    );
    expect(ids(day.packs[0]!.items)).toEqual(['1']);
    expect(ids(day.setAside).sort()).toEqual(['raw', 'vid']);
  });

  it('numérote les photos dans l’ordre de la journée, sans compter les fichiers mis de côté', () => {
    const day = groupIntoPacks(
      [photo('b', 500), photo('raw', 1, { isRaw: true, format: 'DNG' }), photo('a', 0), photo('x', null)],
      300,
    );
    expect(day.dayIndex.get('a')).toBe(1);
    expect(day.dayIndex.get('b')).toBe(2);
    expect(day.dayIndex.get('x')).toBe(3);
    expect(day.dayIndex.has('raw')).toBe(false);
  });
});
