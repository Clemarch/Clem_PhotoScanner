// Mesure honnête de l'accord entre l'app et l'utilisateur.
// L'accord « brut » est gonflé : les goûts appris l'ont été sur les choix mêmes qu'on compare. Ici, pour chaque
// paquet, on réapprend les goûts SANS les choix de ce paquet, puis on compare la décision obtenue au choix fait.
// On simule aussi l'effet des goûts appris sur l'image (empreinte), sans les appliquer pour de vrai.

import { config } from './config';
import { learnWeights } from './learning/preferences';
import { tasteMemory, tasteVote } from './learning/taste';
import { photoKey, type DayAnalysis } from './pipeline';
import { scorePackDetailed } from './scoring/pack';
import { selectPack } from './selection/select';
import type { ChoiceRecord, Decision, PhotoScore } from './types';

export interface Agreement {
  /** Photos de la séance sur lesquelles l'utilisateur a fait un choix. */
  total: number;
  /** Décision affichée par l'app (goûts appris avec tous les choix, donc gonflée). */
  raw: number;
  /** Goûts appris sans les choix du paquet évalué. */
  honest: number;
  /** Comme « honest », plus le vote des goûts par l'image ; null s'il y a trop peu de choix avec empreinte. */
  withTaste: number | null;
  /** Choix enregistrés avec empreinte. */
  tasteChoices: number;
}

const agrees = (decision: Decision | undefined, record: ChoiceRecord): boolean =>
  (decision?.keep ?? true) === (record.choice === 'garder');

export function evaluateDay(day: DayAnalysis, records: readonly ChoiceRecord[]): Agreement {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const memory = tasteMemory(records);
  const useTaste = memory.items.length >= config.taste.minChoices;
  const out: Agreement = { total: 0, raw: 0, honest: 0, withTaste: useTaste ? 0 : null, tasteChoices: memory.items.length };

  for (const pack of day.packs) {
    const keys = new Set(pack.pack.items.map(photoKey));
    const chosen = pack.pack.items.filter((it) => byKey.has(photoKey(it)));
    if (chosen.length === 0) continue;

    // Choix de ce paquet écartés : ni pour les goûts appris, ni pour les voisins de l'image.
    const others = records.filter((r) => !keys.has(r.key) && r.packKey !== pack.key);
    const packKeys = new Set([pack.key, ...records.filter((r) => keys.has(r.key)).map((r) => r.packKey)]);
    const groups = pack.poses.map((p) => p.items);
    const { scores } = scorePackDetailed(pack.pack.items, learnWeights(others), groups);
    const honest = selectPack(pack.pack.items, scores, pack.poses);

    let tasted: Map<string, Decision> | null = null;
    if (useTaste) {
      // Vote de chaque photo, centré sur la moyenne de sa pose : seul l'écart entre photos semblables compte.
      const adjusted = new Map<string, PhotoScore>();
      for (const pose of pack.poses) {
        const votes = pose.items.map((it) => tasteVote(it.embedding, memory, packKeys));
        const mean = votes.reduce((a, b) => a + b, 0) / Math.max(1, votes.length);
        pose.items.forEach((it, i) => {
          const s = scores.get(it.id)!;
          adjusted.set(it.id, { ...s, score: s.score + config.taste.weight * (votes[i]! - mean) });
        });
      }
      tasted = selectPack(pack.pack.items, adjusted, pack.poses);
    }

    for (const it of chosen) {
      const record = byKey.get(photoKey(it))!;
      out.total++;
      if (agrees(pack.decisions.get(it.id), record)) out.raw++;
      if (agrees(honest.get(it.id), record)) out.honest++;
      if (tasted && agrees(tasted.get(it.id), record)) out.withTaste!++;
    }
  }
  return out;
}
