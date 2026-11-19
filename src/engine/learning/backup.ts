// Fichier de sauvegarde des goûts : vos choix, leurs mesures et l'empreinte de l'image, jamais d'image.
// Format compact et versionné : un en-tête, puis une ligne (tableau) par choix ; mesures en millièmes.
// Lisible par un humain, réparable, et prévu pour évoluer sans casser les anciennes sauvegardes.

import { FEATURE_NAMES, type ChoiceRecord, type Features } from '../types';

export const BACKUP_FORMAT = 'photo-triage-gouts';
export const BACKUP_VERSION = 1;

/** Une ligne : [clé, paquet, 1 garder / 0 supprimer, date ms, note de base ×1000, mesures ×1000, commentaire, version des critères, empreinte]. */
type Row = [string, string, 0 | 1, number, number, (number | null)[], string | null, number | null, string | null];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  savedAt: number;
  /** Noms des mesures, dans l'ordre des colonnes : une mesure ajoutée plus tard ne décale rien. */
  features: string[];
  choices: Row[];
}

const milli = (v: number | undefined): number | null => (v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1000));

export function encodeBackup(records: readonly ChoiceRecord[], now: number): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    savedAt: now,
    features: [...FEATURE_NAMES],
    choices: records.map((r) => [
      r.key,
      r.packKey,
      r.choice === 'garder' ? 1 : 0,
      r.at,
      milli(r.baseScore) ?? 0,
      FEATURE_NAMES.map((name) => milli(r.features[name])),
      r.comment ?? null,
      r.v ?? null,
      r.embedding ?? null,
    ]),
  };
}

export interface DecodedBackup {
  records: ChoiceRecord[];
  /** Lignes ignorées car illisibles. */
  skipped: number;
  savedAt: number | null;
}

/** Lit une sauvegarde ; lève une erreur lisible si ce n'est pas un fichier de l'app. */
export function decodeBackup(data: unknown): DecodedBackup {
  const file = data as Partial<BackupFile> | null;
  if (!file || typeof file !== 'object' || file.format !== BACKUP_FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde de Photo Triage.');
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION)
    throw new Error('Sauvegarde faite par une version plus récente de l’app : mettez l’app à jour.');
  const names = Array.isArray(file.features) ? file.features.map(String) : [];
  const records: ChoiceRecord[] = [];
  let skipped = 0;
  for (const row of Array.isArray(file.choices) ? file.choices : []) {
    try {
      const [key, packKey, keep, at, base, values, comment, v, embedding] = row as Row;
      if (typeof key !== 'string' || typeof packKey !== 'string' || (keep !== 0 && keep !== 1) || typeof at !== 'number')
        throw new Error('ligne');
      const features: Partial<Features> = {};
      names.forEach((name, i) => {
        const value = Array.isArray(values) ? values[i] : null;
        if ((FEATURE_NAMES as readonly string[]).includes(name) && typeof value === 'number') features[name as keyof Features] = value / 1000;
      });
      records.push({
        key,
        packKey,
        choice: keep === 1 ? 'garder' : 'supprimer',
        features: features as Features,
        baseScore: typeof base === 'number' ? base / 1000 : 0.5,
        at,
        ...(typeof comment === 'string' && comment ? { comment } : {}),
        ...(typeof v === 'number' ? { v } : {}),
        ...(typeof embedding === 'string' && embedding ? { embedding } : {}),
      });
    } catch {
      skipped++;
    }
  }
  return { records, skipped, savedAt: typeof file.savedAt === 'number' ? file.savedAt : null };
}

/** Fusion : rien n'est supprimé ; pour une même photo, le choix le plus récent l'emporte. */
export function mergeChoices(current: readonly ChoiceRecord[], incoming: readonly ChoiceRecord[]): { merged: ChoiceRecord[]; added: number; updated: number } {
  const byKey = new Map(current.map((r) => [r.key, r]));
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    const existing = byKey.get(r.key);
    if (!existing) {
      byKey.set(r.key, r);
      added++;
    } else if (r.at > existing.at) {
      byKey.set(r.key, { ...r, embedding: r.embedding ?? existing.embedding, comment: r.comment ?? existing.comment });
      updated++;
    } else if ((!existing.embedding && r.embedding) || (!existing.comment && r.comment)) {
      // Choix local plus récent, mais la sauvegarde a une empreinte ou un commentaire qui lui manquent : on les reprend.
      byKey.set(r.key, { ...existing, embedding: existing.embedding ?? r.embedding, comment: existing.comment ?? r.comment });
      updated++;
    }
  }
  return { merged: [...byKey.values()], added, updated };
}
