// Fichier de sauvegarde des goûts : création (compressée si possible) et lecture.
// L'app ne l'envoie nulle part : la feuille de partage d'iOS laisse l'utilisateur l'enregistrer dans iCloud Drive.

import { decodeBackup, encodeBackup, type ChoiceRecord, type DecodedBackup } from '../../engine';

export const BACKUP_NAME = 'photo-triage-gouts';
const LAST_KEY = 'photo-triage.derniere-sauvegarde';

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

async function gunzip(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** Fichier prêt à enregistrer : « photo-triage-gouts.json.gz » (ou .json si la compression manque). */
export async function makeBackupFile(records: readonly ChoiceRecord[]): Promise<File> {
  const text = JSON.stringify(encodeBackup(records, Date.now()));
  const packed = await gzip(text);
  return packed
    ? new File([packed], `${BACKUP_NAME}.json.gz`, { type: 'application/gzip' })
    : new File([text], `${BACKUP_NAME}.json`, { type: 'application/json' });
}

/** Lit un fichier de sauvegarde (compressé ou non). Lève une erreur lisible en cas de problème. */
export async function readBackupFile(file: Blob): Promise<DecodedBackup> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let text: string;
  try {
    text = head[0] === 0x1f && head[1] === 0x8b ? await gunzip(file) : await file.text();
  } catch {
    throw new Error('Fichier illisible (compression).');
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde de Photo Triage.');
  }
  return decodeBackup(data);
}

/** Enregistre le fichier : feuille de partage d'iOS (« Enregistrer dans Fichiers »), sinon téléchargement direct. */
export async function exportBackup(file: File): Promise<'partage' | 'telechargement' | 'annule'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde des goûts Photo Triage' });
      return 'partage';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'telechargement';
}

export interface LastBackup {
  at: number;
  count: number;
}

export function loadLastBackup(): LastBackup | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as LastBackup | null;
    return v && typeof v.at === 'number' && typeof v.count === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function saveLastBackup(value: LastBackup): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(value));
  } catch {
    // Mémoire seulement.
  }
}
