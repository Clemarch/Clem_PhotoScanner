import { useEffect, useState } from 'react';
import type { ChoiceRecord, PoseValidation } from '../engine';
import { exportBackup, loadLastBackup, makeBackupFile, readBackupFile, saveLastBackup, type LastBackup } from '../platform/storage/backupFile';
import { mergeLinks } from '../platform/storage/links';
import { formatShortTime, plural } from './format';
import { IconNuage } from './icons';

type Restore = (records: ChoiceRecord[], validations?: PoseValidation[]) => Promise<{ added: number; updated: number }>;

interface Props {
  records: ChoiceRecord[];
  /** Fusionne des choix restaurés ; renvoie le nombre de choix ajoutés et mis à jour. */
  onRestore: Restore;
}

const DAY = 86_400_000;

/** Faut-il rappeler de sauvegarder ? 20 nouveaux choix, ou des nouveaux choix et 14 jours sans sauvegarde. */
export function backupDue(records: readonly ChoiceRecord[]): boolean {
  if (records.length === 0) return false;
  const last = loadLastBackup();
  if (!last) return records.length >= 5;
  const fresh = records.filter((r) => r.at > last.at).length;
  return fresh >= 20 || (fresh > 0 && Date.now() - last.at >= 14 * DAY);
}

/** « aujourd'hui à 19:20 », « hier à 08:05 », « il y a 5 jours ». */
export function whenText(at: number, now = Date.now()): string {
  const start = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const days = Math.round((start(now) - start(at)) / DAY);
  if (days <= 0) return `aujourd’hui à ${formatShortTime(at)}`;
  if (days === 1) return `hier à ${formatShortTime(at)}`;
  return `il y a ${days} jours`;
}

/** Lit un fichier de sauvegarde et le fusionne ; renvoie le message à afficher. */
async function restoreFrom(file: File, onRestore: Restore): Promise<string> {
  try {
    const decoded = await readBackupFile(file);
    const { added, updated } = await onRestore(decoded.records, decoded.validations);
    mergeLinks(decoded.links);
    return (
      `Restauré : ${plural(added, 'choix ajouté', 'choix ajoutés')}, ${plural(updated, 'mis à jour', 'mis à jour')}` +
      (decoded.skipped ? `, ${decoded.skipped} ligne(s) illisible(s) ignorée(s)` : '') +
      '. Rien n’a été effacé.'
    );
  } catch (e) {
    return e instanceof Error ? e.message : 'Restauration impossible.';
  }
}

function RestoreButton({ onRestore, onMessage, primary = false }: { onRestore: Restore; onMessage: (m: string) => void; primary?: boolean }) {
  return (
    <label className={`bouton${primary ? ' principal' : ''}`}>
      Restaurer
      <input
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void restoreFrom(file, onRestore).then(onMessage);
        }}
      />
    </label>
  );
}

/**
 * Alerte de l'accueil : l'iPhone a moins de choix que lors de la dernière sauvegarde (app réinstallée, données
 * effacées par Safari…). Une simple mise à jour de l'app n'efface rien.
 */
