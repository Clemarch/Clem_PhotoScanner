// Séances gardées sur l'iPhone : la séance en cours (reprise si iOS ferme l'app en arrière-plan) et toutes les séances
// précédentes, qu'on peut rouvrir (utilisateur, 20/11). On garde les mesures, les vignettes et les aperçus, jamais les
// photos d'origine (seulement leurs versions réduites, comme à l'écran).
//
// Dans le magasin « seance » :
// - `s:<id>` : la séance complète (mesures, vignettes, aperçus, réglages) ;
// - `i:<id>` : son résumé (dates, nombre de photos, terminée ou non), léger, pour la liste des séances ;
// - `courante` : l'identifiant de la séance ouverte.
// Avant le 20/11, `courante` contenait la séance elle-même et `reglages` ses réglages : repris à la première lecture.

import type { AnalyzeResult } from '../image/types';
import { runStore, STORES } from './db';

export interface SavedSessionMeta {
  totalMs: number;
  cancelled: boolean;
  wakeLock: boolean;
  wakeLockInfo: string;
  heapBeforeMB: number | null;
  heapAfterMB: number | null;
  device: unknown;
  faceError: string | null;
  /** « Nouvel œil » : raison s'il n'a pas pu tourner (absent des séances d'avant le 21/11). */
  eyeInfo?: string | null;
}

export interface SessionSettings {
  gap: number;
  joined: string[];
}

export interface SavedSession {
  sessionId: string;
  savedAt: number;
  results: Omit<AnalyzeResult, 'frame'>[];
  meta: SavedSessionMeta;
  settings: SessionSettings | null;
}

/** Résumé d'une séance, pour la liste des séances. */
export interface SessionSummary {
  sessionId: string;
  savedAt: number;
  photos: number;
  firstAt: number | null;
  lastAt: number | null;
  /** Date de clôture (tout est parti à la suppression), ou null si la séance est en cours. */
  closedAt: number | null;
}

interface FullRecord extends SavedSession {
  id: string;
}
interface SummaryRecord extends SessionSummary {
  id: string;
}

/** Au-delà, une séance non terminée n'est plus reprise d'elle-même au lancement (elle reste dans la liste). */
const MAX_AGE_MS = 14 * 86_400_000;

const full = (sessionId: string) => `s:${sessionId}`;
const info = (sessionId: string) => `i:${sessionId}`;

const get = async <T,>(key: string): Promise<T | undefined> =>
  (await runStore(STORES.session, 'readonly', (store) => store.get(key))) as T | undefined;
const put = (value: object) => runStore(STORES.session, 'readwrite', (store) => store.put(value));

function summarize(sessionId: string, savedAt: number, results: readonly Omit<AnalyzeResult, 'frame'>[], closedAt: number | null): SummaryRecord {
  const dates = results.map((r) => r.item.capturedAt).filter((t): t is number => t !== null);
  return {
    id: info(sessionId),
    sessionId,
    savedAt,
    photos: results.length,
    firstAt: dates.length ? Math.min(...dates) : null,
    lastAt: dates.length ? Math.max(...dates) : null,
    closedAt,
  };
}

/** Ancien format (avant le 20/11) : une seule séance dans `courante`, réglages dans `reglages`. */
async function migrate(): Promise<void> {
  const old = await get<{ id: string; sessionId?: string; savedAt?: number; results?: unknown; meta?: SavedSessionMeta }>('courante');
  if (!old || !Array.isArray(old.results) || !old.sessionId) return;
  const settings = await get<{ sessionId: string; gap: number; joined: string[] }>('reglages');
  const results = old.results as Omit<AnalyzeResult, 'frame'>[];
  const record: FullRecord = {
    id: full(old.sessionId),
    sessionId: old.sessionId,
    savedAt: old.savedAt ?? Date.now(),
    results,
    meta: old.meta!,
    settings: settings && settings.sessionId === old.sessionId ? { gap: settings.gap, joined: settings.joined } : null,
  };
  await put(record);
  await put(summarize(old.sessionId, record.savedAt, results, null));
  await put({ id: 'courante', sessionId: old.sessionId, at: record.savedAt });
  await runStore(STORES.session, 'readwrite', (store) => store.delete('reglages'));
}

// Une seule reprise de l'ancien format à la fois : `loadSession` et `listSessions` partent ensemble au lancement.
let migration: Promise<void> | null = null;
const migrateOnce = (): Promise<void> =>
  (migration ??= migrate().catch((error: unknown) => {
    migration = null;
    throw error;
  }));

