import type { DayAnalysis } from '../engine';
import type { ViewerEntry } from './screens/Visionneuse';

/** Toutes les photos de la journée dans l'ordre, pour feuilleter d'un paquet à l'autre. */
export function dayEntries(day: DayAnalysis): ViewerEntry[] {
  return [
    ...day.packs.flatMap((pack, i) => pack.pack.items.map((item) => ({ item, pack, packNumber: i + 1 }))),
    ...day.undated.map((item) => ({ item, pack: null, packNumber: null })),
  ];
}
