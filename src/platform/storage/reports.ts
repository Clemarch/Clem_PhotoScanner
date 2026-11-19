// Rapports de diagnostic conservés sur l'iPhone (texte seulement, jamais d'image) : les 10 derniers, 30 jours au plus.
// Ils permettent de renvoyer plusieurs analyses à Claude d'un coup, ou de rattraper un rapport oublié.

import { runStore, STORES } from './db';

export interface SavedReport {
  /** Identifiant de l'analyse (heure de son lancement). */
  id: string;
  /** Dernière mise à jour (les choix faits après l'analyse y sont repris). */
  at: number;
  /** Résumé lisible : date de la journée, nombre de photos, de choix. */
  title: string;
  text: string;
}

export const REPORTS_KEPT = 10;
export const REPORTS_MAX_DAYS = 30;

const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  runStore(STORES.reports, mode, action);

const memory = new Map<string, SavedReport>();

export async function loadReports(): Promise<SavedReport[]> {
  let list: SavedReport[];
  try {
    list = await run('readonly', (store) => store.getAll() as IDBRequest<SavedReport[]>);
  } catch {
    list = [...memory.values()];
  }
  return list.sort((a, b) => b.at - a.at);
}

/** Enregistre (ou met à jour) un rapport, puis ne garde que les plus récents. */
export async function saveReport(report: SavedReport): Promise<void> {
  memory.set(report.id, report);
  try {
    await run('readwrite', (store) => store.put(report));
    const list = await loadReports();
    const tooOld = Date.now() - REPORTS_MAX_DAYS * 86_400_000;
    const drop = list.filter((r, i) => i >= REPORTS_KEPT || r.at < tooOld);
    for (const r of drop) {
      memory.delete(r.id);
      await run('readwrite', (store) => store.delete(r.id));
    }
  } catch {
    // Mémoire seulement.
  }
}

export async function clearReports(): Promise<void> {
  memory.clear();
  try {
    await run('readwrite', (store) => store.clear());
  } catch {
    // Mémoire seulement.
  }
}
