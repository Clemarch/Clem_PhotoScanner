import { describe, expect, it } from 'vitest';
import { scorePack, type DetectedObject, type FaceMetrics, type MediaItem, type Rgb } from '../../src/engine';

const SKIN: Rgb = [200, 150, 120];

const face = (extra: Partial<FaceMetrics> = {}): FaceMetrics => ({
  box: { x: 0.3, y: 0.3, width: 0.2, height: 0.25 },
  areaRatio: 0.05,
  eyesOpen: 1,
  gaze: 1,
  expression: 0.8,
  smile: 0.6,
  sharpness: 400,
  cut: false,
  yawDeg: 0,
  pitchDeg: 0,
  offAxisHDeg: 0,
  offAxisVDeg: 0,
  eyeH: 0,
  eyeV: 0,
  talking: 0,
  pout: 0,
  upperColor: SKIN,
  lowerColor: SKIN,
  bodyColor: [235, 235, 235],
  ...extra,
});

/** Deux personnes côte à côte, comme sur un selfie. */
const left = (extra: Partial<FaceMetrics> = {}) => face({ box: { x: 0.15, y: 0.3, width: 0.2, height: 0.25 }, ...extra });
const right = (extra: Partial<FaceMetrics> = {}) => face({ box: { x: 0.6, y: 0.3, width: 0.2, height: 0.25 }, ...extra });

const photo = (id: string, faces: FaceMetrics[] | null, sharpness = 300, extra: Partial<MediaItem> = {}): MediaItem =>
  ({ id, kind: 'photo', isRaw: false, sharpness, faces, objects: null, tiltDeg: null, tiltStrength: null, exposure: null, color: null, signature: null, bodies: null, obstruction: null, ...extra }) as MediaItem;

const obj = (label: string, x: number, y: number, width: number, height: number): DetectedObject => ({
  label,
  score: 0.8,
  box: { x, y, width, height },
});

const codes = (score: { reasons: { code: string }[] } | undefined) => score?.reasons.map((r) => r.code) ?? [];

describe('le contenu d’abord, la technique ensuite', () => {
  it('une photo plus nette ne gagne pas sur un meilleur contenu', () => {
    const scores = scorePack([
      photo('nette-mais-parle', [face({ talking: 0.6, expression: 0.3, smile: 0 })], 900),
      photo('souriante', [face()], 480),
      photo('autre', [face({ expression: 0.6, smile: 0.2 })], 500),
    ]);
    expect(scores.get('souriante')!.rank).toBe(1);
    expect(scores.get('nette-mais-parle')!.rank).toBe(3);
    expect(codes(scores.get('nette-mais-parle'))).toContain('parle');
    expect(codes(scores.get('souriante'))).toContain('sourire');
  });

  it('à contenu égal, une netteté suffisante vaut la note maximale', () => {
    const scores = scorePack([photo('a', [face()], 900), photo('b', [face({ sharpness: 330 })], 460), photo('c', [face()], 500)]);
    expect(scores.get('b')!.score).toBeCloseTo(scores.get('a')!.score, 5);
    // À note égale, la plus nette passe devant.
    expect(scores.get('a')!.rank).toBe(1);
  });

  it('un visage nettement flou reste pénalisé', () => {
    const scores = scorePack([photo('net', [face({ sharpness: 800 })]), photo('boug', [face({ sharpness: 60 })])]);
    expect(scores.get('net')!.rank).toBe(1);
    expect(codes(scores.get('boug'))).toContain('visage-flou');
  });

  it('regarder au loin n’est presque pas pénalisé', () => {
    const scores = scorePack([
      photo('regard-loin-souriant', [face({ gaze: 0 })]),
      photo('objectif-neutre', [face({ expression: 0.55, smile: 0 })]),
    ]);
    expect(scores.get('regard-loin-souriant')!.rank).toBe(1);
    expect(codes(scores.get('regard-loin-souriant'))).not.toContain('regard-ailleurs');
  });
});

