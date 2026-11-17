// Apprentissage des goûts de l'utilisateur, entièrement sur l'appareil.
// Chaque choix « je garde celle-ci, je supprime celle-là » dans un même paquet est une préférence.
// On ajuste un petit poids par critère pour que la note suive ces préférences (régression logistique sur paires).

import { config } from '../config';
import { FEATURE_NAMES, type ChoiceRecord, type Features, type LearnedWeights } from '../types';

/**
 * Ajustement de la note d'une photo d'après les poids appris, plafonné.
 * `reference` : valeur moyenne de chaque critère dans le paquet. Seul l'écart à cette moyenne compte :
 * l'ajustement départage les photos d'un paquet, il ne relève ni n'abaisse le paquet entier.
 */
export function learnedAdjustment(features: Features, weights: LearnedWeights, reference?: Features): number {
  const max = config.learning.maxAdjustment;
  let sum = 0;
  for (const name of FEATURE_NAMES) sum += (weights[name] ?? 0) * (features[name] - (reference ? reference[name] : 0.5));
  return Math.max(-max, Math.min(max, sum));
}

/** Moyenne de chaque critère sur un ensemble de photos. */
export function meanFeatures(list: readonly Features[]): Features {
  const out = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Features;
  if (list.length === 0) return Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0.5])) as Features;
  for (const f of list) for (const name of FEATURE_NAMES) out[name] += f[name] / list.length;
  return out;
}

export interface Preference {
  preferred: ChoiceRecord;
  other: ChoiceRecord;
}

/** Paires « gardée par l'utilisateur » contre « supprimée par l'utilisateur », dans un même paquet. */
export function preferencePairs(records: readonly ChoiceRecord[]): Preference[] {
  const byPack = new Map<string, ChoiceRecord[]>();
  for (const record of records) {
    const list = byPack.get(record.packKey) ?? [];
    list.push(record);
    byPack.set(record.packKey, list);
  }
  const pairs: Preference[] = [];
  for (const list of byPack.values()) {
    const kept = list.filter((r) => r.choice === 'garder');
    const removed = list.filter((r) => r.choice === 'supprimer');
    for (const preferred of kept) for (const other of removed) pairs.push({ preferred, other });
  }
  return pairs;
}

/** Poids appris à partir de tous les choix enregistrés (recalculés entièrement à chaque fois : résultat stable). */
export function learnWeights(records: readonly ChoiceRecord[]): LearnedWeights {
  const cfg = config.learning;
  const pairs = preferencePairs(records);
  const weights: Record<string, number> = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0]));
  if (pairs.length === 0) return {};

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    const grad: Record<string, number> = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0]));
    for (const { preferred, other } of pairs) {
      let z = preferred.baseScore - other.baseScore;
      for (const name of FEATURE_NAMES) z += weights[name]! * (preferred.features[name] - other.features[name]);
      // Probabilité que l'app classe comme l'utilisateur ; on corrige d'autant plus qu'elle se trompe.
      const miss = 1 / (1 + Math.exp(cfg.scale * z));
      for (const name of FEATURE_NAMES) grad[name]! += miss * cfg.scale * (preferred.features[name] - other.features[name]);
    }
    for (const name of FEATURE_NAMES) {
      const step = cfg.rate * (grad[name]! / pairs.length - cfg.regularization * weights[name]!);
      weights[name] = Math.max(-cfg.maxWeight, Math.min(cfg.maxWeight, weights[name]! + step / cfg.scale));
    }
  }
  const result: LearnedWeights = {};
  for (const name of FEATURE_NAMES) if (Math.abs(weights[name]!) >= 0.005) result[name] = weights[name]!;
  return result;
}
