import { describe, expect, it } from 'vitest';
import { prepShortcutUrl, shortcutCount, shortcutText, shortcutUrl } from '../../src/platform/shortcut';

// Albums « Triées » et « À trier » (24/11, point 48).
describe('albums', () => {
  const at = new Date(2026, 10, 24, 10, 0, 0).getTime();
  const del = [{ fileName: 'IMG_0001.HEIC', at }];
  const kept = [
    { fileName: 'IMG_0002.HEIC', at: at + 5000 },
    { fileName: 'IMG_0003.HEIC', at: null },
  ];

  it('les photos gardées finissent par |G, les photos à supprimer gardent leur forme', () => {
    expect(shortcutText(del, kept).split('\n')).toEqual([
      'IMG_0001|2026-11-24 09:59:58|2026-11-24 10:00:02',
      'IMG_0002|2026-11-24 10:00:03|2026-11-24 10:00:07|G',
    ]);
  });

  it('sans photos gardées, rien ne change pour un ancien raccourci', () => {
    expect(shortcutText(del)).toBe('IMG_0001|2026-11-24 09:59:58|2026-11-24 10:00:02');
    expect(shortcutUrl(del)).toBe(shortcutUrl(del, []));
    expect(shortcutCount(del)).toBe(1);
  });

  it('le raccourci « Préparer le tri » s’ouvre par son nom', () => {
    expect(prepShortcutUrl()).toBe('shortcuts://run-shortcut?name=Pr%C3%A9parer%20le%20tri');
  });
});