describe('éléments qui gâchent la photo', () => {
  it('repère un visage masqué par un objet (cas réel de la casquette tenue devant le visage)', () => {
    const cap: Rgb = [215, 90, 120];
    const scores = scorePack([
      photo('1', [left(), right()]),
      photo('casquette', [left(), right({ lowerColor: cap })], 900),
      photo('3', [left(), right()]),
      photo('4', [left(), right()]),
    ]);
    expect(codes(scores.get('casquette'))).toContain('visage-masque');
    expect(scores.get('casquette')!.rank).toBe(4);
    expect(scores.get('casquette')!.occlusion).toBeGreaterThan(0.5);
    expect(codes(scores.get('1'))).not.toContain('visage-masque');
  });

  it('ne juge pas le masquage avec trop peu de photos de comparaison', () => {
    const scores = scorePack([photo('a', [face()]), photo('b', [face({ lowerColor: [215, 90, 120] })])]);
    expect(scores.get('b')!.occlusion).toBe(0);
  });

  it('pénalise une bouteille tenue devant les personnes, pas une bouteille au loin', () => {
    const faces = () => [left(), right()];
    const scores = scorePack([
      photo('propre', faces(), 300, { objects: [] }),
      photo('bouteille', faces(), 300, { objects: [obj('bottle', 0.55, 0.6, 0.06, 0.15)] }),
      photo('loin', faces(), 300, { objects: [obj('bottle', 0.92, 0.05, 0.02, 0.03)] }),
    ]);
    expect(codes(scores.get('bouteille'))).toContain('objet');
    expect(scores.get('bouteille')!.reasons.find((r) => r.code === 'objet')!.labels).toEqual(['bottle']);
    expect(codes(scores.get('loin'))).not.toContain('objet');
    expect(scores.get('bouteille')!.rank).toBe(3);
  });

  it('ignore un objet présent sur toutes les photos du paquet', () => {
    const bag = obj('handbag', 0.55, 0.6, 0.1, 0.2);
    const scores = scorePack([photo('a', [face()], 300, { objects: [bag] }), photo('b', [face()], 300, { objects: [bag] })]);
    expect(codes(scores.get('a'))).not.toContain('objet');
  });

  it('pénalise une personne qui passe en arrière-plan au centre', () => {
    const subjects = () => [left(), right()];
    const people = [obj('person', 0.05, 0.2, 0.35, 0.8), obj('person', 0.5, 0.2, 0.35, 0.8)];
    const scores = scorePack([
      photo('degagee', subjects(), 300, { objects: [...people] }),
      photo('passant', subjects(), 300, { objects: [...people, obj('person', 0.4, 0.3, 0.15, 0.5)] }),
      photo('passant-loin', subjects(), 300, { objects: [...people, obj('person', 0.95, 0.4, 0.02, 0.05)] }),
    ]);
    expect(codes(scores.get('passant'))).toContain('arriere-plan');
    expect(scores.get('passant')!.rank).toBe(3);
    expect(codes(scores.get('passant-loin'))).not.toContain('arriere-plan');
    // Les deux personnes photographiées ne comptent pas comme arrière-plan.
    expect(scores.get('degagee')!.background).toBe(0);
  });

  it('ne prend pas pour un passant une personne à la place d’un sujet dont le visage n’a pas été trouvé', () => {
    // Cas réel (photo 7) : la personne de gauche a détourné la tête, son visage n'est pas détecté,
    // mais le détecteur d'objets la voit toujours au même endroit.
    const leftPerson = obj('person', 0.05, 0.25, 0.4, 0.75);
    const rightPerson = obj('person', 0.5, 0.25, 0.4, 0.75);
    const scores = scorePack([
      photo('a', [left(), right()], 300, { objects: [leftPerson, rightPerson] }),
      photo('b', [left(), right()], 300, { objects: [leftPerson, rightPerson] }),
      photo('tete-tournee', [right()], 300, { objects: [obj('person', 0.07, 0.27, 0.38, 0.73), rightPerson] }),
    ]);
    expect(codes(scores.get('tete-tournee'))).toContain('visage-non-analyse');
    expect(codes(scores.get('tete-tournee'))).not.toContain('visage-cache');
    expect(codes(scores.get('tete-tournee'))).not.toContain('arriere-plan');
    expect(scores.get('tete-tournee')!.background).toBe(0);
  });

  it('repère un objet tenu devant la personne, sous le visage (cas réel de la casquette tenue devant le buste)', () => {
    const cap: Rgb = [215, 90, 120];
    const scores = scorePack([
      photo('1', [left(), right()]),
      photo('casquette', [left({ bodyColor: cap }), right()]),
      photo('3', [left(), right()]),
      photo('4', [left(), right()]),
    ]);
    expect(codes(scores.get('casquette'))).toContain('devant');
    expect(codes(scores.get('casquette'))).not.toContain('visage-masque');
    expect(scores.get('casquette')!.rank).toBe(4);
  });

  it('distingue un visage plus sombre d’un visage masqué', () => {
    const dim = (c: Rgb): Rgb => [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
    const scores = scorePack([
      photo('1', [face()]),
      photo('sombre', [face({ upperColor: dim(SKIN), lowerColor: dim(SKIN) })]),
      photo('3', [face()]),
    ]);
    expect(codes(scores.get('sombre'))).toContain('visage-sombre');
    expect(codes(scores.get('sombre'))).not.toContain('visage-masque');
    expect(scores.get('sombre')!.faceBrightness).toBeCloseTo(0.5, 1);
    expect(scores.get('sombre')!.rank).toBe(3);
  });

  it('pénalise une photo brûlée ou bouchée par rapport aux autres du paquet', () => {
    const exposure = (highlights: number, shadows: number) => ({ highlights, shadows, mean: 120 });
    const scores = scorePack([
      photo('bonne', [face()], 300, { exposure: exposure(0.01, 0.01) }),
      photo('brulee', [face()], 300, { exposure: exposure(0.2, 0.01) }),
      photo('bouchee', [face()], 300, { exposure: exposure(0.01, 0.1) }),
      photo('a-peine', [face()], 300, { exposure: exposure(0.02, 0.015) }),
    ]);
    expect(codes(scores.get('brulee'))).toContain('surexposee');
    expect(codes(scores.get('bouchee'))).toContain('sous-exposee');
    expect(codes(scores.get('a-peine'))).toEqual(['sourire']);
    expect(scores.get('brulee')!.rank).toBe(4);
  });

  it('des personnes vues de dos, présentes sur toutes les photos, sont les sujets et non l’arrière-plan', () => {
    // Couple de dos face au coucher de soleil : aucun visage, mais deux personnes au même endroit partout.
    const couple = [obj('person', 0.3, 0.4, 0.15, 0.5), obj('person', 0.5, 0.42, 0.14, 0.48)];
    const shift = (dx: number) => couple.map((o) => ({ ...o, box: { ...o.box, x: o.box.x + dx } }));
    const scores = scorePack([
      photo('a', [], 300, { objects: shift(0) }),
      photo('b', [], 300, { objects: shift(0.02) }),
      photo('c', [], 300, { objects: shift(-0.02) }),
      photo('d', [], 300, { objects: [...shift(0.01), obj('person', 0.45, 0.3, 0.12, 0.4)] }),
    ]);
    for (const id of ['a', 'b', 'c']) expect(codes(scores.get(id))).not.toContain('arriere-plan');
    expect(scores.get('a')!.background).toBe(0);
    // Un vrai passant en plus reste repéré.
    expect(scores.get('d')!.background).toBeGreaterThan(0);
  });

  it('pénalise une photo penchée, si la mesure est fiable', () => {
    const scores = scorePack([
      photo('droite', [face()], 300, { tiltDeg: 0.3, tiltStrength: 0.4 }),
      photo('penchee', [face()], 300, { tiltDeg: -4, tiltStrength: 0.4 }),
      photo('incertaine', [face()], 300, { tiltDeg: 8, tiltStrength: 0.02 }),
    ]);
    expect(codes(scores.get('penchee'))).toContain('horizon');
    expect(scores.get('penchee')!.reasons.find((r) => r.code === 'horizon')!.degrees).toBe(4);
    expect(codes(scores.get('incertaine'))).not.toContain('horizon');
    expect(scores.get('penchee')!.rank).toBe(3);
  });
});

describe('règles conservées', () => {
  it('ne choisit pas une photo où un visage manque', () => {
    const scores = scorePack([photo('un-seul', [face()], 900), photo('deux', [left(), right()]), photo('deux-bis', [left(), right()])]);
    expect(scores.get('un-seul')!.rank).toBe(3);
    expect(scores.get('un-seul')!.reasons.find((r) => r.code === 'visage-cache')).toMatchObject({ count: 1, expected: 2 });
  });

  it('écarte une photo aux yeux fermés ou au visage coupé', () => {
    const scores = scorePack([photo('ok', [face()]), photo('clin', [face({ eyesOpen: 0.1 })], 900), photo('coupe', [face({ cut: true })])]);
    expect(scores.get('clin')!.vetoed).toBe(true);
    expect(scores.get('coupe')!.vetoed).toBe(true);
    expect(scores.get('ok')!.rank).toBe(1);
  });

  it('garde le veto même quand tout le paquet est concerné (le paquet peut être entièrement supprimé)', () => {
    const scores = scorePack([photo('a', [face({ eyesOpen: 0.05 })]), photo('b', [face({ eyesOpen: 0.2 })])]);
    expect([...scores.values()].every((s) => s.vetoed && s.failed)).toBe(true);
    expect(scores.get('b')!.rank).toBe(1);
  });

  it('le visage le plus raté pèse plus que la moyenne', () => {
    const scores = scorePack([
      photo('un-rate', [left({ expression: 1 }), right({ expression: 0.1 })]),
      photo('deux-moyens', [left({ expression: 0.6 }), right({ expression: 0.6 })]),
    ]);
    expect(scores.get('deux-moyens')!.rank).toBe(1);
  });

  it('ignore un tout petit visage au loin pour les vetos', () => {
    const scores = scorePack([
      photo('a', [face(), face({ areaRatio: 0.003, eyesOpen: 0, box: { x: 0.9, y: 0.1, width: 0.03, height: 0.04 } })]),
      photo('b', [face({ expression: 0.5 })]),
    ]);
    expect(scores.get('a')!.faceCount).toBe(1);
    expect(scores.get('a')!.vetoed).toBe(false);
  });

  it('sans mesure de couleur, classe un paysage par netteté', () => {
    const scores = scorePack([photo('a', [], 100), photo('b', [], 400), photo('c', [], 380)]);
    expect(scores.get('b')!.rank).toBe(1);
    expect(scores.get('b')!.faceScore).toBeNull();
    expect(scores.get('a')!.reasons[0]).toMatchObject({ code: 'moins-nette', refId: 'b' });
  });

  it('retombe sur la netteté quand les détecteurs n’ont pas tourné', () => {
    const scores = scorePack([photo('a', null, 100), photo('b', null, 400)]);
    expect(scores.get('b')!.rank).toBe(1);
  });

  it('supporte un paquet vide ou d’une photo', () => {
    expect(scorePack([]).size).toBe(0);
    const s = scorePack([photo('seule', [face()])]).get('seule')!;
    expect(s.rank).toBe(1);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(1);
  });
});
