// Groupes de pose : dans un paquet, les photos qui se ressemblent (même cadrage, même attitude).

import { config } from '../config';
import { signatureDistance } from '../analysis/color';
import { mainFaces } from '../analysis/faces';
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

/** Les photos doivent être dans l'ordre chronologique (celui d'un paquet). */
export function groupPoses(items: readonly MediaItem[]): PoseGroup[] {
  const cfg = config.poses;
  const groups: MediaItem[][] = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    const first = current?.[0];
    const sameTime =
      previous?.capturedAt == null || item.capturedAt === null || item.capturedAt - previous.capturedAt <= cfg.gapSeconds * 1000;
    const fromPrevious = signatureDistance(previous?.signature ?? null, item.signature);
    const fromFirst = signatureDistance(first?.signature ?? null, item.signature);
    // Sans empreinte (mesure impossible), on ne coupe pas : le paquet reste un seul groupe.
    const similar =
      (fromPrevious === Infinity || fromPrevious <= cfg.fromPrevious) && (fromFirst === Infinity || fromFirst <= cfg.fromFirst);
    if (current && previous && sameTime && similar && !layoutChanged(previous, item)) current.push(item);
    else groups.push([item]);
  }
  return groups.map((list, i) => ({ id: `pose-${i + 1}`, label: label(i), items: list }));
}
