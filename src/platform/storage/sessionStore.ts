// Séances gardées sur l'iPhone : la séance en cours (reprise si iOS ferme l'app en arrière-plan) et toutes les séances
// précédentes, qu'on peut rouvrir (utilisateur, 20/11). On garde les mesures, les vignettes et les aperçus, jamais les
// photos d'origine (seulement leurs versions réduites, comme à l'écran).
//
// Dans le magasin « seance » :
// - `s:<id>` : la séance complète (mesures, vignettes, aperçus, réglages) ;
// - `i:<id>` : son résumé (dates, nombre de photos, terminée ou non), léger, pour la liste des séances ;
// - `courante` : l'identifiant de la séance ouverte.
// - `m:<id>:<photo>` (depuis le 24/11) : vignette et aperçu d'une photo, en octets bruts.
// Avant le 20/11, `courante` contenait la séance elle-même et `reglages` ses réglages : repris à la première lecture.
//
// Pourquoi des octets et pas des « Blob » (24/11) : sur l'iPhone, un Blob relu dans IndexedDB après une fermeture de
// l'app devient souvent illisible (images vides « ? » à la reprise). Des octets bruts se relisent toujours.

import type { MediaItem } from '../../engine';
import type { AnalyzeResult } from '../image/types';
import { openDb, runStore, STORES } from './db';

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
  /** Photos reprises d'une analyse interrompue (non refaites). */
  resumed?: number;
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
  /** Vignettes et aperçus rangés à part, en octets (`m:…`). Absent : anciens Blob dans `results`. */
  imagesApart?: boolean;
}

/** Image gardée en octets bruts (relisible sur l'iPhone, contrairement à un Blob). */
interface StoredImage {
  type: string;
  bytes: ArrayBuffer;
}
interface ImageRecord {
  id: string;
  thumb: StoredImage | null;
  preview: StoredImage | null;
}

const toStored = async (blob: Blob | null | undefined): Promise<StoredImage | null> => {
  if (!blob) return null;
  try {
    return { type: blob.type || 'image/jpeg', bytes: await blob.arrayBuffer() };
  } catch {
    return null;
  }
};

