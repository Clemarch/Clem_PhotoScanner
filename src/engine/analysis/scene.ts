// Type de photo d'un paquet : on adapte ce qui est recherché à ce que la personne photographiait.

import { config } from '../config';
import type { FaceMetrics, MediaItem, SceneLabel, SceneType } from '../types';

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
};

/**
 * `expectedFaces` : nombre de visages principaux attendu dans le paquet.
 * `facesOf` : visages principaux de chaque photo.
 */
export function classifyPack(
  items: readonly MediaItem[],
  expectedFaces: number,
  facesOf: (item: MediaItem) => readonly FaceMetrics[],
): SceneType {
  const cfg = config.scene;
  if (expectedFaces >= cfg.groupFrom) return 'groupe';
  if (expectedFaces >= 1) {
    const focal = median(items.flatMap((item) => (item.focal35 === null ? [] : [item.focal35])));
    const area = median(items.flatMap((item) => facesOf(item).map((f) => f.areaRatio)));
    return focal > 0 && focal <= cfg.selfieMaxFocal && area >= cfg.selfieMinFaceArea ? 'selfie' : 'portrait';
  }
  // Sans personne : le modèle de classement reconnaît d'abord les documents, la nourriture, les animaux.
  const c = config.classifier;
  const share = (test: (label: SceneLabel) => boolean) => {
    const classified = items.filter((item) => item.labels !== null);
    if (classified.length === 0) return 0;
    return classified.filter((item) => item.labels!.some((l) => l.score >= c.sceneScore && test(l))).length / classified.length;
  };
  const inRange = (range: readonly number[]) => (l: SceneLabel) => l.index >= range[0]! && l.index <= range[1]!;
  if (share((l) => c.document.includes(l.index)) >= c.sceneShare) return 'document';
  if (share(inRange(c.food)) >= c.sceneShare) return 'nourriture';
  if (share(inRange(c.animal)) >= c.sceneShare) return 'animal';

  const colors = items.flatMap((item) => (item.color ? [item.color] : []));
  const warmFraction = median(colors.map((c) => c.warmFraction));
  const warmStrength = median(colors.map((c) => c.warmStrength));
  return warmFraction >= cfg.sunsetWarmFraction && warmStrength >= cfg.sunsetWarmStrength ? 'coucher' : 'paysage';
}

/** Équilibre de l'exposition, entre 0 et 1 : luminosité proche du niveau visé, peu de zones brûlées ou bouchées. */
export function exposureBalance(item: MediaItem): number | null {
  if (!item.color) return null;
  const target = config.scene.balanceTarget;
  const offset = Math.abs(item.color.mean - target) / target;
  const clipped = item.exposure ? item.exposure.highlights + item.exposure.shadows : 0;
  return Math.max(0, 1 - offset - 2 * clipped);
}

/** Photo prise d'un avion (hublot) : le modèle de classement y voit un avion de ligne ou une aile. */
export function seenFromPlane(item: MediaItem): boolean {
  return (item.labels ?? []).some((l) => config.classifier.airplane.includes(l.index));
}
