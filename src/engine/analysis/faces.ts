// Transforme les mesures brutes du détecteur en notes lisibles pour un visage.

import { config } from '../config';
import type { Box, FaceMetrics, FaceObservation, Rgb } from '../types';
import { sharpnessFromGray } from './sharpness';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const DEG = 180 / Math.PI;

/** Plus petit rectangle contenant tous les points d'un visage. */
export function boxFromPoints(points: readonly { x: number; y: number }[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const horizontal = (x: number, z: number): number => Math.atan2(x, z) * DEG;
const vertical = (x: number, y: number, z: number): number => Math.atan2(-y, Math.hypot(x, z)) * DEG;

/** Rotation de la tête par rapport à l'axe de l'appareil, à partir d'une matrice 4 x 4 rangée par colonnes. */
export function headPose(matrix: readonly number[] | null): { yawDeg: number; pitchDeg: number } {
  if (!matrix || matrix.length < 16) return { yawDeg: 0, pitchDeg: 0 };
  // Troisième colonne : la direction vers laquelle pointe le visage.
  return {
    yawDeg: horizontal(matrix[8]!, matrix[10]!),
    pitchDeg: vertical(matrix[8]!, matrix[9]!, matrix[10]!),
  };
}

/**
 * Direction de l'objectif vu depuis un point de l'image, dans les mêmes conventions que `headPose`.
 * Un visage au bord d'une photo prise au grand-angle (selfie à deux) doit tourner la tête pour regarder
 * le téléphone : par rapport à l'axe de l'appareil il semble regarder de côté, alors qu'il regarde l'objectif.
 * La focale réelle donne l'angle exact ; au téléobjectif la correction devient négligeable.
 */
export function lensDirection(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  focal35: number | null,
): { hDeg: number; vDeg: number } {
  // Un capteur « 35 mm » a une demi-diagonale de 21,63 mm : on en déduit la focale en pixels.
  const focalPx = ((focal35 ?? config.faces.defaultFocal35) * Math.hypot(width, height)) / 2 / 21.63;
  return {
    hDeg: -Math.atan(((centerX - 0.5) * width) / focalPx) * DEG,
    vDeg: Math.atan(((0.5 - centerY) * height) / focalPx) * DEG,
  };
}

/** Découpe un rectangle dans une image en niveaux de gris. */
export function cropGray(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
): { gray: Uint8Array; width: number; height: number } {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.width) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) out.set(gray.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + w), y * w);
  return { gray: out, width: w, height: h };
}

/** Couleur moyenne d'une zone d'une image RGBA (zone en proportions de l'image). */
export function regionColor(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, box: Box): Rgb | null {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.width) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
  let r = 0;
  let g = 0;
  let bl = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * 4;
      r += rgba[p]!;
      g += rgba[p + 1]!;
      bl += rgba[p + 2]!;
      n++;
    }
  return n === 0 ? null : [r / n, g / n, bl / n];
}

/** Zones du visage (en proportions de sa boîte) : haut = yeux, bas = bouche et menton. */
const UPPER = { x: 0.2, y: 0.18, width: 0.6, height: 0.27 };
const LOWER = { x: 0.22, y: 0.6, width: 0.56, height: 0.36 };
const within = (box: Box, part: Box): Box => ({
  x: box.x + part.x * box.width,
  y: box.y + part.y * box.height,
  width: part.width * box.width,
  height: part.height * box.height,
});

/** Zone juste sous le visage (cou, haut du buste). */
export function bodyZone(box: Box): Box {
  const c = config.content;
  const w = box.width * c.bodyZoneWidth;
  return {
    x: box.x + box.width / 2 - w / 2,
    y: box.y + box.height * c.bodyZoneTop,
    width: w,
    height: box.height * (c.bodyZoneBottom - c.bodyZoneTop),
  };
}

