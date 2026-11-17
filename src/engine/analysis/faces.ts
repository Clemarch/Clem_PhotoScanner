// Transforme les mesures brutes du détecteur en notes lisibles pour un visage.

import { config } from '../config';
import type { Box, FaceMetrics, FaceObservation } from '../types';
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

/** Angles de la tête (degrés) à partir d'une matrice 4 x 4 rangée par colonnes. */
export function headAngles(matrix: readonly number[] | null): { yawDeg: number; pitchDeg: number } {
  if (!matrix || matrix.length < 16) return { yawDeg: 0, pitchDeg: 0 };
  const yaw = Math.atan2(matrix[8]!, matrix[10]!);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -matrix[9]!)));
  return { yawDeg: yaw * DEG, pitchDeg: pitch * DEG };
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

export function measureFace(
  observation: FaceObservation,
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): FaceMetrics {
  const cfg = config.faces;
  const b = (name: string): number => observation.blendshapes[name] ?? 0;
  const { box } = observation;

  // Yeux : un seul œil fermé suffit à rater la photo.
  const eyesOpen = clamp01(1 - Math.max(b('eyeBlinkLeft'), b('eyeBlinkRight')));

  // Regard : direction des yeux dans la tête, et rotation de la tête elle-même.
  const eyeH = (b('eyeLookOutLeft') + b('eyeLookInRight') - b('eyeLookInLeft') - b('eyeLookOutRight')) / 2;
  const eyeV = (b('eyeLookUpLeft') + b('eyeLookUpRight') - b('eyeLookDownLeft') - b('eyeLookDownRight')) / 2;
  const eyeDeviation = clamp01(Math.hypot(eyeH, eyeV) / cfg.eyeDeviationMax);
  const { yawDeg, pitchDeg } = headAngles(observation.matrix);
  const headDeviation = clamp01(Math.max(Math.abs(yawDeg) / cfg.yawMaxDeg, Math.abs(pitchDeg) / cfg.pitchMaxDeg));
  const gaze = clamp01(1 - (cfg.eyeDeviationWeight * eyeDeviation + cfg.headDeviationWeight * headDeviation));

  // Expression : le sourire aide ; une bouche ouverte sans sourire (parole) ou une moue pénalisent.
  const smile = clamp01((b('mouthSmileLeft') + b('mouthSmileRight')) / 2);
  const talking = Math.max(0, b('jawOpen') - cfg.jawOpenFrom) * (1 - smile);
  const pout = Math.max(0, Math.max(b('mouthFunnel'), b('mouthPucker')) - cfg.poutFrom);
  const expression = clamp01(
    cfg.expressionNeutral + cfg.smileBonus * smile - cfg.talkingPenalty * talking - cfg.poutPenalty * pout,
  );

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
    yawDeg,
    pitchDeg,
  };
}

/** Visages qui comptent dans une photo : assez grands, et pas minuscules face au plus grand. */
export function mainFaces(faces: readonly FaceMetrics[] | null): FaceMetrics[] {
  if (!faces) return [];
  const visible = faces.filter((face) => face.areaRatio >= config.faces.minAreaRatio);
  const largest = Math.max(0, ...visible.map((face) => face.areaRatio));
  return visible.filter((face) => face.areaRatio >= largest * config.faces.mainRelativeArea);
}
