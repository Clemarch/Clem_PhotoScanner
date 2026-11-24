import { describe, expect, it } from 'vitest';
import { KEEP_SHORTCUT_NAME, prepShortcutUrl, shortcutText, shortcutUrl } from '../../src/platform/shortcut';

// Albums « Triées » et « À trier » (24/11, point 48).
describe('albums', () => {
  const at = new Date(2026, 10, 24, 10, 0, 0).getTime();
  const photos = [
    { fileName: 'IMG_0002.HEIC', at },
    { fileName: 'IMG_0003.HEIC', at: null },
  ];

  it('les photos gardées partent vers la copie du raccourci, au même format', () => {
    const url = shortcutUrl(photos, KEEP_SHORTCUT_NAME);
    expect(url.startsWith('shortcuts://run-shortcut?name=Photo%20Triage%20Garder&input=text&text=')).toBe(true);
    expect(decodeURIComponent(url.split('&text=')[1]!)).toBe(shortcutText(photos));
    expect(shortcutText(photos)).toBe('IMG_0002|2026-11-24 09:59:58|2026-11-24 10:00:02');
  });

  it('le raccourci de suppression ne change pas', () => {
    expect(shortcutUrl(photos)).toBe(shortcutUrl(photos, 'Photo Triage'));
  });

  it('le raccourci « Préparer le tri » s’ouvre par son nom', () => {
    expect(prepShortcutUrl()).toBe('shortcuts://run-shortcut?name=Pr%C3%A9parer%20le%20tri');
  });
});
