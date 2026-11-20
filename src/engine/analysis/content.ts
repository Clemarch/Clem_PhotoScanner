// Contenu de la photo autour des personnes : objets gênants, personnes en arrière-plan.

import { config } from '../config';
import type { Box, DetectedObject, FaceMetrics, Rgb } from '../types';

const area = (b: Box): number => Math.max(0, b.width) * Math.max(0, b.height);

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function iou(a: Box, b: Box): number {
  const inter = overlap(a, b);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

const contains = (b: Box, x: number, y: number): boolean => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

/** Objet qui fait partie du sujet (planche de surf, vélo, chien) tenu par une personne ou à côté d'elle : il touche la
 *  zone d'une personne. Un chien au loin ou un ballon en arrière-plan ne compte pas. */
export function holdsSubjectObject(faces: readonly FaceMetrics[], objects: readonly DetectedObject[] | null): boolean {
  const cfg = config.content;
  const zones = faces.map(subjectZone);
  return (objects ?? []).some(
    (o) => cfg.subjectObjects.includes(o.label) && o.score >= cfg.subjectObjectMinScore && zones.some((z) => overlap(z, o.box) > 0),
  );
}

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

/** Boîtes des personnes détectées qui portent l'un des visages principaux : les sujets de la photo. */
export function subjectPersons(mainFaces: readonly FaceMetrics[], objects: readonly DetectedObject[] | null): Box[] {
  return (objects ?? [])
    .filter((o) => o.label === 'person' && o.score >= config.content.minObjectScore)
    .filter((o) => mainFaces.some((f) => contains(o.box, f.box.x + f.box.width / 2, f.box.y + f.box.height / 2)))
    .map((o) => o.box);
}

/**
 * Personnes qui reviennent au même endroit sur la plupart des photos d'un groupe : ce sont les sujets (vus de dos,
 * de loin, visage invisible), pas des passants. Ex. : un couple de dos face au coucher de soleil.
 */
export function recurringPersons(objectsByPhoto: readonly (readonly DetectedObject[] | null)[]): Box[] {
  const cfg = config.content;
  const photos = objectsByPhoto.filter((o): o is readonly DetectedObject[] => o !== null);
  if (photos.length < cfg.recurringMinPhotos) return [];
  const people = photos.map((list) =>
    list.filter((o) => o.label === 'person' && o.score >= cfg.minObjectScore && area(o.box) >= cfg.recurringMinArea).map((o) => o.box),
  );
  const result: Box[] = [];
  for (const box of people.flat()) {
    const seen = people.filter((list) => list.some((b) => iou(b, box) >= cfg.subjectOverlap)).length;
    if (seen / photos.length >= cfg.recurringShare && !result.some((b) => iou(b, box) >= cfg.subjectOverlap)) result.push(box);
  }
  return result;
}

/** Nombre de personnes présentes à la place d'un sujet (visage trouvé ou non). */
export function countSubjects(
  mainFaces: readonly FaceMetrics[],
  objects: readonly DetectedObject[] | null,
  knownSubjects: readonly Box[],
): number {
  const people = (objects ?? []).filter((o) => o.label === 'person' && o.score >= config.content.minObjectScore);
  const seen = people.filter(
    (o) =>
      mainFaces.some((f) => contains(o.box, f.box.x + f.box.width / 2, f.box.y + f.box.height / 2)) ||
      knownSubjects.some((s) => iou(s, o.box) >= config.content.subjectOverlap),
  ).length;
  return Math.max(seen, mainFaces.length);
}

/**
 * `mainFaces` : les personnes photographiées. `otherFaces` : visages plus petits, donc en arrière-plan.
 * `objects` : détections du modèle d'objets (personnes comprises), ou null s'il n'a pas tourné.
 * `knownSubjects` : places occupées par les sujets sur les autres photos du paquet.
 */
export function analyzeContent(
  mainFaces: readonly FaceMetrics[],
  otherFaces: readonly FaceMetrics[],
  objects: readonly DetectedObject[] | null,
  knownSubjects: readonly Box[] = [],
): ContentAnalysis {
  const cfg = config.content;
  const zones = mainFaces.map(subjectZone);
  const detections = (objects ?? []).filter((o) => o.score >= cfg.minObjectScore);

  // Petit objet tenu en main par un sujet (tasse, bouteille, téléphone) : un accessoire de la photo, pas une gêne
  // (utilisateur, 20/11 : « la tasse est un accessoire en main, ça ne gêne pas ici »).
  const subjectBodies = detections
    .filter((o) => o.label === 'person' && mainFaces.some((f) => contains(o.box, f.box.x + f.box.width / 2, f.box.y + f.box.height / 2)))
    .map((o) => o.box);
  const held = (o: DetectedObject) =>
    cfg.handheldLabels.includes(o.label) && subjectBodies.some((b) => overlap(b, o.box) >= cfg.heldInside * area(o.box));
  const distractions = detections
    .filter((o) => o.label in cfg.distractingLabels && o.score >= cfg.distractionMinScore && !held(o))
    .filter((o) => area(o.box) >= cfg.largeObjectArea || zones.some((zone) => overlap(zone, o.box) > 0))
    .map((o) => o.label);

  // Une personne détectée est l'un des sujets si elle contient le centre d'un visage principal,
  // ou si elle se tient là où se tient un sujet sur les autres photos (visage détourné, non trouvé).
  const isSubject = (b: Box) =>
    mainFaces.some((f) => contains(b, f.box.x + f.box.width / 2, f.box.y + f.box.height / 2)) ||
    knownSubjects.some((s) => iou(s, b) >= cfg.subjectOverlap);
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

interface Thresholds {
  chromaFrom: number;
  chromaFull: number;
  lumaFrom: number;
  lumaFull: number;
}

const ramp = (value: number, from: number, full: number): number => Math.min(1, Math.max(0, (value - from) / (full - from)));

export interface FaceChanges {
  /** Visage masqué (objet devant la bouche ou les yeux), entre 0 et 1. */
  occlusion: number[][];
  /** Objet devant la personne (zone sous le visage), entre 0 et 1. */
  front: number[][];
  /** Luminosité du visage rapportée à la même personne sur les autres photos (1 = habituelle). */
  brightness: number[][];
}

/**
 * Compare chaque personne à elle-même sur les photos du paquet.
 * `slots[p][k]` est le k-ième visage (de gauche à droite) de la photo p ; toutes les photos ont le même nombre de visages.
 * Un changement de couleur d'une partie du visage signale un objet devant ; un changement de luminosité de tout
 * le visage n'est pas un masquage mais une question d'exposition, et il est donc retiré de la mesure de masquage.
 */
export function compareFaces(slots: readonly (readonly FaceMetrics[])[]): FaceChanges {
  const cfg = config.content;
  const zeros = () => slots.map((faces) => faces.map(() => 0));
  const result: FaceChanges = { occlusion: zeros(), front: zeros(), brightness: slots.map((faces) => faces.map(() => 1)) };
  if (slots.length < cfg.occlusionMinPhotos) return result;
  const count = slots[0]?.length ?? 0;

  for (let k = 0; k < count; k++) {
    const part = (pick: (f: FaceMetrics) => Rgb | null) => {
      const colors = slots.map((faces) => pick(faces[k]!));
      if (colors.some((c) => c === null)) return null;
      const values = colors.map((c) => chroma(c!));
      const ref = [0, 1, 2].map((i) => median(values.map((v) => v[i]!)));
      return { values, ref };
    };
    const upper = part((f) => f.upperColor);
    const lower = part((f) => f.lowerColor);
    const body = part((f) => f.bodyColor);

    // Luminosité de tout le visage, par rapport à la même personne ailleurs.
    const faceRatio = slots.map((_, p) => {
      if (!upper || !lower) return 1;
      const lum = upper.values[p]![2]! + lower.values[p]![2]!;
      const ref = upper.ref[2]! + lower.ref[2]!;
      return ref > 0 ? lum / ref : 1;
    });
    faceRatio.forEach((ratio, p) => {
      result.brightness[p]![k] = ratio;
    });

    const deviation = (data: NonNullable<ReturnType<typeof part>>, t: Thresholds, p: number, relative: number) => {
      const v = data.values[p]!;
      const dc = Math.hypot(v[0]! - data.ref[0]!, v[1]! - data.ref[1]!);
      const dl = Math.abs(Math.log((v[2]! + 1) / (data.ref[2]! + 1) / relative));
      return Math.max(ramp(dc, t.chromaFrom, t.chromaFull), ramp(dl, t.lumaFrom, t.lumaFull));
    };
    const faceT = {
      chromaFrom: cfg.occlusionChromaFrom,
      chromaFull: cfg.occlusionChromaFull,
      lumaFrom: cfg.occlusionLumaFrom,
      lumaFull: cfg.occlusionLumaFull,
    };
    const bodyT = { chromaFrom: cfg.frontChromaFrom, chromaFull: cfg.frontChromaFull, lumaFrom: cfg.frontLumaFrom, lumaFull: cfg.frontLumaFull };
    slots.forEach((_, p) => {
      // Haut du visage : seule la couleur compte. L'ombre d'une casquette ou d'un chapeau assombrit les yeux
      // sans rien masquer.
      if (upper) result.occlusion[p]![k] = Math.max(result.occlusion[p]![k]!, deviation(upper, { ...faceT, lumaFrom: 99, lumaFull: 100 }, p, faceRatio[p]!));
      if (lower) result.occlusion[p]![k] = Math.max(result.occlusion[p]![k]!, deviation(lower, faceT, p, faceRatio[p]!));
      if (body) result.front[p]![k] = deviation(body, bodyT, p, faceRatio[p]!);
    });
  }
  return result;
}
