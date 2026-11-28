// Fichier de sauvegarde des goûts : vos choix, leurs mesures et l'empreinte de l'image, jamais d'image.
// Format compact et versionné : un en-tête, puis une ligne (tableau) par choix ; mesures en millièmes.
// Lisible par un humain, réparable, et prévu pour évoluer sans casser les anciennes sauvegardes.

import { FEATURE_NAMES, type ChoiceRecord, type Features } from '../types';
import type { PoseValidation } from '../triage/calibration';

export const BACKUP_FORMAT = 'photo-triage-gouts';
export const BACKUP_VERSION = 1;

/**
 * Photo reliée à la main à une pose (28/11) : la photo `from` va avec la photo `to`. Gardé avec la ressemblance et
 * l'écart de temps mesurés alors : ces liens servent à régler le découpage en poses sur vos propres exemples.
 */
export interface PoseLink {
  from: string;
  to: string;
  at: number;
  /** Ressemblance des empreintes fines (null : inconnue). */
  sim: number | null;
  /** Écart de temps, en secondes. */
  seconds: number | null;
}

/** Une ligne : [clé, paquet, 1 garder / 0 supprimer, date ms, note de base ×1000, mesures ×1000, commentaire, version des critères,
 *  empreinte, 1 si accord silencieux]. La dernière colonne, ajoutée le 19/11, manque dans les anciennes sauvegardes. */
type Row = [
  string,
  string,
  0 | 1,
  number,
  number,
  (number | null)[],
  string | null,
  number | null,
  string | null,
  (0 | 1 | null)?,
  /** Ajouté le 21/11 : 1 si choisi en validant une pose (tri éclair). */
  (0 | 1 | null)?,
  /** Ajouté le 21/11 : proposition de l'app (1 garder, 0 supprimer). */
  (0 | 1 | null)?,
  /** Ajouté le 21/11 : empreinte CLIP (« nouvel œil »), 8 bits en base64. */
  (string | null)?,
  /** Ajouté le 21/11 : résumé des émotions des visages (×1000). */
  (number[] | null)?,
  /** Ajouté le 27/11 : empreintes des visages principaux recadrés (8 bits en base64). */
  (string[] | null)?,
];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  savedAt: number;
  /** Noms des mesures, dans l'ordre des colonnes : une mesure ajoutée plus tard ne décale rien. */
  features: string[];
  choices: Row[];
  /** Journal du tri éclair (ajouté le 21/11, absent des anciennes sauvegardes). */
  validations?: PoseValidation[];
  /** Photos reliées à la main à une pose (ajouté le 28/11). */
  links?: PoseLink[];
}

const milli = (v: number | undefined): number | null => (v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1000));

export function encodeBackup(
  records: readonly ChoiceRecord[],
  now: number,
  validations: readonly PoseValidation[] = [],
  links: readonly PoseLink[] = [],
): BackupFile {
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
      r.implicit ? 1 : null,
      r.via === 'pose' ? 1 : null,
      r.app === undefined ? null : r.app === 'garder' ? 1 : 0,
      r.clip ?? null,
      r.emo ? r.emo.map((x) => Math.round(x * 1000)) : null,
      r.fclip?.length ? r.fclip : null,
    ]),
    ...(validations.length ? { validations: validations.map((v) => ({ ...v, margin: Number.isFinite(v.margin) ? v.margin : -1 })) } : {}),
    ...(links.length ? { links: [...links] } : {}),
  };
}

export interface DecodedBackup {
  records: ChoiceRecord[];
  /** Lignes ignorées car illisibles. */
  skipped: number;
  savedAt: number | null;
  /** Journal du tri éclair (vide pour les sauvegardes d'avant le 21/11). */
  validations: PoseValidation[];
  /** Photos reliées à la main à une pose (vide avant le 28/11). */
  links: PoseLink[];
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
      const [key, packKey, keep, at, base, values, comment, v, embedding, implicit, viaPose, app, clip, emo, fclip] = row as Row;
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
        ...(implicit === 1 ? { implicit: true } : {}),
        ...(viaPose === 1 ? { via: 'pose' as const } : {}),
        ...(app === 1 ? { app: 'garder' as const } : app === 0 ? { app: 'supprimer' as const } : {}),
        ...(typeof clip === 'string' && clip ? { clip } : {}),
        ...(Array.isArray(emo) && emo.length === 6 && emo.every((x) => typeof x === 'number') ? { emo: emo.map((x) => x / 1000) } : {}),
        ...(Array.isArray(fclip) && fclip.length > 0 && fclip.every((x) => typeof x === 'string' && x) ? { fclip } : {}),
      });
    } catch {
      skipped++;
    }
  }
  const validations: PoseValidation[] = [];
  for (const raw of Array.isArray(file.validations) ? file.validations : []) {
    const v = raw as Partial<PoseValidation>;
    const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((k) => typeof k === 'string');
    if (typeof v.id !== 'string' || typeof v.at !== 'number' || !strings(v.keys) || !strings(v.proposed) || !strings(v.kept)) continue;
    validations.push({
      id: v.id,
      at: v.at,
      sessionId: String(v.sessionId ?? ''),
      packKey: String(v.packKey ?? ''),
      margin: typeof v.margin === 'number' && v.margin >= 0 ? v.margin : Infinity,
      keys: v.keys,
      proposed: v.proposed,
      kept: v.kept,
      ms: typeof v.ms === 'number' ? v.ms : 0,
      ...(v.tie === true ? { tie: true } : {}),
      ...(strings(v.why) && v.why.length ? { why: v.why } : {}),
      ...(typeof v.note === 'string' && v.note ? { note: v.note.slice(0, 200) } : {}),
      ...(v.weak === true ? { weak: true } : {}),
    });
  }
  const links: PoseLink[] = [];
  for (const raw of Array.isArray(file.links) ? file.links : []) {
    const l = raw as Partial<PoseLink>;
    if (typeof l.from !== 'string' || typeof l.to !== 'string' || typeof l.at !== 'number') continue;
    links.push({ from: l.from, to: l.to, at: l.at, sim: typeof l.sim === 'number' ? l.sim : null, seconds: typeof l.seconds === 'number' ? l.seconds : null });
  }
  return { records, skipped, savedAt: typeof file.savedAt === 'number' ? file.savedAt : null, validations, links };
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
    } else if ((r.at > existing.at && !(r.implicit && !existing.implicit)) || (existing.implicit && !r.implicit)) {
      // Le plus récent l'emporte, mais un vrai choix n'est jamais remplacé par un accord silencieux, et l'emporte
      // toujours sur lui (choix perdus sur l'iPhone, accords silencieux enregistrés, puis sauvegarde restaurée).
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