/** Octets → Blob neuf (en mémoire). Un ancien Blob est relu en entier : s'il est devenu illisible, l'image manque. */
async function revive(value: unknown): Promise<Blob | null> {
  if (!value) return null;
  try {
    if (value instanceof Blob) {
      // Un Blob abîmé peut ne jamais répondre : au-delà de 3 s, l'image est tenue pour perdue (la reprise n'attend pas).
      const bytes = await Promise.race([value.arrayBuffer(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
      return bytes ? new Blob([bytes], { type: value.type || 'image/jpeg' }) : null;
    }
    const stored = value as StoredImage;
    if (stored.bytes instanceof ArrayBuffer) return new Blob([stored.bytes], { type: stored.type || 'image/jpeg' });
  } catch {
    // Illisible : l'image manque, l'utilisateur peut la retrouver en re-choisissant ses photos.
  }
  return null;
}

const imageKey = (sessionId: string, photoId: string) => `m:${sessionId}:${photoId}`;
const imageRange = (sessionId: string) => IDBKeyRange.bound(`m:${sessionId}:`, `m:${sessionId}:\uffff`);

/** Mesures sans images (rangées à part). */
const measuresOnly = (results: readonly Omit<AnalyzeResult, 'frame'>[]) =>
  results.map(({ item, diagnostic }) => ({ item, thumbnail: null, preview: null, diagnostic }));

/**
 * Range les vignettes et aperçus d'une séance, par petits lots (une transaction ne peut pas attendre la lecture d'un
 * Blob, et tout lire d'un coup chargerait la mémoire de l'iPhone).
 */
export async function saveSessionImages(sessionId: string, results: readonly Pick<AnalyzeResult, 'item' | 'thumbnail' | 'preview'>[]): Promise<boolean> {
  try {
    for (let i = 0; i < results.length; i += 12) {
      const batch: ImageRecord[] = [];
      for (const r of results.slice(i, i + 12)) {
        if (!r.thumbnail && !r.preview) continue;
        batch.push({ id: imageKey(sessionId, r.item.id), thumb: await toStored(r.thumbnail), preview: await toStored(r.preview) });
      }
      if (batch.length === 0) continue;
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORES.session, 'readwrite');
          const store = tx.objectStore(STORES.session);
          for (const record of batch) store.put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Relit les images d'une séance une à une (curseur), chacune changée tout de suite en Blob. */
async function loadImages(sessionId: string): Promise<Map<string, { thumb: Blob | null; preview: Blob | null }>> {
  const out = new Map<string, { thumb: Blob | null; preview: Blob | null }>();
  const prefix = `m:${sessionId}:`;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.session, 'readonly');
      const request = tx.objectStore(STORES.session).openCursor(imageRange(sessionId));
      const fromBytes = (s: StoredImage | null) => (s?.bytes instanceof ArrayBuffer ? new Blob([s.bytes], { type: s.type || 'image/jpeg' }) : null);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as ImageRecord;
        out.set(record.id.slice(prefix.length), { thumb: fromBytes(record.thumb), preview: fromBytes(record.preview) });
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return out;
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

/**
 * Lit et réécrit une séance complète dans une seule transaction : deux mises à jour proches (réglages, mesures du
 * nouvel œil) ne peuvent plus s'écraser l'une l'autre. Ne fait rien si la séance n'existe plus.
 */
async function updateFull(sessionId: string, change: (record: FullRecord) => FullRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.session, 'readwrite');
      const store = tx.objectStore(STORES.session);
      const request = store.get(full(sessionId));
      request.onsuccess = () => {
        const record = request.result as FullRecord | undefined;
        if (record) store.put(change(record));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

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
  const kept = measuresOnly(results);
  const savedAt = Date.now();
  try {
    // Images d'abord : la séance n'est pointée qu'une fois tout rangé.
    if (!(await saveSessionImages(sessionId, results))) return false;
    await put({ id: full(sessionId), sessionId, savedAt, results: kept, meta, settings: null, imagesApart: true } satisfies FullRecord);
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
    await updateFull(sessionId, (record) => {
      if (record.imagesApart) return { ...record, results: measuresOnly(results), meta };
      // Ancienne séance (images dans `results`) : on garde ses images telles quelles.
      const old = new Map(record.results.map((r) => [r.item.id, r]));
      const results2 = results.map(({ item, diagnostic }) => ({ item, diagnostic, thumbnail: old.get(item.id)?.thumbnail ?? null, preview: old.get(item.id)?.preview ?? null }));
      return { ...record, results: results2, meta };
    });
  } catch {
    // Facultatif : au pire, les mesures du nouvel œil manquent à la reprise.
  }
}

export async function saveSessionSettings(sessionId: string, settings: SessionSettings): Promise<void> {
  try {
    await updateFull(sessionId, (record) => ({ ...record, settings }));
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
    if (!record || !Array.isArray(record.results)) return null;
    if (record.imagesApart) {
      const images = await loadImages(sessionId).catch(() => new Map<string, { thumb: Blob | null; preview: Blob | null }>());
      const results = record.results.map((r) => ({ ...r, thumbnail: images.get(r.item.id)?.thumb ?? null, preview: images.get(r.item.id)?.preview ?? null }));
      return { ...record, results };
    }
    // Ancienne séance : chaque Blob est relu ; ceux qui se lisent encore sont rangés au nouveau format.
    // Par lots, en parallèle : une image qui ne répond pas ne retarde pas toutes les autres.
    const results: Omit<AnalyzeResult, 'frame'>[] = [];
    // Un premier lot entièrement illisible : les autres le sont aussi, on n'attend pas plus (reprise rapide).
    let readable = true;
    for (let i = 0; i < record.results.length; i += 20) {
      const batch = record.results.slice(i, i + 20);
      if (!readable) {
        results.push(...batch.map((r) => ({ ...r, thumbnail: null, preview: null })));
        continue;
      }
      const revived = await Promise.all(batch.map(async (r) => ({ ...r, thumbnail: await revive(r.thumbnail), preview: await revive(r.preview) })));
      readable = revived.some((r) => r.thumbnail || r.preview) || batch.every((r) => !r.thumbnail && !r.preview);
      results.push(...revived);
    }
    if (results.some((r) => r.thumbnail || r.preview)) void convertOld(sessionId, results);
    return { ...record, results };
  } catch {
    return null;
  }
}

/**
 * Range toutes les images d'une séance au format en octets (ancienne séance relue, ou images retrouvées en re-choisissant
 * les photos), puis les retire de la séance elle-même.
 */
export async function storeSessionImages(sessionId: string, results: readonly Omit<AnalyzeResult, 'frame'>[]): Promise<boolean> {
  if (!(await saveSessionImages(sessionId, results))) return false;
  try {
    await updateFull(sessionId, (record) => (record.imagesApart ? record : { ...record, results: measuresOnly(record.results), imagesApart: true }));
    return true;
  } catch {
    return false;
  }
}

/** Ancienne séance relue : images rangées en octets, puis retirées de la séance (une seule fois). */
async function convertOld(sessionId: string, results: readonly Omit<AnalyzeResult, 'frame'>[]): Promise<void> {
  // Au pire, la conversion sera refaite à la prochaine ouverture.
  await storeSessionImages(sessionId, results);
}

/** Photos d'une séance gardée, sans leurs images (pour marquer les photos déjà triées). */
export async function loadSessionItems(sessionId: string): Promise<MediaItem[]> {
  try {
    const record = await get<FullRecord>(full(sessionId));
    return Array.isArray(record?.results) ? record.results.map((r) => r.item) : [];
  } catch {
    return [];
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
    await runStore(STORES.session, 'readwrite', (store) => store.delete(imageRange(sessionId)));
    const pointer = await get<{ sessionId: string }>('courante');
    if (pointer?.sessionId === sessionId) await runStore(STORES.session, 'readwrite', (store) => store.delete('courante'));
  } catch {
    // Rien à effacer.
  }
}

// ——— Analyse interrompue (iOS ferme l'app en pleine analyse) : chaque photo analysée est gardée tout de suite, sous
// `p:<signature du fichier>` ; si l'utilisateur re-choisit les mêmes photos, elles ne sont pas refaites (24/11). ———

/**
 * Signature d'un fichier choisi : nom et taille, identiques quand on re-choisit la même photo. Pas la date du fichier :
 * sur l'iPhone, c'est souvent l'heure de la sélection, différente à chaque fois (voir `FileDiagnostic.fileModifiedAt`).
 */
export const fileSignature = (file: File): string => `${file.name}|${file.size}`;

const PARTIAL = 'p:';
const partialRange = () => IDBKeyRange.bound(PARTIAL, `${PARTIAL}￿`);

/** `version` : version de l'app qui a analysé la photo (une mise à jour s'installe souvent à la réouverture qui suit
 *  une fermeture par iOS : ses mesures ne doivent pas se mêler à celles de l'ancienne version). */
export async function savePartialResult(signature: string, result: AnalyzeResult, version: string): Promise<void> {
  const { item, thumbnail, preview, diagnostic } = result;
  try {
    // Images en octets (voir plus haut) : relisibles après la fermeture de l'app par iOS.
    const images = { thumb: await toStored(thumbnail), preview: await toStored(preview) };
    await put({ id: `${PARTIAL}${signature}`, at: Date.now(), version, images, result: { item, thumbnail: null, preview: null, diagnostic } });
  } catch {
    // Facultatif : au pire, la photo sera refaite.
  }
}

/** Photos déjà analysées lors d'une analyse interrompue, par signature de fichier (moins de 2 jours, même version). */
export async function loadPartialResults(version: string): Promise<Map<string, Omit<AnalyzeResult, 'frame'>>> {
  const out = new Map<string, Omit<AnalyzeResult, 'frame'>>();
  try {
    const rows = (await runStore(STORES.session, 'readonly', (store) => store.getAll(partialRange()))) as {
      id: string;
      at: number;
      version?: string;
      images?: { thumb: StoredImage | null; preview: StoredImage | null };
      result: Omit<AnalyzeResult, 'frame'>;
    }[];
    for (const row of rows) {
      if (!(Date.now() - row.at < 2 * 86_400_000 && row.version === version && row.result?.item)) continue;
      const thumbnail = await revive(row.images?.thumb ?? row.result.thumbnail);
      const preview = await revive(row.images?.preview ?? row.result.preview);
      // Sans image relisible, la photo est refaite (sinon elle resterait vide à l'écran).
      if (!thumbnail) continue;
      out.set(row.id.slice(PARTIAL.length), { ...row.result, thumbnail, preview });
    }
  } catch {
    // Rien à reprendre.
  }
  return out;
}

export async function clearPartialResults(): Promise<void> {
  try {
    await runStore(STORES.session, 'readwrite', (store) => store.delete(partialRange()));
  } catch {
    // Rien à effacer.
  }
}
