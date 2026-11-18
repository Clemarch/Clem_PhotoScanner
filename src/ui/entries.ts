import { asideKind, type DayAnalysis } from '../engine';
import type { ViewerEntry } from './screens/Visionneuse';

/** Toutes les photos de la journée dans l'ordre, pour feuilleter d'un paquet à l'autre.
 *  `shown` : identifiants des fichiers mis de côté qui ont une image à montrer (captures, documents). */
export function dayEntries(day: DayAnalysis, shown: ReadonlySet<string> = new Set()): ViewerEntry[] {
  return [
    ...day.packs.flatMap((pack, i) => pack.pack.items.map((item) => ({ item, pack, packNumber: i + 1 }))),
    ...day.undated.map((item) => ({ item, pack: null, packNumber: null })),
    ...day.setAside
      .filter((item) => shown.has(item.id))
      .map((item) => ({ item, pack: null, packNumber: null, aside: asideKind(item) ?? undefined })),
  ];
}
