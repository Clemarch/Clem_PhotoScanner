// Photos reliées à la main à une pose (28/11, point 76) : « Relier à une pose » dans l'écran « Photos seules ».
// Gardées sur l'iPhone (quelques lignes de texte, jamais d'image) et dans la sauvegarde des goûts. Un lien vaut pour
// toutes les séances qui contiennent la photo.

import type { PoseLink } from '../../engine';

const KEY = 'photo-triage.liens';
/** Prévenir l'app qu'une sauvegarde restaurée a apporté des liens. */
export const LINKS_EVENT = 'photo-triage:liens';

export function loadLinks(): PoseLink[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as PoseLink[];
    return Array.isArray(list) ? list.filter((l) => typeof l.from === 'string' && typeof l.to === 'string') : [];
  } catch {
    return [];
  }
}

export function saveLinks(links: readonly PoseLink[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(links));
  } catch {
    // Mémoire seulement.
  }
}

/** Ajoute des liens (sauvegarde restaurée) : pour une même photo, le plus récent l'emporte. */
export function mergeLinks(incoming: readonly PoseLink[]): number {
  if (incoming.length === 0) return 0;
  const byFrom = new Map(loadLinks().map((l) => [l.from, l]));
  let added = 0;
  for (const l of incoming) {
    const existing = byFrom.get(l.from);
    if (!existing || l.at > existing.at) {
      byFrom.set(l.from, l);
      added++;
    }
  }
  saveLinks([...byFrom.values()]);
  window.dispatchEvent(new Event(LINKS_EVENT));
  return added;
}
