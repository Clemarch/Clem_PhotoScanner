// Base IndexedDB de l'app, sur l'iPhone seulement.
// Version 3 : choix de l'utilisateur, rapports de diagnostic, séance en cours (pour la reprendre si iOS ferme l'app).

const DB = 'photo-triage';
const VERSION = 3;
export const STORES = { choices: 'choix', reports: 'rapports', session: 'seance' } as const;

/** Dernier problème rencontré avec la base (affiché dans le rapport), ou null si tout va bien. */
export let lastDbError: string | null = null;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of Object.values(STORES))
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === STORES.choices ? 'key' : 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Une autre version de l'app veut mettre la base à jour : on libère la place au lieu de la bloquer.
      db.onversionchange = () => db.close();
      lastDbError = null;
      resolve(db);
    };
    request.onerror = () => {
      lastDbError = String(request.error?.message ?? request.error);
      reject(request.error);
    };
    // Mise à jour de la base bloquée par une autre fenêtre de l'app encore ouverte : on n'attend pas indéfiniment.
    request.onblocked = () => {
      lastDbError = 'base bloquée par une autre fenêtre de l’app';
      reject(new Error(lastDbError));
    };
  });
}

export async function runStore<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => {
        lastDbError = String(tx.error?.message ?? tx.error);
        reject(tx.error);
      };
      tx.onabort = () => {
        lastDbError = String(tx.error?.message ?? tx.error ?? 'transaction annulée');
        reject(tx.error);
      };
    });
  } finally {
    db.close();
  }
}
