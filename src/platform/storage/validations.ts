// Journal des poses validées dans le tri éclair (IndexedDB, sur l'iPhone seulement). Quelques centaines d'octets par
// pose : noms de fichiers, choix, durée ; jamais d'image.

import type { PoseValidation } from '../../engine';
import { runStore, STORES } from './db';

export async function loadValidations(): Promise<PoseValidation[]> {
  try {
    const all = (await runStore(STORES.validations, 'readonly', (store) => store.getAll())) as PoseValidation[];
    return all.sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export async function saveValidation(v: PoseValidation): Promise<void> {
  try {
    await runStore(STORES.validations, 'readwrite', (store) => store.put(v));
  } catch {
    // Au pire, la justesse affichée ignore cette pose.
  }
}

export async function clearValidations(): Promise<void> {
  try {
    await runStore(STORES.validations, 'readwrite', (store) => store.clear());
  } catch {
    // Rien à effacer.
  }
}
