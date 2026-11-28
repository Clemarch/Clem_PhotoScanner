import type { DayGrouping, MediaItem, Pack } from '../types';
import { asideKind } from './aside';
import { config } from '../config';
import { embeddingSimilarity } from '../analysis/embedding';
import { mainFaces } from '../analysis/faces';

/**
 * Personnes au premier plan : visages principaux (assez grands à côté du plus grand). Visages non cherchés : personnes
 * repérées par le détecteur d'objets, assez grandes ; null si rien n'est connu.
 */
function foreground(item: MediaItem): number | null {
  if (item.faces !== null) return mainFaces(item.faces).length;
  if (!item.objects) return null;
  const c = config.grouping.byContent;
  return item.objects.filter((o) => o.label === 'person' && o.score >= config.poses.personMinScore && o.box.width * o.box.height >= c.personMinArea).length;
}

/** Changement d'objectif (grand-angle, 1x, zoom) entre deux photos : focales équivalentes trop différentes. */
export function zoomChanged(a: MediaItem, b: MediaItem): boolean {
  if (!a.focal35 || !b.focal35) return false;
  return Math.max(a.focal35, b.focal35) / Math.min(a.focal35, b.focal35) >= config.grouping.byContent.zoomRatio;
}

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
    const sims = current
      .slice(-c.compareLast)
      .map((other) => embeddingSimilarity(item.embedding, other.embedding))
      .filter((s): s is number => s !== null);
    const best = sims.length ? Math.max(...sims) : null;
    // Une personne seule après une photo de groupe (ou l'inverse) : autre photo, autre paquet (utilisateur, 20/11),
    // sauf si la scène est presque identique. Seules comptent les personnes au premier plan (28/11 : « le problème
    // réside dans les personnes de 1er plan »), c'est-à-dire les visages principaux, pas les passants derrière.
    const solo = (it: MediaItem) => foreground(it) === 1;
    const group = (it: MediaItem) => (foreground(it) ?? 0) >= 2;
    if (((solo(item) && group(previous)) || (group(item) && solo(previous))) && (best === null || best < c.sameScene)) return false;
    if (gap <= c.burstSeconds * 1000) {
      if (best === null) return true;
      // Quelques secondes d'écart, ou un autre objectif : la même scène peut beaucoup changer d'aspect (28/11).
      if (gap <= c.closeSeconds * 1000 && best >= c.closeMinSimilar) return true;
      if (zoomChanged(item, previous) && best >= c.zoomMinSimilar) return true;
      // Rafale : ensemble même si le cadrage change beaucoup, sauf scène sans rapport (selfie puis portrait, 20/11 : 0,21).
      return best >= c.burstMinSimilar;
    }
    if (best === null) return gap <= gapMs;
    return gap <= c.maxGapSeconds * 1000 && best >= c.similar;
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
