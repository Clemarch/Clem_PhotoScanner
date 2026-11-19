import { useState } from 'react';
import type { ChoiceRecord } from '../engine';
import { exportBackup, loadLastBackup, makeBackupFile, readBackupFile, saveLastBackup } from '../platform/storage/backupFile';
import { formatDate, plural } from './format';

interface Props {
  records: ChoiceRecord[];
  /** Fusionne des choix restaurés ; renvoie le nombre de choix ajoutés et mis à jour. */
  onRestore: (records: ChoiceRecord[]) => Promise<{ added: number; updated: number }>;
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

/** Sauvegarde des goûts dans iCloud Drive (par la feuille de partage d'iOS) et restauration. */
export function SauvegardeGouts({ records, onRestore }: Props) {
  const [last, setLast] = useState(() => loadLastBackup());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fresh = last ? records.filter((r) => r.at > last.at).length : records.length;
  const withImage = records.filter((r) => r.embedding).length;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const file = await makeBackupFile(records);
      const how = await exportBackup(file);
      if (how === 'annule') setMessage('Sauvegarde annulée.');
      else {
        const value = { at: Date.now(), count: records.length };
        saveLastBackup(value);
        setLast(value);
        setMessage(
          how === 'partage'
            ? `Fichier prêt (${Math.max(1, Math.round(file.size / 1024))} Ko). Vérifiez qu’il est bien dans iCloud Drive › Photo Triage.`
            : 'Fichier téléchargé : enregistrez-le dans iCloud Drive › Photo Triage.',
        );
      }
    } catch {
      setMessage('La sauvegarde a échoué : réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const decoded = await readBackupFile(file);
      const { added, updated } = await onRestore(decoded.records);
      setMessage(
        `Restauré : ${plural(added, 'choix ajouté', 'choix ajoutés')}, ${plural(updated, 'mis à jour', 'mis à jour')}` +
          (decoded.skipped ? `, ${decoded.skipped} ligne(s) illisible(s) ignorée(s)` : '') +
          '. Rien n’a été effacé.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Restauration impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="info" open={backupDue(records)}>
      <summary>
        Mes goûts : {plural(records.length, 'choix', 'choix')}
        {fresh > 0 && last ? ` · ${fresh} non sauvegardé${fresh > 1 ? 's' : ''}` : ''}
      </summary>
      <p>
        {last ? `Dernière sauvegarde le ${formatDate(last.at)}.` : 'Jamais sauvegardés.'} {withImage} choix avec l’empreinte
        de l’image (pour apprendre vos goûts sur le contenu des photos).
      </p>
      <div className="rapports-actions">
        <button className="bouton" disabled={busy || records.length === 0} onClick={() => void save()}>
          Sauvegarder
        </button>
        <label className="bouton">
          Restaurer
          <input
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void restore(file);
            }}
          />
        </label>
      </div>
      {message && <p className="note">{message}</p>}
      <p className="note">
        La première fois : touchez « Sauvegarder », puis « Enregistrer dans Fichiers », choisissez iCloud Drive, créez le
        dossier « Photo Triage » et touchez « Enregistrer ». Ensuite, l’iPhone propose ce dossier tout seul : «
        Enregistrer », puis « Remplacer ». Pour retrouver vos goûts (nouvel iPhone, app réinstallée) : « Restaurer »,
        puis choisissez le fichier dans iCloud Drive › Photo Triage.
      </p>
    </details>
  );
}