/** Enregistre une nouvelle séance et en fait la séance ouverte. */
export async function saveSession(sessionId: string, results: readonly AnalyzeResult[], meta: SavedSessionMeta): Promise<boolean> {
  const kept = results.map(({ item, thumbnail, preview, diagnostic }) => ({ item, thumbnail, preview, diagnostic }));
  const savedAt = Date.now();
  try {
    await put({ id: full(sessionId), sessionId, savedAt, results: kept, meta, settings: null } satisfies FullRecord);
    await put(summarize(sessionId, savedAt, kept, null));
    await put({ id: 'courante', sessionId, at: savedAt });
    return true;
  } catch {
    return false;
  }
}

/**
 * Complète les mesures d'une séance déjà gardée (nouvel œil en arrière-plan), sans toucher à ses réglages, à son
 * résumé (terminée ou non) ni à la séance ouverte. Ne fait rien si la séance a été effacée entre-temps.
 */
export async function updateSessionMeasures(sessionId: string, results: readonly AnalyzeResult[], meta: SavedSessionMeta): Promise<void> {
  try {
    const record = await get<FullRecord>(full(sessionId));
    if (!record) return;
    const kept = results.map(({ item, thumbnail, preview, diagnostic }) => ({ item, thumbnail, preview, diagnostic }));
    await put({ ...record, results: kept, meta } satisfies FullRecord);
  } catch {
    // Facultatif : au pire, les mesures du nouvel œil manquent à la reprise.
  }
}

export async function saveSessionSettings(sessionId: string, settings: SessionSettings): Promise<void> {
  try {
    const record = await get<FullRecord>(full(sessionId));
    if (record) await put({ ...record, settings });
  } catch {
    // Facultatif.
  }
}

/** Séance ouverte au dernier lancement, si elle n'est pas terminée. */
export async function loadSession(): Promise<SavedSession | null> {
  try {
    await migrateOnce();
    const pointer = await get<{ sessionId: string; at?: number }>('courante');
    if (!pointer?.sessionId || Date.now() - (pointer.at ?? 0) > MAX_AGE_MS) return null;
    const summary = await get<SummaryRecord>(info(pointer.sessionId));
    if (summary?.closedAt) return null;
    return await loadSessionById(pointer.sessionId);
  } catch {
    return null;
  }
}

export async function loadSessionById(sessionId: string): Promise<SavedSession | null> {
  try {
    const record = await get<FullRecord>(full(sessionId));
    return record && Array.isArray(record.results) ? record : null;
  } catch {
    return null;
  }
}

/** Toutes les séances gardées, la plus récente d'abord. */
export async function listSessions(): Promise<SessionSummary[]> {
  try {
    await migrateOnce();
    // Seulement les résumés (`i:…`) : les séances complètes, avec leurs vignettes et aperçus, restent sur le disque.
    const all = (await runStore(STORES.session, 'readonly', (store) => store.getAll(IDBKeyRange.bound('i:', 'i:\uffff')))) as SummaryRecord[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Séance terminée (tout est parti à la suppression) ou rouverte. */
export async function setSessionClosed(sessionId: string, closed: boolean): Promise<void> {
  try {
    const summary = await get<SummaryRecord>(info(sessionId));
    if (summary) await put({ ...summary, closedAt: closed ? Date.now() : null });
    if (closed) {
      const pointer = await get<{ sessionId: string }>('courante');
      if (pointer?.sessionId === sessionId) await runStore(STORES.session, 'readwrite', (store) => store.delete('courante'));
    } else await put({ id: 'courante', sessionId, at: Date.now() });
  } catch {
    // Facultatif : au pire la séance se rouvre au prochain lancement.
  }
}

/** Plus de séance ouverte (nouvelle analyse en cours) : rien ne sera repris au lancement tant qu'elle n'est pas gardée. */
export async function forgetCurrentSession(): Promise<void> {
  try {
    await runStore(STORES.session, 'readwrite', (store) => store.delete('courante'));
  } catch {
    // Facultatif.
  }
}

/** Efface une séance gardée (vignettes et aperçus compris). */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await runStore(STORES.session, 'readwrite', (store) => store.delete(full(sessionId)));
    await runStore(STORES.session, 'readwrite', (store) => store.delete(info(sessionId)));
    const pointer = await get<{ sessionId: string }>('courante');
    if (pointer?.sessionId === sessionId) await runStore(STORES.session, 'readwrite', (store) => store.delete('courante'));
  } catch {
    // Rien à effacer.
  }
}
