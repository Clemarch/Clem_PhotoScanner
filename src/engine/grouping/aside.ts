// Fichiers mis de côté : jamais proposés à la suppression, ni comparés aux photos de la journée.

import { config } from '../config';
import type { AsideKind, MediaItem } from '../types';

/**
 * RAW et vidéos (traités ailleurs), captures d'écran et images enregistrées (pas prises par un appareil photo),
 * photos d'un document ou d'un écran (reconnues par le classement de scène, sans visage).
 */
export function asideKind(item: MediaItem): AsideKind | null {
  if (item.isRaw) return 'raw';
  if (item.kind !== 'photo') return 'video';
  if (item.camera === false) return 'capture';
  const top = item.labels?.[0];
  const c = config.classifier;
  if (
    top &&
    top.score >= config.aside.documentScore &&
    (c.document.includes(top.index) || c.screen.includes(top.index)) &&
    (item.faces ?? []).length === 0
  )
    return 'document';
  return null;
}
