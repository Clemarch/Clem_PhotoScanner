// Deux photos d'une même pose sont-elles différentes ? L'utilisateur (19/11) garde plusieurs photos d'une pose quand
// elles apportent chacune quelque chose (tête qui bouge, autre expression, autre geste, personnes qui changent de
// place, cadrage) ; si elles sont identiques, il ne garde que la meilleure.

import { config } from '../config';
import { mainFaces } from '../analysis/faces';
import { embeddingSimilarity } from '../analysis/embedding';
import { signatureDistance } from '../analysis/color';
import type { Box, DifferenceKind, FaceMetrics, MediaItem } from '../types';

export type DifferenceLevel = 'nette' | 'legere' | 'aucune';

export interface PoseDifference {
  level: DifferenceLevel;
  kinds: DifferenceKind[];
}

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Visages appariés par position (même personne, à peu près au même endroit). */
function pairs<T extends { box: Box }>(a: readonly T[], b: readonly T[], maxDistance: number): [T, T][] {
  const out: [T, T][] = [];
  const used = new Set<T>();
  for (const x of a) {
    const cx = center(x.box);
    let best: T | null = null;
    let bestD = maxDistance;
    for (const y of b) {
      if (used.has(y)) continue;
      const cy = center(y.box);
      const d = Math.hypot(cx.x - cy.x, cx.y - cy.y);
      if (d < bestD) {
        bestD = d;
        best = y;
      }
    }
    if (best) {
      used.add(best);
      out.push([x, best]);
    }
  }
  return out;
}

const INTENDED = (item: MediaItem): string =>
  (item.hands ?? [])
    .filter((h) => h.score >= config.gestures.minScore && config.gestures.intended.includes(h.gesture))
    .map((h) => h.gesture)
    .sort()
    .join(',');

export function poseDifference(a: MediaItem, b: MediaItem): PoseDifference {
  const t = config.selection.different;
  const strong = new Set<DifferenceKind>();
  const light = new Set<DifferenceKind>();
  const mark = (kind: DifferenceKind, value: number, s: number, l: number) => {
    if (value >= s) strong.add(kind);
    else if (value >= l) light.add(kind);
  };

  const fa = mainFaces(a.faces);
  const fb = mainFaces(b.faces);
  if (fa.length !== fb.length && a.faces !== null && b.faces !== null) light.add('personnes');
  for (const [x, y] of pairs<FaceMetrics>(fa, fb, 0.25)) {
    mark('tete', Math.max(Math.abs(x.yawDeg - y.yawDeg), Math.abs(x.pitchDeg - y.pitchDeg)), t.headStrong, t.headLight);
    mark('expression', Math.max(Math.abs(x.smile - y.smile), Math.abs(x.pout - y.pout), Math.abs(x.talking - y.talking)), t.smileStrong, t.smileLight);
    mark('regard', Math.max(Math.abs(x.eyeH - y.eyeH), Math.abs(x.eyeV - y.eyeV)), t.eyeDirStrong, t.eyeDirLight);
  }
  if (INTENDED(a) !== INTENDED(b)) strong.add('geste');

  // Personnes repérées (même de dos, de loin) : déplacement de chacune.
  const persons = (it: MediaItem) => (it.objects ?? []).filter((o) => o.label === 'person' && o.score >= 0.5);
  const pa = persons(a);
  const pb = persons(b);
  if (pa.length !== pb.length) light.add('personnes');
  for (const [x, y] of pairs(pa, pb, 0.3)) {
    const cx = center(x.box);
    const cy = center(y.box);
    mark('personnes', Math.hypot(cx.x - cy.x, cx.y - cy.y), t.personMoveStrong, t.personMoveLight);
  }

  const similar = embeddingSimilarity(a.embedding, b.embedding);
  if (similar !== null) mark('cadrage', 1 - similar, 1 - t.similarStrong, 1 - t.similarLight);
  else {
    // Sans empreinte fine (modèle indisponible) : empreinte simple de 8 × 8 pixels.
    const d = signatureDistance(a.signature, b.signature);
    if (Number.isFinite(d)) mark('cadrage', d, t.signatureStrong, t.signatureLight);
  }

  for (const k of strong) light.delete(k);
  if (strong.size > 0) return { level: 'nette', kinds: [...strong, ...light] };
  if (light.size > 0) return { level: 'legere', kinds: [...light] };
  return { level: 'aucune', kinds: [] };
}
