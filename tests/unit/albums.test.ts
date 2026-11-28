import { describe, expect, it } from 'vitest';
import { asPhoto, findable, shortcutText, shortcutUrl } from '../../src/platform/shortcut';

// Raccourci de suppression : une ligne par photo, nom et fenêtre de ±2 s (points 31, 33).
describe('raccourci de suppression', () => {
  const at = new Date(2026, 10, 24, 10, 0, 0).getTime();
  const photos = [
    { fileName: 'IMG_0002.HEIC', at },
    { fileName: 'IMG_0003.HEIC', at: null },
  ];

  it('une ligne par photo datée ; une photo sans heure n’est pas envoyée', () => {
    expect(shortcutText(photos)).toBe('IMG_0002|2026-11-24 09:59:58|2026-11-24 10:00:02');
    const url = shortcutUrl(photos);
    expect(url.startsWith('shortcuts://run-shortcut?name=Photo%20Triage&input=text&text=')).toBe(true);
    expect(decodeURIComponent(url.split('&text=')[1]!)).toBe(shortcutText(photos));
  });

  it('l’instant exact de la photo prime sur la seconde de prise de vue', () => {
    const item = { fileName: 'IMG_0004.jpeg', capturedAt: at, instant: at + 500 } as never;
    expect(asPhoto(item)).toEqual({ fileName: 'IMG_0004.jpeg', at: at + 500 });
    expect(findable(item)).toBe(true);
    expect(findable({ fileName: 'x.jpeg', capturedAt: null } as never)).toBe(false);
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

