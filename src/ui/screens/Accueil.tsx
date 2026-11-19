import { useEffect, useState } from 'react';
import { isInstalled, type InterruptedRun } from '../../platform/device';
import { watchUpdate, type UpdateStatus } from '../../platform/update';
import { AlerteGoutsPerdus, backupDue, whenText } from '../SauvegardeGouts';
import type { ChoiceRecord } from '../../engine';
import type { LastRun } from '../../platform/storage/lastRun';
import { loadLastBackup } from '../../platform/storage/backupFile';
import { formatDate, formatShortTime, plural } from '../format';
import { IconChevron, IconNuage, IconReglages } from '../icons';
import { APP_VERSION } from '../version';

interface Props {
  onFiles: (files: File[]) => void;
  interrupted: InterruptedRun | null;
  lastRun: LastRun | null;
  records: ChoiceRecord[];
  /** Les choix ont fini d'être lus sur l'iPhone (pour ne pas crier à la perte trop tôt). */
  recordsLoaded: boolean;
  onRestore: (records: ChoiceRecord[]) => Promise<{ added: number; updated: number }>;
  onSettings: () => void;
}

export function Accueil({ onFiles, interrupted, lastRun, records, recordsLoaded, onRestore, onSettings }: Props) {
  const [update, setUpdate] = useState<UpdateStatus>(null);
  useEffect(() => watchUpdate(setUpdate), []);
  const installed = isInstalled();
  const last = loadLastBackup();
  const due = backupDue(records);

  return (
    <main className="accueil">
      <header className="accueil-barre">
        <button className="rond" onClick={onSettings} aria-label="Réglages">
          <IconReglages size={20} />
        </button>
      </header>

      <div className="accueil-haut">
        <img className="logo" src="./icon.svg" alt="" />
        <h1>Photo Triage</h1>
        <p className="doux">
          Choisissez les photos à trier : une après-midi, une journée ou plusieurs jours. Tout est analysé sur votre
          iPhone : rien n’est envoyé, rien n’est supprimé sans vous.
        </p>
      </div>

      <AlerteGoutsPerdus records={records} loaded={recordsLoaded} onRestore={onRestore} />

      {update === 'telechargement' && (
        <p className="info">Mise à jour en cours de téléchargement. Gardez l’app ouverte, de préférence en Wi-Fi, jusqu’au message « prête ».</p>
      )}
      {update === 'prete' && <p className="info">Nouvelle version prête : fermez complètement l’app (balayez-la vers le haut), puis rouvrez-la.</p>}

      {!installed && (
        <details className="info">
          <summary>Conseil : installez l’app sur l’écran d’accueil</summary>
          <p>
            Dans un onglet Safari, l’iPhone peut effacer vos choix si l’app n’est pas ouverte pendant quelques jours.
            Installée, elle les conserve.
          </p>
          <ol>
            <li>Dans Safari, touchez le bouton Partager (le carré avec une flèche vers le haut).</li>
            <li>Touchez « Sur l’écran d’accueil », puis « Ajouter ».</li>
            <li>Ouvrez ensuite l’app depuis sa nouvelle icône.</li>
          </ol>
        </details>
      )}

      {interrupted && (
        <p className="alerte">
          La dernière analyse s’est arrêtée brutalement à la photo {interrupted.done} sur {interrupted.total}. Notez ces deux
          nombres : ils indiquent la limite de l’iPhone.
        </p>
      )}

      <section className="groupe">
        {lastRun && (
          <div className="ligne-info">
            <span className="icone-ronde">
              <IconChevron size={16} />
            </span>
            <div>
              <strong>Pour continuer</strong>
              <span className="note bloc">
                Choisissez les photos prises après le {formatDate(lastRun.lastAt)} à {formatShortTime(lastRun.lastAt)} (dernière
                séance : {lastRun.photos} photos).
              </span>
            </div>
          </div>
        )}
        <button className="ligne-info ligne-bouton" onClick={onSettings}>
          <span className={`icone-ronde${due ? ' orange' : ''}`}>
            <IconNuage size={18} />
          </span>
          <div>
            <strong>Mes goûts : {plural(records.length, 'choix', 'choix')}</strong>
            <span className="note bloc">
              {last ? `Sauvegardés ${whenText(last.at)}` : 'Jamais sauvegardés'}
              {due ? ' · pensez à sauvegarder' : ''}
            </span>
          </div>
          <IconChevron size={14} className="chevron" />
        </button>
      </section>

      <div className="accueil-bas">
        <label className="bouton principal grand">
          Choisir les photos
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) onFiles(files);
            }}
          />
        </label>
        <p className="note">{APP_VERSION}</p>
      </div>
    </main>
  );
}
