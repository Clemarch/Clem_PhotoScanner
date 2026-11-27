// Prochain tri sans albums (27/11, point 70) : l'app sait quelles périodes ses séances ont couvertes (première et
// dernière photo de chacune) ; les périodes non couvertes sont celles qui restent à trier. Moteur pur.

export interface Span {
  start: number;
  end: number;
}

/**
 * Périodes pas encore couvertes par une séance, la plus récente d'abord. `now` ferme la plus récente ; avant la première
 * séance, la période n'a pas de début (start = -Infinity). Les trous plus courts que `minGapMs` sont ignorés (deux
 * séances qui se suivent laissent souvent quelques minutes sans photo).
 */
export function uncovered(covered: readonly Span[], now: number, minGapMs = 10 * 60 * 1000): Span[] {
  const spans = covered.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start).sort((a, b) => a.start - b.start);
  if (spans.length === 0) return [{ start: -Infinity, end: now }];
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end + minGapMs) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const gaps: Span[] = [];
  if (now - merged[merged.length - 1]!.end > minGapMs) gaps.push({ start: merged[merged.length - 1]!.end, end: now });
  for (let i = merged.length - 1; i > 0; i--) gaps.push({ start: merged[i - 1]!.end, end: merged[i]!.start });
  gaps.push({ start: -Infinity, end: merged[0]!.start });
  return gaps;
}