export function AlerteGoutsPerdus({ records, loaded, onRestore }: Props & { loaded: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const last = loadLastBackup();
  // Vrais choix seulement : les accords silencieux d'une nouvelle séance ne doivent pas masquer une perte.
  const have = last?.explicit !== undefined ? records.filter((r) => !r.implicit).length : records.length;
  const had = last ? (last.explicit ?? last.count) : 0;
  if (!loaded || !last || (have >= had && !message)) return null;
  return (
    <section className="alerte alerte-bloc">
      {message ? (
        <p>{message}</p>
      ) : (
        <>
          <p>
            <strong>Vos goûts semblent perdus</strong> : {plural(have, 'choix', 'choix')} sur cet iPhone, contre{' '}
            {had} à la dernière sauvegarde. Rechargez la sauvegarde la plus récente
            {last.name ? ` (« ${last.name} »)` : ''}, dans iCloud Drive › Photo Triage.
          </p>
          <RestoreButton onRestore={onRestore} onMessage={setMessage} primary />
        </>
      )}
    </section>
  );
}

/** Sauvegarde des goûts dans iCloud Drive (par la feuille de partage d'iOS) et restauration. */
export function SauvegardeGouts({ records, onRestore, validations = [] }: Props & { validations?: PoseValidation[] }) {
  const [last, setLast] = useState<LastBackup | null>(() => loadLastBackup());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fresh = last ? records.filter((r) => r.at > last.at).length : records.length;
  // Fichier préparé à l'avance : iOS n'ouvre la feuille de partage que si elle suit immédiatement le toucher
  // (une compression faite entre les deux pourrait la faire refuser).
  const [ready, setReady] = useState<File | null>(null);
  useEffect(() => {
    let alive = true;
    setReady(null);
    if (records.length > 0) void makeBackupFile(records, validations).then((file) => alive && setReady(file));
    return () => {
      alive = false;
    };
  }, [records, validations]);
  const due = backupDue(records);

  const save = async () => {
    if (!ready) return;
    const file = ready;
    setBusy(true);
    setMessage(null);
    try {
      const how = await exportBackup(file);
      if (how === 'annule') setMessage('Sauvegarde annulée.');
      else if (how === 'refuse') setMessage('L’iPhone a refusé d’ouvrir le menu : touchez « Sauvegarder » encore une fois.');
      else {
        // Seul un partage réussi (ou un téléchargement) compte comme sauvegarde : sinon le rappel continue.
        const name = file.name.replace(/\.json(\.gz)?$/, '');
        const value = { at: Date.now(), count: records.length, explicit: records.filter((r) => !r.implicit).length, name };
        saveLastBackup(value);
        setLast(value);
        setMessage(
          how === 'partage'
            ? `Enregistré sous « ${name} ». Vérifiez qu’il est bien dans iCloud Drive › Photo Triage.`
            : `Fichier « ${name} » téléchargé : rangez-le dans iCloud Drive › Photo Triage.`,
        );
      }
    } catch {
      setMessage('La sauvegarde a échoué : réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="groupe">
      <div className="ligne-info">
        <span className={`icone-ronde${due ? ' orange' : ''}`}>
          <IconNuage size={20} />
        </span>
        <div>
          <strong>{plural(records.length, 'choix', 'choix')} enregistrés</strong>
          <span className="note bloc">
            {last ? `Sauvegardés ${whenText(last.at)}` : 'Jamais sauvegardés'}
            {fresh > 0 && records.length > 0 ? ` · ${fresh} nouveau${fresh > 1 ? 'x' : ''}` : ''}
          </span>
        </div>
      </div>
      {last?.name && <p className="note">Dernier fichier : « {last.name} »</p>}
      <div className="rapports-actions">
        <button className={`bouton${due ? ' principal' : ''}`} disabled={busy || !ready} onClick={() => void save()}>
          {ready || records.length === 0 ? 'Sauvegarder' : 'Préparation…'}
        </button>
        <RestoreButton onRestore={onRestore} onMessage={setMessage} />
      </div>
      {message && <p className="note">{message}</p>}
      <details className="sous-repli">
        <summary>Comment ça marche</summary>
        <ol className="etapes">
          <li>
            Touchez <strong>Sauvegarder</strong>, puis <strong>Enregistrer dans Fichiers</strong>.
          </li>
          <li>
            Choisissez <strong>iCloud Drive</strong>, puis le dossier <strong>Photo Triage</strong> (la première fois,
            créez-le avec l’icône de dossier en haut), et touchez <strong>Enregistrer</strong>.
          </li>
          <li>
            Chaque fichier porte la date, l’heure et le nombre de choix, par exemple « Photo Triage 2026-11-19 19h20 (182
            choix) » : le plus récent est celui qui a la date la plus récente.
          </li>
          <li>
            Pour retrouver vos goûts (nouvel iPhone, app réinstallée) : <strong>Restaurer</strong>, puis choisissez le
            fichier le plus récent. Rien n’est effacé : les choix sont ajoutés.
          </li>
        </ol>
        <p className="note">
          Une mise à jour de l’app n’efface pas vos choix : inutile de restaurer après chaque version. L’app vous prévient
          si elle en a moins qu’à la dernière sauvegarde.
        </p>
      </details>
    </section>
  );
}
