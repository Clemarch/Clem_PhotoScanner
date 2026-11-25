import { describe, expect, it } from 'vitest';
import { KEEP_SHORTCUT_NAME, keepThenPrepUrl, prepShortcutUrl, shortcutText, shortcutUrl } from '../../src/platform/shortcut';

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

  it('« Préparer le prochain tri » : ranger, puis préparer dès que le rangement a réussi', () => {
    const url = new URL(keepThenPrepUrl(photos).replace('shortcuts://', 'https://x/'));
    expect(url.pathname).toBe('/x-callback-url/run-shortcut');
    expect(url.searchParams.get('name')).toBe('Photo Triage Garder');
    expect(url.searchParams.get('text')).toBe(shortcutText(photos));
    expect(url.searchParams.get('x-success')).toBe(prepShortcutUrl());
  });
});

describe('nouvel œil : choix complétés après coup (25/11)', () => {
  it('ajoute empreinte et émotions aux choix qui n’en ont pas, sans rien changer d’autre', async () => {
    const { eyePatches } = await import('../../src/ui/choices');
    const { photoKey, config } = await import('../../src/engine');
    const item = { fileName: 'IMG_1.jpeg', capturedAt: 1000, clip: Array.from({ length: config.ranker.eyeDims }, (_, i) => (i % 7) / 7) } as never;
    const old = { ...(item as object), fileName: 'IMG_2.jpeg', clip: [0.1, 0.2] } as never;
    const base = { packKey: 'p', choice: 'garder' as const, features: {}, baseScore: 0.5, at: 1 };
    const records = [
      { ...base, key: photoKey(item) },
      { ...base, key: photoKey(old) },
      { ...base, key: 'autre|1', clip: 'déjà' },
    ];
    const patches = eyePatches(records as never, [item, old]);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.key).toBe(photoKey(item));
    expect(patches[0]!.choice).toBe('garder');
    expect(typeof patches[0]!.clip).toBe('string');
  });
});

