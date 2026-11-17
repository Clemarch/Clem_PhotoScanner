// Note chaque photo par rapport aux autres de son paquet, et explique pourquoi.
// Principe : le contenu (expression, visage masqué, arrière-plan, objets, cadrage) classe les photos ;
// la technique (netteté, yeux) ne sert qu'à repérer un défaut, jamais à préférer une photo « plus nette ».

import { config } from '../config';
import { analyzeContent, compareFaces, subjectPersons } from '../analysis/content';
import { mainFaces } from '../analysis/faces';
import { tiltDefect } from '../analysis/framing';
import type { FaceMetrics, MediaItem, PhotoScore, Reason } from '../types';

/** Valeur haute de référence, sans se laisser tromper par une mesure isolée anormalement élevée. */
function reference(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted.length >= 3 ? sorted[1]! : sorted[0]!;
}

const centerX = (face: FaceMetrics): number => face.box.x + face.box.width / 2;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Netteté rapportée à la référence du paquet, transformée en « absence de défaut » : 1 dès qu'elle est suffisante. */
function sharpEnough(ratio: number): number {
  const { sharpEnough: enough, sharpFloor: floor } = config.scoring;
  return clamp01((ratio - floor) / (enough - floor));
}

/** Nombre de visages qu'on s'attend à voir : la médiane (basse) du paquet. */
function expectedFaceCount(counts: number[]): number {
  if (counts.length === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

export function scorePack(items: readonly MediaItem[]): Map<string, PhotoScore> {
  const cfg = config.scoring;
  const r = cfg.reasons;

  // Visages rangés de gauche à droite : d'une photo à l'autre, la même place désigne la même personne.
  const facesOf = new Map<string, FaceMetrics[]>(
    items.map((item) => [item.id, mainFaces(item.faces).sort((a, b) => centerX(a) - centerX(b))]),
  );
  const otherFacesOf = (item: MediaItem): FaceMetrics[] => {
    const main = new Set(facesOf.get(item.id));
    return (item.faces ?? []).filter((face) => !main.has(face) && face.areaRatio >= config.faces.minAreaRatio);
  };
  const expected = expectedFaceCount(items.filter((item) => item.faces !== null).map((item) => facesOf.get(item.id)!.length));

  // Netteté de référence : globale pour l'image, et par personne pour les visages.
  const techRef = reference(items.map((item) => item.sharpness ?? 0));
  const allFaces = [...facesOf.values()];
  const anyFaceRef = reference(allFaces.flat().map((face) => face.sharpness));
  const completeItems = items.filter((item) => expected > 0 && facesOf.get(item.id)!.length === expected);
  const slotRef = Array.from({ length: expected }, (_, slot) =>
    reference(completeItems.map((item) => facesOf.get(item.id)![slot]!.sharpness)),
  );

  // Masquage, objet devant, luminosité : chaque personne comparée à elle-même sur les photos où tout le monde est visible.
  const changes = compareFaces(completeItems.map((item) => facesOf.get(item.id)!));
  const changesOf = new Map(
    completeItems.map((item, i) => [
      item.id,
      { occlusion: changes.occlusion[i]!, front: changes.front[i]!, brightness: changes.brightness[i]! },
    ]),
  );

  // Places occupées par les sujets sur l'ensemble du paquet.
  const knownSubjects = items.flatMap((item) => subjectPersons(facesOf.get(item.id)!, item.objects));

  // Arrière-plan et objets : jugés par rapport à la photo la plus dégagée du paquet,
  // pour ne pas pénaliser ce qui est présent partout (la plage derrière, un sac porté sur toutes les photos).
  const contentOf = new Map(
    items.map((item) => [item.id, analyzeContent(facesOf.get(item.id)!, otherFacesOf(item), item.objects, knownSubjects)]),
  );
  const contents = [...contentOf.values()];
  const minBackground = Math.min(...contents.map((c) => c.background));
  const minDistractions = Math.min(...contents.map((c) => c.distractions.length));
  const exposed = items.filter((item) => item.exposure !== null);
  const minHighlights = Math.min(...exposed.map((item) => item.exposure!.highlights));
  const minShadows = Math.min(...exposed.map((item) => item.exposure!.shadows));

  const sharpest = items.reduce<MediaItem | null>(
    (best, item) => ((item.sharpness ?? -1) > (best?.sharpness ?? -1) ? item : best),
    null,
  );
  const rawRatioOf = (item: MediaItem): number => (techRef > 0 ? Math.min(1, (item.sharpness ?? 0) / techRef) : 1);

  const scores: PhotoScore[] = items.map((item) => {
    const faces = facesOf.get(item.id)!;
    const reasons: Reason[] = [];
    const rawRatio = rawRatioOf(item);
    let technique: number;
    let faceScore: number | null = null;
    let vetoed = false;
    let occlusion = 0;
    let front = 0;
    let faceBrightness = 1;

    if (expected > 0) {
      technique = sharpEnough(rawRatio);
      if (faces.length === 0) {
        faceScore = 0;
        reasons.push({ code: 'aucun-visage', tone: 'moins' });
      } else {
        const w = cfg.faceWeights;
        const ratios = faces.map((face, slot) => {
          const ref = faces.length === expected ? slotRef[slot]! : anyFaceRef;
          return ref > 0 ? face.sharpness / ref : 1;
        });
        const change = changesOf.get(item.id);
        const occl = change?.occlusion ?? faces.map(() => 0);
        occlusion = Math.max(0, ...occl);
        front = Math.max(0, ...(change?.front ?? [0]));
        faceBrightness = Math.min(1, ...(change?.brightness ?? [1]));
        const quality = faces.map(
          (face, i) =>
            (w.eyes * face.eyesOpen + w.gaze * face.gaze + w.expression * face.expression + w.sharpness * sharpEnough(ratios[i]!)) *
            (1 - config.content.occlusionPenalty * occl[i]!),
        );
        const worst = Math.min(...quality);
        const mean = quality.reduce((a, b) => a + b, 0) / quality.length;
        faceScore = cfg.worstFaceWeight * worst + cfg.meanFaceWeight * mean;

        const missing = Math.max(0, expected - faces.length);
        if (missing > 0) {
          faceScore *= 1 - cfg.missingFacePenalty * (missing / expected);
          reasons.push({ code: 'visage-cache', tone: 'moins', count: faces.length, expected });
        }
        if (faces.some((face) => face.eyesOpen < cfg.eyesClosedBelow)) {
          vetoed = true;
          reasons.push({ code: 'yeux-fermes', tone: 'veto' });
        }
        if (faces.some((face) => face.cut)) {
          vetoed = true;
          reasons.push({ code: 'visage-coupe', tone: 'veto' });
        }
        if (occlusion >= r.occlusionFrom) reasons.push({ code: 'visage-masque', tone: 'moins' });
        if (front >= r.frontFrom) reasons.push({ code: 'devant', tone: 'moins' });
        if (faceBrightness < config.content.darkFaceBelow) reasons.push({ code: 'visage-sombre', tone: 'moins' });
        const talking = faces.some((face) => face.talking >= r.talkingFrom);
        if (talking) reasons.push({ code: 'parle', tone: 'moins' });
        if (faces.some((face) => face.pout >= r.poutFrom)) reasons.push({ code: 'moue', tone: 'moins' });
        if (!talking && faces.every((face) => face.smile >= r.smileFrom)) reasons.push({ code: 'sourire', tone: 'plus' });
        if (ratios.some((ratio) => ratio < r.faceBlurBelow)) reasons.push({ code: 'visage-flou', tone: 'moins' });
      }
    } else {
      // Paquet sans visage (paysage) : la netteté départage, en douceur.
      technique = Math.sqrt(rawRatio);
      if (items.length > 1 && sharpest) {
        if (sharpest.id === item.id) reasons.push({ code: 'plus-nette', tone: 'plus' });
        else if (rawRatio < r.lessSharpBelow) reasons.push({ code: 'moins-nette', tone: 'moins', refId: sharpest.id });
      }
    }

    const pw = cfg.photoWeights;
    const base =
      faceScore === null ? technique : (pw.faces * faceScore + pw.technique * technique) / (pw.faces + pw.technique);

    // Pénalités de contenu et de cadrage.
    const content = contentOf.get(item.id)!;
    const c = config.content;
    const extraBackground = content.background - minBackground;
    const backgroundPenalty = Math.min(c.backgroundPenaltyMax, c.backgroundPenalty * extraBackground);
    if (extraBackground >= r.backgroundFrom) reasons.push({ code: 'arriere-plan', tone: 'moins' });

    const extraObjects = content.distractions.length - minDistractions;
    const objectPenalty = Math.min(c.objectPenaltyMax, c.objectPenalty * extraObjects);
    if (extraObjects > 0) reasons.push({ code: 'objet', tone: 'moins', labels: [...new Set(content.distractions)] });

    const tilt = tiltDefect(item.tiltDeg, item.tiltStrength);
    if (tilt > 0) reasons.push({ code: 'horizon', tone: 'moins', degrees: Math.abs(item.tiltDeg ?? 0) });

    // Exposition : pixels brûlés ou bouchés en plus de la photo la mieux exposée du paquet.
    const e = config.exposure;
    const ramp = (value: number) => clamp01((value - e.clippedFrom) / (e.clippedFull - e.clippedFrom));
    const over = item.exposure ? ramp(item.exposure.highlights - minHighlights) : 0;
    const under = item.exposure ? ramp(item.exposure.shadows - minShadows) : 0;
    if (over > 0) reasons.push({ code: 'surexposee', tone: 'moins' });
    if (under > 0) reasons.push({ code: 'sous-exposee', tone: 'moins' });

    const dark = clamp01((c.darkFaceBelow - faceBrightness) / (c.darkFaceBelow - c.darkFaceFull));
    const score =
      base *
      (1 - backgroundPenalty) *
      (1 - objectPenalty) *
      (1 - config.framing.tiltPenalty * tilt) *
      (1 - c.frontPenalty * front) *
      (1 - c.darkFacePenalty * dark) *
      (1 - e.penalty * Math.max(over, under));

    return {
      id: item.id,
      score,
      rank: 0,
      vetoed,
      reasons,
      faceCount: faces.length,
      expectedFaces: expected,
      faceScore,
      technique,
      background: content.background,
      distraction: content.distractions.length,
      occlusion,
      front,
      faceBrightness,
    };
  });

  // Jugement relatif : si tout le paquet est sous veto, le veto ne départage plus rien, on le lève.
  if (scores.length > 0 && scores.every((score) => score.vetoed)) for (const score of scores) score.vetoed = false;

  // Classement ; à note égale, la plus nette passe devant.
  const rawRatio = new Map(items.map((item) => [item.id, rawRatioOf(item)]));
  [...scores]
    .sort(
      (a, b) =>
        Number(a.vetoed) - Number(b.vetoed) ||
        b.score - a.score ||
        rawRatio.get(b.id)! - rawRatio.get(a.id)!,
    )
    .forEach((score, i) => {
      score.rank = i + 1;
    });

  return new Map(scores.map((score) => [score.id, score]));
}
