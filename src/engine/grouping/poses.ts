// Groupes de pose : dans un paquet, les photos qui se ressemblent (même cadrage, même attitude).

import { config } from '../config';
import { signatureDistance } from '../analysis/color';
import { embeddingSimilarity } from '../analysis/embedding';
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

const sameFaceCount = (a: MediaItem, b: MediaItem): boolean =>
  a.faces === null || b.faces === null || mainFaces(a.faces).length === mainFaces(b.faces).length;

/** Les photos doivent être dans l'ordre chronologique (celui d'un paquet). */
export function groupPoses(items: readonly MediaItem[]): PoseGroup[] {
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
      // Rafale : même pose malgré un zoom ou un léger recadrage, sauf scène vraiment différente.
      const burst = gapMs <= cfg.burstSeconds * 1000 && sameFaceCount(previous!, item);
      similar = burst ? simPrevious >= cfg.burstMinSimilar : simPrevious >= cfg.similarPrevious && simFirst >= cfg.similarFirst;
    } else {
      const fromPrevious = signatureDistance(previous?.signature ?? null, item.signature);
      const fromFirst = signatureDistance(first?.signature ?? null, item.signature);
      // Sans empreinte (mesure impossible), on ne coupe pas : le paquet reste un seul groupe.
      similar =
        (fromPrevious === Infinity || fromPrevious <= cfg.fromPrevious) && (fromFirst === Infinity || fromFirst <= cfg.fromFirst);
    }
    if (current && previous && sameTime && similar && !layoutChanged(previous, item)) current.push(item);
    else groups.push([item]);
  }
  return groups.map((list, i) => ({ id: `pose-${i + 1}`, label: label(i), items: list }));
}
