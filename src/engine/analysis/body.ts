// Cadrage du corps : mains ou pieds coupés par le bord de l'image.

import { config } from '../config';
import type { BodyMetrics, BodyPoint, Box } from '../types';

// Numéros des points du modèle de pose (BlazePose, 33 points).
const NOSE = 0;
const ELBOWS = [13, 14] as const;
const WRISTS = [15, 16] as const;
const INDEX_FINGERS = [19, 20] as const;
const KNEES = [25, 26] as const;
const ANKLES = [27, 28] as const;
const TOES = [31, 32] as const;

export function measureBody(points: readonly BodyPoint[]): BodyMetrics {
  const cfg = config.body;
  const m = cfg.edgeMargin;
  const inside = (p: BodyPoint | undefined) => !!p && p.x > m && p.x < 1 - m && p.y > m && p.y < 1 - m;
  const visible = (p: BodyPoint | undefined) => !!p && p.visibility >= cfg.visibleFrom;
  const outside = (p: BodyPoint | undefined) => !!p && !inside(p);

  // Membre coupé : l'articulation d'avant est dans l'image et visible, l'extrémité est dehors.
  const cut = (joints: readonly number[], ends: readonly (readonly number[])[]) =>
    joints.filter((joint, side) => {
      const j = points[joint];
      return inside(j) && visible(j) && ends.some((list) => outside(points[list[side]!]));
    }).length;

  const shown = points.filter((p) => visible(p) && inside(p));
  let box: Box = { x: 0, y: 0, width: 0, height: 0 };
  if (shown.length > 0) {
    const xs = shown.map((p) => p.x);
    const ys = shown.map((p) => p.y);
    box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  const nose = points[NOSE];
  return {
    box,
    nose: nose && visible(nose) ? { x: nose.x, y: nose.y } : null,
    cutHands: cut(ELBOWS, [WRISTS, INDEX_FINGERS]),
    cutFeet: cut(KNEES, [ANKLES, TOES]),
    arms: [...ELBOWS, ...WRISTS, ...INDEX_FINGERS].map((k) => {
      const p = points[k];
      return p ? [p.x, p.y, p.visibility] : [NaN, NaN, 0];
    }),
  };
}
