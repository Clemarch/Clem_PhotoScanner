// Base IndexedDB de l'app, sur l'iPhone seulement. Version 2 : choix de l'utilisateur, et rapports de diagnostic.

const DB = 'photo-triage';
export const STORES = { choices: 'choix', reports: 'rapports' } as const;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of Object.values(STORES))
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === STORES.choices ? 'key' : 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
