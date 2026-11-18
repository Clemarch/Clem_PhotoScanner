import { describe, expect, it } from 'vitest';
import { analyzeDay, asideKind, groupPoses, scorePack, type FaceMetrics, type MediaItem } from '../../src/engine';

const face = (x: number): FaceMetrics =>
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
  }) as FaceMetrics;

const photo = (id: string, at: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({
    id,
    kind: 'photo',
    fileName: `${id}.jpg`,
    isRaw: false,
    capturedAt: at,
    sharpness: 300,
    focal35: 24,
    faces: [],
    objects: [],
    tiltDeg: null,
    tiltStrength: null,
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
  }) as MediaItem;

describe('fichiers mis de côté (réglage 4)', () => {
  it('une capture d’écran (sans appareil photo) est mise de côté, jamais proposée à la suppression', () => {
    const day = analyzeDay([photo('a', 1000), photo('capture', 2000, { camera: false }), photo('b', 3000)], 60);
    expect(day.setAside.map((i) => i.id)).toEqual(['capture']);
    expect(day.packs[0]!.pack.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(asideKind(day.setAside[0]!)).toBe('capture');
  });

  it('une photo d’écran ou de document sans visage est mise de côté', () => {
    const screen = photo('ecran', 1000, { labels: [{ index: 664, name: 'monitor', score: 0.6 }] });
    const doc = photo('menu', 1000, { labels: [{ index: 922, name: 'menu', score: 0.45 }] });
    expect(asideKind(screen)).toBe('document');
    expect(asideKind(doc)).toBe('document');
    // Peu sûr, ou une personne devant la télévision : reste une photo à trier.
    expect(asideKind(photo('doute', 1000, { labels: [{ index: 664, name: 'monitor', score: 0.2 }] }))).toBeNull();
    expect(asideKind(photo('tv', 1000, { labels: [{ index: 851, name: 'television', score: 0.6 }], faces: [face(0.5)] }))).toBeNull();
    // Métadonnées inconnues : on ne présume rien.
    expect(asideKind(photo('inconnu', 1000, { camera: null }))).toBeNull();
  });
});

describe('gestes (réglage 4)', () => {
  it('un V de la victoire fait préférer la photo, à expressions égales', () => {
    const v = { gesture: 'Victory', score: 0.85, box: { x: 0.6, y: 0.5, width: 0.1, height: 0.15 } };
    const scores = scorePack([
      photo('sans', 1000, { faces: [face(0.3), face(0.7)] }),
      photo('avec-v', 2000, { faces: [face(0.3), face(0.7)], hands: [v] }),
    ]);
    const sans = scores.get('sans')!;
    const avec = scores.get('avec-v')!;
    expect(avec.score).toBeGreaterThan(sans!.score);
    expect(avec.reasons.some((r) => r.code === 'geste')).toBe(true);
  });

  it('une main sans geste particulier ou peu sûre ne change rien', () => {
    const scores = scorePack([
      photo('a', 1000, { faces: [face(0.5)], hands: [{ gesture: 'None', score: 0.9, box: { x: 0, y: 0, width: 0.1, height: 0.1 } }] }),
      photo('b', 2000, { faces: [face(0.5)], hands: [{ gesture: 'Victory', score: 0.4, box: { x: 0, y: 0, width: 0.1, height: 0.1 } }] }),
    ]);
    expect(scores.get('a')!.score).toBeCloseTo(scores.get('b')!.score, 6);
  });
});

describe('poses (réglage 6)', () => {
  it('baignade du 18/11 (n° 12 à 16) : 5 photos en 5 s, visages trouvés ou non, une seule pose', () => {
    const t = (a: number) => [Math.cos(a), Math.sin(a)];
    const faces = [[face(0.2), face(0.6)], [], [face(0.4)], [face(0.4)], [face(0.3)]];
    const items = [0, 0.68, 0, 0.68, 0].map((a, i) => photo(String(12 + i), 1000 * (i + 1), { embedding: t(a), faces: faces[i]! }));
    expect(groupPoses(items)).toHaveLength(1);
  });

  it('une scène vraiment différente, même en rafale, change de pose', () => {
    const items = [photo('a', 1000, { embedding: [1, 0] }), photo('b', 2000, { embedding: [0.4, 0.92] })];
    expect(groupPoses(items)).toHaveLength(2);
  });
});

describe('pont Raccourcis (réglage 6)', () => {
  it('envoie les noms puis « <nom|date à la seconde> » au raccourci « Photo Triage » (les noms seuls ne sont pas uniques)', async () => {
    const { shortcutUrl, shortcutDate } = await import('../../src/platform/shortcut');
    const at = new Date(2026, 10, 18, 22, 45, 12, 640).getTime();
    const url = shortcutUrl([
      { fileName: 'IMG_0696.jpeg', at },
      { fileName: 'IMG_0697.HEIC', at: at + 1000 },
      { fileName: 'IMG_0698.jpeg', at: null },
    ]);
    expect(url.startsWith('shortcuts://run-shortcut?name=Photo%20Triage&input=text&text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]!);
    // Les noms, un par ligne (recherche rapide dans Photos), puis les clés exactes nom + heure sur la dernière ligne.
    expect(text).toBe('IMG_0696\nIMG_0697\n<IMG_0696|2026-11-18 22:45:12><IMG_0697|2026-11-18 22:45:13>');
    expect(shortcutDate(at)).toBe('2026-11-18 22:45:12');
    // Deux photos du même nom (compteur repassé à zéro) : le nom n'est cherché qu'une fois, les deux clés sont là.
    const twice = decodeURIComponent(
      shortcutUrl([
        { fileName: 'IMG_0001.jpeg', at },
        { fileName: 'IMG_0001.jpeg', at: at + 86_400_000 },
      ]).split('text=')[1]!,
    );
    expect(twice).toBe('IMG_0001\n<IMG_0001|2026-11-18 22:45:12><IMG_0001|2026-11-19 22:45:12>');
    // Une autre photo nommée IMG_0696, prise un autre jour, ne correspond pas.
    expect(text.includes('<IMG_0696|2025-03-02 10:00:00>')).toBe(false);
  });
});