export function measureFace(
  observation: FaceObservation,
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  focal35: number | null = null,
  rgba: Uint8Array | Uint8ClampedArray | null = null,
): FaceMetrics {
  const cfg = config.faces;
  const b = (name: string): number => observation.blendshapes[name] ?? 0;
  const { box } = observation;

  // Yeux : un seul œil fermé suffit à rater la photo.
  const eyesRaw = 1 - Math.max(b('eyeBlinkLeft'), b('eyeBlinkRight'));
  const eyesOpen = clamp01((eyesRaw - cfg.eyesClosedAt) / (cfg.eyesOpenAt - cfg.eyesClosedAt));

  // Regard : la tête pointe-t-elle vers l'objectif ? Si elle est tournée mais que les yeux reviennent
  // vers l'objectif, on retient la lecture la plus favorable.
  const eyeH = (b('eyeLookOutLeft') + b('eyeLookInRight') - b('eyeLookInLeft') - b('eyeLookOutRight')) / 2;
  const eyeV = (b('eyeLookUpLeft') + b('eyeLookUpRight') - b('eyeLookDownLeft') - b('eyeLookDownRight')) / 2;
  const pose = headPose(observation.matrix);
  const lens = lensDirection(box.x + box.width / 2, box.y + box.height / 2, width, height, focal35);
  const offAxisHDeg = pose.yawDeg - lens.hDeg;
  const offAxisVDeg = pose.pitchDeg - lens.vDeg;
  const v = offAxisVDeg * cfg.gazeVerticalWeight;
  const headOnly = Math.hypot(offAxisHDeg, v);
  const withEyes = Math.hypot(offAxisHDeg + cfg.eyeRangeDeg * eyeH, v);
  const deviation = Math.min(headOnly, withEyes);
  const gaze = clamp01(1 - (deviation - cfg.gazeFullDeg) / (cfg.gazeZeroDeg - cfg.gazeFullDeg));

  // Expression : un visage calme vaut déjà bien. Un sourire, ou une pose voulue (moue, bisou), l'améliore.
  // Seule une bouche ouverte sans sourire (en train de parler) est un défaut.
  const smile = clamp01((b('mouthSmileLeft') + b('mouthSmileRight')) / 2);
  const talking = Math.max(0, b('jawOpen') - cfg.jawOpenFrom) * (1 - smile);
  const pout = clamp01(Math.max(0, Math.max(b('mouthFunnel'), b('mouthPucker')) - cfg.poutFrom) / (1 - cfg.poutFrom));
  const expression = clamp01(cfg.expressionNeutral + cfg.smileBonus * Math.max(smile, pout) - cfg.talkingPenalty * talking);

  const crop = cropGray(gray, width, height, box);
  const sharpness = sharpnessFromGray(
    crop.gray,
    crop.width,
    crop.height,
    config.sharpness.faceGridSize,
    config.sharpness.faceTopFraction,
  );

  const m = cfg.cutMargin;
  const cut = box.x < m || box.y < m || box.x + box.width > 1 - m || box.y + box.height > 1 - m;

  const visibleWidth = Math.min(1, box.x + box.width) - Math.max(0, box.x);
  const visibleHeight = Math.min(1, box.y + box.height) - Math.max(0, box.y);

  return {
    box,
    areaRatio: Math.max(0, visibleWidth) * Math.max(0, visibleHeight),
    eyesOpen,
    gaze,
    expression,
    smile,
    sharpness,
    cut,
    ...pose,
    offAxisHDeg,
    offAxisVDeg,
    eyeH,
    eyeV,
    talking: clamp01(talking / (1 - cfg.jawOpenFrom)),
    pout,
    upperColor: rgba ? regionColor(rgba, width, height, within(box, UPPER)) : null,
    lowerColor: rgba ? regionColor(rgba, width, height, within(box, LOWER)) : null,
    bodyColor: rgba ? regionColor(rgba, width, height, bodyZone(box)) : null,
  };
}

/** Visages qui comptent dans une photo : assez grands, et pas minuscules face au plus grand. */
export function mainFaces(faces: readonly FaceMetrics[] | null): FaceMetrics[] {
  if (!faces) return [];
  const visible = faces.filter((face) => face.areaRatio >= config.faces.minAreaRatio);
  const largest = Math.max(0, ...visible.map((face) => face.areaRatio));
  return visible.filter((face) => face.areaRatio >= largest * config.faces.mainRelativeArea);
}
