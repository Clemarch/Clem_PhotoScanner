// Séance en cours, gardée sur l'iPhone : si iOS ferme l'app en arrière-plan (pour libérer de la mémoire), la séance
// est reprise au retour au lieu de repartir de zéro. On garde les mesures, les vignettes et les aperçus, jamais les
// photos d'origine (seulement leurs versions réduites, comme à l'écran).

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
}

export interface SavedSession {
  id: 'courante';
  sessionId: string;
  savedAt: number;
  results: Omit<AnalyzeResult, 'frame'>[];
  meta: SavedSessionMeta;
}

export interface SessionSettings {
  id: 'reglages';
  sessionId: string;
  gap: number;
  joined: string[];
  /** Paquets découpés selon le contenu (absent avant le 19/11 : vrai par défaut). */
  byContent?: boolean;
}

/** Au-delà, une séance gardée n'est plus reprise d'elle-même. */
const MAX_AGE_MS = 14 * 86_400_000;

export async function saveSession(sessionId: string, results: readonly AnalyzeResult[], meta: SavedSessionMeta): Promise<boolean> {
  const record: SavedSession = {
    id: 'courante',
    sessionId,
    savedAt: Date.now(),
    results: results.map(({ item, thumbnail, preview, diagnostic }) => ({ item, thumbnail, preview, diagnostic })),
    meta,
  };
  try {
    await runStore(STORES.session, 'readwrite', (store) => store.put(record));
    return true;
  } catch {
    return false;
  }
}

export async function saveSessionSettings(settings: Omit<SessionSettings, 'id'>): Promise<void> {
  try {
    await runStore(STORES.session, 'readwrite', (store) => store.put({ id: 'reglages', ...settings }));
  } catch {
    // Facultatif.
  }
}

export async function loadSession(): Promise<{ session: SavedSession; settings: SessionSettings | null } | null> {
  try {
    const session = (await runStore(STORES.session, 'readonly', (store) => store.get('courante'))) as SavedSession | undefined;
    if (!session || !Array.isArray(session.results) || Date.now() - session.savedAt > MAX_AGE_MS) return null;
    const settings = (await runStore(STORES.session, 'readonly', (store) => store.get('reglages'))) as SessionSettings | undefined;
    return { session, settings: settings && settings.sessionId === session.sessionId ? settings : null };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await runStore(STORES.session, 'readwrite', (store) => store.clear());
  } catch {
    // Rien à effacer.
  }
}
