// Fichier de sauvegarde des goûts : création (compressée si possible) et lecture.
// L'app ne l'envoie nulle part : la feuille de partage d'iOS laisse l'utilisateur l'enregistrer dans iCloud Drive.

import { decodeBackup, encodeBackup, type ChoiceRecord, type DecodedBackup, type PoseValidation } from '../../engine';

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

const pad = (n: number) => String(n).padStart(2, '0');

/** Nom daté, pour reconnaître la dernière sauvegarde d'un coup d'œil (rangés par nom, le plus récent est en dernier) :
 *  « Photo Triage 2026-11-19 19h20 (182 choix) ». Heure de l'iPhone. */
export function backupName(at: number, count: number): string {
  const d = new Date(at);
  return `Photo Triage ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())} (${count} choix)`;
}

/** Fichier prêt à enregistrer (« ….json.gz », ou « .json » si la compression manque). */
export async function makeBackupFile(records: readonly ChoiceRecord[], validations: readonly PoseValidation[] = [], at = Date.now()): Promise<File> {
  const text = JSON.stringify(encodeBackup(records, at, validations));
  const packed = await gzip(text);
  const name = backupName(at, records.length);
  return packed
    ? new File([packed], `${name}.json.gz`, { type: 'application/gzip' })
    : new File([text], `${name}.json`, { type: 'application/json' });
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
export async function exportBackup(file: File): Promise<'partage' | 'telechargement' | 'annule' | 'refuse'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    // Appelé sans attente préalable : la feuille de partage suit directement le toucher.
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde des goûts Photo Triage' });
      return 'partage';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
      return 'refuse';
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
  /** Nom du fichier enregistré (absent pour les sauvegardes d'avant le 19/11). */
  name?: string;
  /** Parmi `count`, vrais choix (hors accords silencieux) ; absent pour les sauvegardes d'avant le 19/11. */
  explicit?: number;
}

/** Après « Oublier mes choix » : la dernière sauvegarde ne compte plus comme des choix perdus. */
export function forgetLastBackupCount(): void {
  const last = loadLastBackup();
  if (last) saveLastBackup({ ...last, count: 0, explicit: 0 });
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
