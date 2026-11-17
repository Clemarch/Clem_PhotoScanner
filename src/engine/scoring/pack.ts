// Note chaque photo par rapport aux autres de son paquet, et explique pourquoi.

import { config } from '../config';
import { mainFaces } from '../analysis/faces';
import type { FaceMetrics, MediaItem, PhotoScore, Reason } from '../types';

const soften = (ratio: number): number => Math.pow(Math.min(1, Math.max(0, ratio)), config.scoring.sharpnessExponent);

/** Nombre de visages qu'on s'attend à voir : la médiane (basse) du paquet. */
function expectedFaceCount(counts: number[]): number {
  if (counts.length === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

export function scorePack(items: readonly MediaItem[]): Map<string, PhotoScore> {
  const cfg = config.scoring;
  const facesOf = new Map<string, FaceMetrics[]>(items.map((item) => [item.id, mainFaces(item.faces)]));
  const expected = expectedFaceCount(items.filter((item) => item.faces !== null).map((item) => facesOf.get(item.id)!.length));

  const bestSharpness = Math.max(0, ...items.map((item) => item.sharpness ?? 0));
  const bestFaceSharpness = Math.max(0, ...[...facesOf.values()].flat().map((face) => face.sharpness));
  const sharpest = items.reduce<MediaItem | null>(
    (best, item) => ((item.sharpness ?? -1) > (best?.sharpness ?? -1) ? item : best),
    null,
  );

  const scores: PhotoScore[] = items.map((item) => {
    const faces = facesOf.get(item.id)!;
    const reasons: Reason[] = [];
    const technique = bestSharpness > 0 ? soften((item.sharpness ?? 0) / bestSharpness) : 1;
    let faceScore: number | null = null;
    let vetoed = false;

    if (expected > 0) {
      if (faces.length === 0) {
        faceScore = 0;
        reasons.push({ code: 'aucun-visage', tone: 'moins' });
      } else {
        const w = cfg.faceWeights;
        const relSharp = faces.map((face) => (bestFaceSharpness > 0 ? soften(face.sharpness / bestFaceSharpness) : 1));
        const quality = faces.map(
          (face, i) =>
            w.eyes * face.eyesOpen + w.gaze * face.gaze + w.expression * face.expression + w.sharpness * relSharp[i]!,
        );
        const worst = Math.min(...quality);
        const mean = quality.reduce((a, b) => a + b, 0) / quality.length;
        faceScore = cfg.worstFaceWeight * worst + cfg.meanFaceWeight * mean;

        const missing = Math.max(0, expected - faces.length);
        if (missing > 0) {
          faceScore *= 1 - cfg.missingFacePenalty * (missing / expected);
          reasons.push({ code: 'visage-cache', tone: 'moins', count: faces.length, expected });
        }

        const r = cfg.reasons;
        if (faces.some((face) => face.eyesOpen < cfg.eyesClosedBelow)) {
          vetoed = true;
          reasons.push({ code: 'yeux-fermes', tone: 'veto' });
        }
        if (faces.some((face) => face.cut)) {
          vetoed = true;
          reasons.push({ code: 'visage-coupe', tone: 'veto' });
        }
        if (faces.some((face) => face.gaze < r.gazeAwayBelow)) reasons.push({ code: 'regard-ailleurs', tone: 'moins' });
        else if (faces.every((face) => face.gaze >= r.gazeGoodFrom && face.eyesOpen >= cfg.eyesClosedBelow))
          reasons.push({ code: 'regarde-objectif', tone: 'plus' });
        if (faces.some((face) => face.expression < r.expressionBadBelow)) reasons.push({ code: 'expression', tone: 'moins' });
        else if (faces.every((face) => face.smile >= r.smileFrom)) reasons.push({ code: 'sourire', tone: 'plus' });
        if (relSharp.some((value) => value < r.faceBlurBelow)) reasons.push({ code: 'visage-flou', tone: 'moins' });
        else if (items.length > 1 && relSharp.every((value) => value >= r.faceSharpFrom))
          reasons.push({ code: 'visage-net', tone: 'plus' });
      }
    } else if (items.length > 1 && sharpest) {
      // Paquet sans visage (paysage) : seule la technique compte.
      if (sharpest.id === item.id) reasons.push({ code: 'plus-nette', tone: 'plus' });
      else if (technique < cfg.reasons.lessSharpBelow) reasons.push({ code: 'moins-nette', tone: 'moins', refId: sharpest.id });
    }

    const pw = cfg.photoWeights;
    const score =
      faceScore === null ? technique : (pw.faces * faceScore + pw.technique * technique) / (pw.faces + pw.technique);

    return { id: item.id, score, rank: 0, vetoed, reasons, faceCount: faces.length, expectedFaces: expected, faceScore, technique };
  });

  // Jugement relatif : si tout le paquet est sous veto, le veto ne départage plus rien, on le lève.
  if (scores.length > 0 && scores.every((score) => score.vetoed)) for (const score of scores) score.vetoed = false;

  [...scores]
    .sort((a, b) => Number(a.vetoed) - Number(b.vetoed) || b.score - a.score)
    .forEach((score, i) => {
      score.rank = i + 1;
    });

  return new Map(scores.map((score) => [score.id, score]));
}
