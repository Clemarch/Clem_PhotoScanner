// Choix de l'utilisateur (garder / supprimer), enregistrés sur l'appareil dans IndexedDB.
// Seules des mesures chiffrées sont enregistrées, jamais d'image. Rien ne quitte l'iPhone.

import type { ChoiceRecord } from '../../engine';

const DB = 'photo-triage';
const STORE = 'choix';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Si IndexedDB est indisponible (navigation privée…), les choix restent en mémoire le temps de la session.
const memory = new Map<string, ChoiceRecord>();

export async function loadChoices(): Promise<ChoiceRecord[]> {
  try {
    return await run('readonly', (store) => store.getAll() as IDBRequest<ChoiceRecord[]>);
  } catch {
    return [...memory.values()];
  }
}

export async function saveChoice(record: ChoiceRecord): Promise<void> {
  memory.set(record.key, record);
  try {
    await run('readwrite', (store) => store.put(record));
  } catch {
    // Mémoire seulement.
  }
}

export async function removeChoice(key: string): Promise<void> {
  memory.delete(key);
  try {
    await run('readwrite', (store) => store.delete(key));
  } catch {
    // Mémoire seulement.
  }
}

export async function clearChoices(): Promise<void> {
  memory.clear();
  try {
    await run('readwrite', (store) => store.clear());
  } catch {
    // Mémoire seulement.
  }
}
