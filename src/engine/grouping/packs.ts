import type { DayGrouping, MediaItem, Pack } from '../types';
import { asideKind } from './aside';
import { config } from '../config';
import { embeddingSimilarity } from '../analysis/embedding';

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/** Ordre de la journée : par date, puis par nom de fichier (IMG_2 avant IMG_10). */
export function sortChronologically(items: readonly MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => {
    const da = a.capturedAt ?? Number.POSITIVE_INFINITY;
    const db = b.capturedAt ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return collator.compare(a.fileName, b.fileName);
  });
}

/**
 * Découpe une journée en paquets.
 * - Par le temps (`byContent` faux) : nouveau paquet dès que l'écart avec la photo précédente dépasse `packGapSeconds`.
 * - Selon le contenu (`byContent` vrai) : une photo reste dans le paquet en cours si elle ressemble à l'une de ses
 *   dernières photos, ou si elle suit de très près (rafale). Sans empreinte, on revient à l'écart de temps.
 */
export function groupIntoPacks(items: readonly MediaItem[], packGapSeconds: number, byContent = false): DayGrouping {
  const setAside: MediaItem[] = [];
  const undated: MediaItem[] = [];
  const dated: MediaItem[] = [];

  for (const item of sortChronologically(items)) {
    if (asideKind(item) !== null) setAside.push(item);
    else if (item.capturedAt === null) undated.push(item);
    else dated.push(item);
  }

  const gapMs = packGapSeconds * 1000;
  const packs: Pack[] = [];
  let current: MediaItem[] = [];
  const flush = () => {
    if (current.length === 0) return;
    packs.push({
      id: `paquet-${packs.length + 1}`,
      items: current,
      startAt: current[0]!.capturedAt,
      endAt: current[current.length - 1]!.capturedAt,
    });
    current = [];
  };

  const c = config.grouping.byContent;
  const together = (item: MediaItem, previous: MediaItem): boolean => {
    const gap = item.capturedAt! - previous.capturedAt!;
    if (!byContent) return gap <= gapMs;
    if (gap <= c.burstSeconds * 1000) return true;
    const sims = current
      .slice(-c.compareLast)
      .map((other) => embeddingSimilarity(item.embedding, other.embedding))
      .filter((s): s is number => s !== null);
    if (sims.length === 0) return gap <= gapMs;
    return gap <= c.maxGapSeconds * 1000 && Math.max(...sims) >= c.similar;
  };

  for (const item of dated) {
    const previous = current[current.length - 1];
    if (previous && !together(item, previous)) flush();
    current.push(item);
  }
  flush();

  const dayIndex = new Map<string, number>();
  [...dated, ...undated].forEach((item, i) => dayIndex.set(item.id, i + 1));

  return { packs, undated, setAside, dayIndex };
}
