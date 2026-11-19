// Différences détaillées entre deux photos presque identiques, en clair : ce que l'app a mesuré sur chacune.

import { FEATURE_NAMES, mainFaces, type FaceMetrics, type FeatureName, type MediaItem, type PhotoScore } from '../engine';

export interface Difference {
  text: string;
  /** Photo avantagée par cette différence : 'a', 'b', ou null si neutre. */
  favours: 'a' | 'b' | null;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const pct1 = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`;
const rel = (a: number, b: number) => Math.round(((a - b) / Math.max(1e-9, Math.min(a, b))) * 100);

const OBJECT_NAMES: Record<string, string> = {
  person: 'personne',
  bicycle: 'vélo',
  car: 'voiture',
  motorcycle: 'moto',
  boat: 'bateau',
  dog: 'chien',
  cat: 'chat',
  bottle: 'bouteille',
  cup: 'tasse',
  chair: 'chaise',
  umbrella: 'parasol',
  backpack: 'sac à dos',
  handbag: 'sac',
  'cell phone': 'téléphone',
  tie: 'cravate',
  surfboard: 'planche de surf',
  kite: 'cerf-volant',
  frisbee: 'frisbee',
  'sports ball': 'ballon',
  skis: 'skis',
  bench: 'banc',
};

const sideOf = (f: FaceMetrics, count: number): string => {
  if (count === 1) return 'le visage';
  const x = f.box.x + f.box.width / 2;
  return x < 0.4 ? 'le visage de gauche' : x > 0.6 ? 'le visage de droite' : 'le visage du milieu';
};

/** Associe chaque visage de A au visage de B le plus proche (même personne, à peu près au même endroit). */
function pairFaces(a: FaceMetrics[], b: FaceMetrics[]): [FaceMetrics, FaceMetrics][] {
  const pairs: [FaceMetrics, FaceMetrics][] = [];
  const used = new Set<FaceMetrics>();
  for (const fa of a) {
    const ca = { x: fa.box.x + fa.box.width / 2, y: fa.box.y + fa.box.height / 2 };
    let best: FaceMetrics | null = null;
    let bestD = 0.2;
    for (const fb of b) {
      if (used.has(fb)) continue;
      const d = Math.hypot(fb.box.x + fb.box.width / 2 - ca.x, fb.box.y + fb.box.height / 2 - ca.y);
      if (d < bestD) {
        bestD = d;
        best = fb;
      }
    }
    if (best) {
      used.add(best);
      pairs.push([fa, best]);
    }
  }
  return pairs;
}

export function describeDifferences(
  a: MediaItem,
  b: MediaItem,
  sa: PhotoScore | undefined,
  sb: PhotoScore | undefined,
  na: string,
  nb: string,
): Difference[] {
  const out: Difference[] = [];
  const better = (va: number, vb: number, higherIsBetter = true): 'a' | 'b' | null =>
    va === vb ? null : (va > vb) === higherIsBetter ? 'a' : 'b';
  const name = (w: 'a' | 'b') => (w === 'a' ? na : nb);

  if (sa && sb) {
    const w = better(sa.score, sb.score);
    out.push({
      text: `Note : ${Math.round(sa.score * 100)} pour ${na}, ${Math.round(sb.score * 100)} pour ${nb}`,
      favours: Math.abs(sa.score - sb.score) < 0.005 ? null : w,
    });
  }

  const fa = mainFaces(a.faces);
  const fb = mainFaces(b.faces);
  // Seule, une personne peut regarder ailleurs : le regard n'avantage alors aucune des deux (point 39).
  const groupShot = Math.max(sa?.expectedFaces ?? fa.length, sb?.expectedFaces ?? fb.length) >= 2;
  // Netteté de l'image entière : seulement sans visage. Avec des personnes, c'est la netteté des visages qui compte
  // (utilisateur, 19/11) ; l'arrière-plan plus net n'explique pas une note (incohérence relevée le 19/11).
  if (fa.length === 0 && fb.length === 0 && a.sharpness && b.sharpness) {
    const d = rel(Math.max(a.sharpness, b.sharpness), Math.min(a.sharpness, b.sharpness));
    if (d >= 5) {
      const w = better(a.sharpness, b.sharpness)!;
      out.push({ text: `Image de ${name(w)} plus nette de ${d} %`, favours: w });
    } else out.push({ text: 'Netteté de l’image : identique (écart de moins de 5 %)', favours: null });
  }

  if (fa.length !== fb.length && (fa.length > 0 || fb.length > 0))
    out.push({ text: `Visages trouvés : ${fa.length} sur ${na}, ${fb.length} sur ${nb}`, favours: null });
  for (const [x, y] of pairFaces(fa, fb)) {
    const who = sideOf(x, fa.length);
    if (Math.abs(x.eyesOpen - y.eyesOpen) >= 0.1)
      out.push({ text: `Yeux, ${who} : ouverts à ${pct(x.eyesOpen)} sur ${na}, ${pct(y.eyesOpen)} sur ${nb}`, favours: better(x.eyesOpen, y.eyesOpen) });
    if (Math.abs(x.smile - y.smile) >= 0.1)
      out.push({ text: `Sourire, ${who} : ${pct(x.smile)} sur ${na}, ${pct(y.smile)} sur ${nb}`, favours: better(x.smile, y.smile) });
    if (Math.abs(x.gaze - y.gaze) >= 0.1)
      out.push({ text: `Regard vers l’objectif, ${who} : ${pct(x.gaze)} sur ${na}, ${pct(y.gaze)} sur ${nb}`, favours: groupShot ? better(x.gaze, y.gaze) : null });
    if (Math.abs(x.talking - y.talking) >= 0.2)
      out.push({ text: `Bouche ouverte (parle), ${who} : ${pct(x.talking)} sur ${na}, ${pct(y.talking)} sur ${nb}`, favours: better(x.talking, y.talking, false) });
    const d = rel(Math.max(x.sharpness, y.sharpness), Math.min(x.sharpness, y.sharpness));
    if (d >= 10) {
      const w = better(x.sharpness, y.sharpness)!;
      out.push({ text: `Netteté, ${who} : plus net de ${d} % sur ${name(w)}`, favours: w });
    }
  }

  // Objets et personnes : ce qui apparaît sur l'une et pas sur l'autre.
  const count = (it: MediaItem) => {
    const m = new Map<string, number>();
    for (const o of it.objects ?? []) if (o.score >= 0.45) m.set(o.label, (m.get(o.label) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  for (const label of new Set([...ca.keys(), ...cb.keys()])) {
    const x = ca.get(label) ?? 0;
    const y = cb.get(label) ?? 0;
    if (x === y) continue;
    const what = OBJECT_NAMES[label] ?? label;
    const more = x > y ? na : nb;
    out.push({ text: `${Math.abs(x - y)} ${what}${Math.abs(x - y) > 1 ? 's' : ''} de plus repéré${Math.abs(x - y) > 1 ? 's' : ''} sur ${more}`, favours: label === 'person' ? (x > y ? 'b' : 'a') : null });
  }

  if (a.exposure && b.exposure) {
    const ha = a.exposure.highlights;
    const hb = b.exposure.highlights;
    if (Math.abs(ha - hb) >= 0.005) out.push({ text: `Zones brûlées (trop blanches) : ${pct1(ha)} sur ${na}, ${pct1(hb)} sur ${nb}`, favours: better(ha, hb, false) });
    const da = a.exposure.shadows;
    const db = b.exposure.shadows;
    if (Math.abs(da - db) >= 0.005) out.push({ text: `Zones bouchées (trop noires) : ${pct1(da)} sur ${na}, ${pct1(db)} sur ${nb}`, favours: better(da, db, false) });
  }
  if (a.tiltDeg !== null && b.tiltDeg !== null && Math.abs(Math.abs(a.tiltDeg) - Math.abs(b.tiltDeg)) >= 0.5)
    out.push({
      text: `Inclinaison : ${Math.abs(a.tiltDeg).toFixed(1).replace('.', ',')}° sur ${na}, ${Math.abs(b.tiltDeg).toFixed(1).replace('.', ',')}° sur ${nb}`,
      favours: better(Math.abs(a.tiltDeg), Math.abs(b.tiltDeg), false),
    });
  return out;
}

/** Critères où « moins » vaut mieux (défauts). */
const LOWER_IS_BETTER = new Set<FeatureName>(['masquage', 'devant', 'arrierePlan', 'objets', 'penchee', 'membres', 'bords']);

export interface FactorRow {
  feature: FeatureName | 'gouts';
  a: number;
  b: number;
  favours: 'a' | 'b' | null;
}

/**
 * Critères de la note qui diffèrent entre deux photos (écart d'au moins 5 points sur 100), et la part de vos goûts
 * appris : ce qui explique qu'une photo ait une meilleure note que l'autre. Avec des visages, la netteté de l'image
 * entière est remplacée par celle des visages.
 */
export function scoreFactors(sa: PhotoScore, sb: PhotoScore, withFaces: boolean): FactorRow[] {
  const rows: FactorRow[] = [];
  // Personne seule : le regard ne compte pas dans la note (poids 0, point 39) ; il n'explique donc pas un écart.
  const solo = Math.max(sa.expectedFaces, sb.expectedFaces) < 2;
  for (const name of FEATURE_NAMES) {
    if (withFaces && name === 'nettete') continue;
    if (solo && name === 'regard') continue;
    if (!withFaces && (name === 'netteteVisage' || name === 'expression' || name === 'sourire' || name === 'regard')) continue;
    const a = sa.features[name];
    const b = sb.features[name];
    if (a === undefined || b === undefined || Math.abs(a - b) < 0.05) continue;
    const aWins = LOWER_IS_BETTER.has(name) ? a < b : a > b;
    rows.push({ feature: name, a, b, favours: aWins ? 'a' : 'b' });
  }
  const ga = sa.score - sa.baseScore;
  const gb = sb.score - sb.baseScore;
  if (Math.abs(ga - gb) >= 0.01) rows.push({ feature: 'gouts', a: ga, b: gb, favours: ga > gb ? 'a' : 'b' });
  return rows;
}
