// Contenu de la photo autour des personnes : objets gênants, personnes en arrière-plan.

import { config } from '../config';
import type { Box, DetectedObject, FaceMetrics } from '../types';

const area = (b: Box): number => Math.max(0, b.width) * Math.max(0, b.height);

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const contains = (b: Box, x: number, y: number): boolean => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

/** Zone occupée par une personne dont on connaît le visage : le visage, les épaules et le buste. */
export function subjectZone(face: FaceMetrics): Box {
  const cfg = config.content;
  const w = face.box.width * cfg.subjectZoneWidth;
  return {
    x: face.box.x + face.box.width / 2 - w / 2,
    y: face.box.y,
    width: w,
    height: face.box.height * cfg.subjectZoneHeight,
  };
}

export interface ContentAnalysis {
  /** Objets gênants (noms anglais du modèle). */
  distractions: string[];
  /** Poids total des personnes en arrière-plan (1 ≈ une personne bien visible au centre). */
  background: number;
}

/**
 * `mainFaces` : les personnes photographiées. `otherFaces` : visages plus petits, donc en arrière-plan.
 * `objects` : détections du modèle d'objets (personnes comprises), ou null s'il n'a pas tourné.
 */
export function analyzeContent(
  mainFaces: readonly FaceMetrics[],
  otherFaces: readonly FaceMetrics[],
  objects: readonly DetectedObject[] | null,
): ContentAnalysis {
  const cfg = config.content;
  const zones = mainFaces.map(subjectZone);
  const detections = (objects ?? []).filter((o) => o.score >= cfg.minObjectScore);

  const distractions = detections
    .filter((o) => o.label in cfg.distractingLabels)
    .filter((o) => area(o.box) >= cfg.largeObjectArea || zones.some((zone) => overlap(zone, o.box) > 0))
    .map((o) => o.label);

  // Une personne détectée est l'un des sujets si elle contient le centre d'un visage principal.
  const isSubject = (b: Box) =>
    mainFaces.some((f) => contains(b, f.box.x + f.box.width / 2, f.box.y + f.box.height / 2));
  const weight = (b: Box): number => {
    const size = Math.min(1, area(b) * cfg.backgroundAreaFactor);
    const dx = Math.abs(b.x + b.width / 2 - 0.5) * 2;
    const dy = Math.abs(b.y + b.height / 2 - 0.5) * 2;
    const centrality = 1 - (1 - cfg.backgroundEdgeWeight) * Math.min(1, Math.max(dx, dy));
    return size * centrality;
  };
  const people = detections.filter((o) => o.label === 'person' && !isSubject(o.box));
  let background = people.reduce((sum, p) => sum + weight(p.box), 0);
  // Visages d'arrière-plan qui n'appartiennent à aucune personne déjà comptée (le détecteur rate parfois les petites).
  for (const face of otherFaces) {
    const cx = face.box.x + face.box.width / 2;
    const cy = face.box.y + face.box.height / 2;
    if (people.some((p) => contains(p.box, cx, cy))) continue;
    background += weight(subjectZone(face));
  }
  return { distractions, background };
}

const chroma = (c: readonly number[]): [number, number, number] => {
  const sum = c[0]! + c[1]! + c[2]! || 1;
  return [c[0]! / sum, c[1]! / sum, sum / 3];
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Masquage de chaque visage (0 = dégagé, 1 = masqué), par comparaison avec la même personne
 * sur les autres photos du paquet : un objet devant la bouche ou les yeux change la couleur de la zone.
 * `slots[p][k]` est le k-ième visage (de gauche à droite) de la photo p ; toutes les photos ont le même nombre de visages.
 */
export function occlusionBySlot(slots: readonly (readonly FaceMetrics[])[]): number[][] {
  const cfg = config.content;
  const result = slots.map((faces) => faces.map(() => 0));
  if (slots.length < cfg.occlusionMinPhotos) return result;
  const count = slots[0]?.length ?? 0;
  for (let k = 0; k < count; k++) {
    for (const part of ['upperColor', 'lowerColor'] as const) {
      const colors = slots.map((faces) => faces[k]![part]);
      if (colors.some((c) => c === null)) continue;
      const values = colors.map((c) => chroma(c!));
      const ref = [0, 1, 2].map((i) => median(values.map((v) => v[i]!)));
      values.forEach((v, p) => {
        const dc = Math.hypot(v[0]! - ref[0]!, v[1]! - ref[1]!);
        const dl = Math.abs(Math.log((v[2]! + 1) / (ref[2]! + 1)));
        const score = Math.max(
          (dc - cfg.occlusionChromaFrom) / (cfg.occlusionChromaFull - cfg.occlusionChromaFrom),
          (dl - cfg.occlusionLumaFrom) / (cfg.occlusionLumaFull - cfg.occlusionLumaFrom),
        );
        result[p]![k] = Math.max(result[p]![k]!, Math.min(1, Math.max(0, score)));
      });
    }
  }
  return result;
}
