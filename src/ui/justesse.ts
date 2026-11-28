import { accuracy, type Accuracy, type PoseValidation } from '../engine';

/**
 * Justesse de l'app (poses validées dans le tri éclair) : depuis le début, et sur la dernière séance triée. Le total
 * bouge peu d'une séance à l'autre (utilisateur, 28/11 : « l'encadré a l'air figé ») : la dernière séance montre le
 * progrès. Séances hors statistiques écartées.
 */
export function justesse(validations: readonly PoseValidation[], excluded: ReadonlySet<string>): { all: Accuracy; last: Accuracy | null } {
  const counted = validations.filter((v) => !excluded.has(v.sessionId));
  const all = accuracy(counted);
  let latest: PoseValidation | null = null;
  for (const v of counted) if (!latest || v.at > latest.at) latest = v;
  const last = latest ? accuracy(counted.filter((v) => v.sessionId === latest.sessionId)) : null;
  // Une seule séance : la dernière est le total, inutile de la répéter.
  const several = counted.some((v) => v.sessionId !== latest?.sessionId);
  return { all, last: several && last && last.photos.total > 0 ? last : null };
}

export const pct = (a: { right: number; total: number }): number => (a.total ? Math.round((a.right / a.total) * 100) : 0);
