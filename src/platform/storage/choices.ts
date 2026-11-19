// Choix de l'utilisateur (garder / supprimer), enregistrés sur l'appareil dans IndexedDB.
// Seules des mesures chiffrées sont enregistrées, jamais d'image. Rien ne quitte l'iPhone.
// Copie de secours dans le stockage local du navigateur (sans les empreintes, plus lourdes) : si la base IndexedDB
// est perdue ou illisible, les choix sont retrouvés au lancement suivant.

import { decodeBackup, encodeBackup, mergeChoices, type ChoiceRecord } from '../../engine';
import { runStore, STORES } from './db';

const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  runStore(STORES.choices, mode, action);

const MIRROR_KEY = 'photo-triage.choix-secours';

// Si IndexedDB est indisponible (navigation privée…), les choix restent en mémoire le temps de la session.
const memory = new Map<string, ChoiceRecord>();

/** État du stockage des choix, pour le rapport. */
export const choiceStorage = { database: 'non vérifiée' as 'ok' | 'erreur' | 'non vérifiée', recoveredFromMirror: 0 };

function writeMirror(): void {
  try {
    const rows = [...memory.values()].map((r) => ({ ...r, embedding: undefined }));
    localStorage.setItem(MIRROR_KEY, JSON.stringify(encodeBackup(rows, Date.now())));
  } catch {
    // Copie de secours facultative (stockage plein ou indisponible).
  }
}

function readMirror(): ChoiceRecord[] {
  try {
    const text = localStorage.getItem(MIRROR_KEY);
    return text ? decodeBackup(JSON.parse(text)).records : [];
  } catch {
    return [];
  }
}

export async function loadChoices(): Promise<ChoiceRecord[]> {
  let stored: ChoiceRecord[] = [];
  try {
    stored = await run('readonly', (store) => store.getAll() as IDBRequest<ChoiceRecord[]>);
    choiceStorage.database = 'ok';
  } catch {
    choiceStorage.database = 'erreur';
  }
  // Choix présents dans la copie de secours mais plus dans la base : on les reprend, et on les réécrit dans la base.
  const { merged } = mergeChoices(stored, readMirror());
  const known = new Set(stored.map((r) => r.key));
  const recovered = merged.filter((r) => !known.has(r.key));
  choiceStorage.recoveredFromMirror = recovered.length;
  for (const r of merged) memory.set(r.key, r);
  for (const r of recovered) {
    try {
      await run('readwrite', (store) => store.put(r));
    } catch {
      // La base reste indisponible : les choix restent en mémoire et dans la copie de secours.
    }
  }
  writeMirror();
  return [...memory.values()];
}

export async function saveChoice(record: ChoiceRecord): Promise<void> {
  memory.set(record.key, record);
  writeMirror();
  try {
    await run('readwrite', (store) => store.put(record));
  } catch {
    choiceStorage.database = 'erreur';
  }
}

export async function removeChoice(key: string): Promise<void> {
  memory.delete(key);
  writeMirror();
  try {
    await run('readwrite', (store) => store.delete(key));
  } catch {
    choiceStorage.database = 'erreur';
  }
}

export async function clearChoices(): Promise<void> {
  memory.clear();
  writeMirror();
  try {
    await run('readwrite', (store) => store.clear());
  } catch {
    choiceStorage.database = 'erreur';
  }
}
