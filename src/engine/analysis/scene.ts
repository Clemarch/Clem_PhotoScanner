// Type de photo d'un paquet : on adapte ce qui est recherché à ce que la personne photographiait.

import { config } from '../config';
import type { FaceMetrics, MediaItem, SceneType } from '../types';

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
