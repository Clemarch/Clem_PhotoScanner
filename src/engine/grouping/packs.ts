import type { DayGrouping, MediaItem, Pack } from '../types';
import { asideKind } from './aside';

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
 * Découpe une journée en paquets : on ouvre un nouveau paquet dès que
 * l'écart avec la photo précédente dépasse `packGapSeconds`.
 */
export function groupIntoPacks(items: readonly MediaItem[], packGapSeconds: number): DayGrouping {
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

  for (const item of dated) {
    const previous = current[current.length - 1];
    if (previous && item.capturedAt! - previous.capturedAt! > gapMs) flush();
    current.push(item);
  }
  flush();

  const dayIndex = new Map<string, number>();
  [...dated, ...undated].forEach((item, i) => dayIndex.set(item.id, i + 1));

  return { packs, undated, setAside, dayIndex };
}
