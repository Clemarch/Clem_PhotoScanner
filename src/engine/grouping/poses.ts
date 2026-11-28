// Groupes de pose : dans un paquet, les photos qui se ressemblent (même cadrage, même attitude).

import { config } from '../config';
import { signatureDistance } from '../analysis/color';
import { embeddingSimilarity } from '../analysis/embedding';
import { mainFaces } from '../analysis/faces';
import { zoomChanged } from './packs';
import type { MediaItem, PoseGroup } from '../types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const label = (i: number): string => (i < LETTERS.length ? LETTERS[i]! : `${LETTERS[i % LETTERS.length]}${Math.floor(i / LETTERS.length)}`);

/** Centres des visages principaux, de gauche à droite. */
function faceCenters(item: MediaItem): { x: number; y: number }[] {
  return mainFaces(item.faces)
    .map((f) => ({ x: f.box.x + f.box.width / 2, y: f.box.y + f.box.height / 2 }))
    .sort((a, b) => a.x - b.x);
}

/** La disposition des visages a-t-elle changé (nombre, ou un visage qui s'est beaucoup déplacé) ? */
function layoutChanged(a: MediaItem, b: MediaItem): boolean {
  if (a.faces === null || b.faces === null) return false;
  const fa = faceCenters(a);
  const fb = faceCenters(b);
  if (fa.length !== fb.length) return false; // un visage manqué ne change pas la pose : on s'en remet à l'empreinte
  return fa.some((p, i) => Math.hypot(p.x - fb[i]!.x, p.y - fb[i]!.y) > config.poses.faceMove);
}

/** Ni visage ni personne : paysage, coucher de soleil, objet. */
const scenery = (item: MediaItem): boolean =>
  mainFaces(item.faces).length === 0 && !(item.objects ?? []).some((o) => o.label === 'person' && o.score >= config.poses.personMinScore);

/**
 * Les photos doivent être dans l'ordre chronologique (celui d'un paquet). `forced` : photos reliées à la main à une
 * autre (identifiant → identifiant), mises dans sa pose quoi qu'en disent les mesures.
 */
export function groupPoses(items: readonly MediaItem[], forced: ReadonlyMap<string, string> = new Map()): PoseGroup[] {
  const cfg = config.poses;
  const groups: MediaItem[][] = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    const first = current?.[0];
    const gapMs = previous?.capturedAt == null || item.capturedAt === null ? 0 : item.capturedAt - previous.capturedAt;
    const sameTime = gapMs <= cfg.gapSeconds * 1000;
    let similar: boolean;
    const simPrevious = embeddingSimilarity(previous?.embedding ?? null, item.embedding);
    const simFirst = embeddingSimilarity(first?.embedding ?? null, item.embedding);
    if (simPrevious !== null && simFirst !== null) {
      // Rafale : même pose malgré un zoom, un léger recadrage ou un visage manqué, sauf scène vraiment différente.
      const burst = gapMs <= cfg.burstSeconds * 1000;
      // Autre objectif en rafale (0,5x, 1x, zoom) : même pose, cadrée autrement (28/11).
      const zoom = burst && previous !== undefined && zoomChanged(previous, item);
      similar = burst
        ? simPrevious >= (zoom ? cfg.zoomMinSimilar : cfg.burstMinSimilar)
        : simPrevious >= cfg.similarPrevious && simFirst >= cfg.similarFirst;
    } else {
      const fromPrevious = signatureDistance(previous?.signature ?? null, item.signature);
      const fromFirst = signatureDistance(first?.signature ?? null, item.signature);
      // Sans empreinte (mesure impossible), on ne coupe pas : le paquet reste un seul groupe.
      similar =
        (fromPrevious === Infinity || fromPrevious <= cfg.fromPrevious) && (fromFirst === Infinity || fromFirst <= cfg.fromFirst);
    }
    // Paysage sans personne : la même vue reprise plus tard (zoom, autre cadrage) reste la même pose (utilisateur, 19/11).
    const sameView =
      previous !== undefined && scenery(previous) && scenery(item) && (simPrevious ?? 0) >= cfg.sceneSimilar && (simFirst ?? 0) >= cfg.sceneSimilar;
    // Rafale très ressemblante : même pose, même si le cadrage bouge et déplace les visages dans l'image.
    const dated = previous?.capturedAt != null && item.capturedAt !== null;
    const steadyBurst = dated && gapMs <= cfg.burstSeconds * 1000 && simPrevious !== null && simPrevious >= cfg.similarPrevious;
    // Changement d'objectif : les visages bougent dans l'image sans que la pose change.
    const reframed = previous !== undefined && zoomChanged(previous, item);
    if (current && previous && ((sameTime && similar) || sameView) && (steadyBurst || reframed || !layoutChanged(previous, item))) current.push(item);
    else groups.push([item]);
  }
  attachSingles(groups);
  for (const [from, to] of forced) {
    const a = groups.findIndex((g) => g.some((it) => it.id === from));
    const b = groups.findIndex((g) => g.some((it) => it.id === to));
    if (a < 0 || b < 0 || a === b) continue;
    const moved = groups[a]!.splice(groups[a]!.findIndex((it) => it.id === from), 1)[0]!;
    groups[b]!.push(moved);
    groups[b]!.sort((x, y) => (x.capturedAt ?? 0) - (y.capturedAt ?? 0));
    if (groups[a]!.length === 0) groups.splice(a, 1);
  }
  groups.sort((x, y) => (x[0]!.capturedAt ?? 0) - (y[0]!.capturedAt ?? 0));
  return groups.map((list, i) => ({ id: `pose-${i + 1}`, label: label(i), items: list }));
}

/**
 * Seconde passe (point 74) : la première ne compare une photo qu'à la précédente et à la première du groupe ; une
 * photo plus large ou plus serrée (avec des passants, par exemple) restait seule, et l'utilisateur la validait sans
 * pouvoir la comparer. Chaque photo seule rejoint la pose qui lui ressemble le plus, si elle est assez proche dans
 * le temps. Les groupes restent dans l'ordre de leur première photo, et leurs photos dans l'ordre chronologique.
 */
function attachSingles(groups: MediaItem[][]): void {
  const cfg = config.poses;
  // Ressemblance demandée selon l'écart de temps : plus souple pour une photo prise juste avant ou après (28/11).
  const needed = (a: MediaItem, b: MediaItem): number | null => {
    if (a.capturedAt === null || b.capturedAt === null) return cfg.singleSimilar;
    const seconds = Math.abs(a.capturedAt - b.capturedAt) / 1000;
    if (seconds > cfg.singleSeconds) return null;
    return cfg.singleSteps.find((step) => seconds <= step.seconds)?.similar ?? cfg.singleSimilar;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i]!.length !== 1) continue;
      const single = groups[i]![0]!;
      let best: { j: number; sim: number } | null = null;
      for (let j = 0; j < groups.length; j++) {
        if (j === i) continue;
        for (const other of groups[j]!) {
          const sim = embeddingSimilarity(single.embedding, other.embedding);
          const bar = needed(single, other);
          if (sim === null || bar === null || sim < bar) continue;
          // La plus convaincante : la ressemblance au-dessus de ce qui était demandé.
          if (!best || sim - bar > best.sim) best = { j, sim: sim - bar };
        }
      }
      if (!best) continue;
      const target = groups[best.j]!;
      target.push(single);
      target.sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
      groups.splice(i, 1);
      groups.sort((a, b) => (a[0]!.capturedAt ?? 0) - (b[0]!.capturedAt ?? 0));
      changed = true;
      break;
    }
  }
}
