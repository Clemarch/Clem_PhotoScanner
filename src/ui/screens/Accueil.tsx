import { useEffect, useState } from 'react';
import { isInstalled, type InterruptedRun } from '../../platform/device';
import { applyPendingUpdate, watchUpdate, type UpdateStatus } from '../../platform/update';
import { AlerteGoutsPerdus, backupDue, whenText } from '../SauvegardeGouts';
import type { ChoiceRecord, PoseValidation } from '../../engine';
import type { LastRun } from '../../platform/storage/lastRun';
import { loadLastBackup } from '../../platform/storage/backupFile';
import { formatDate, formatShortTime, plural } from '../format';
import { IconChevron, IconNuage, IconReglages, IconTrier } from '../icons';
import { APP_VERSION } from '../version';
import type { ModelsState } from '../../platform/storage/models';

const mo = (bytes: number) => Math.round(bytes / 1_000_000);

/** Modèles du nouvel œil : prêts, en cours de téléchargement (avec la progression), ou en échec (avec « Réessayer »). */
function EtatModeles({ models, onRetry }: { models: ModelsState | null; onRetry: () => void }) {
  if (!models) return null;
  if (models.ready) return <p className="note centre">Modèles d’analyse prêts ✓ (nouvel œil compris)</p>;
  const pct = Math.round((models.done / models.total) * 100);
  return (
    <section className={models.error ? 'alerte alerte-bloc' : 'info alerte-bloc'}>
      <p>
        <strong>Modèles du nouvel œil : {pct} %</strong> ({mo(models.done)} / {mo(models.total)} Mo, une seule fois).{' '}
        {models.error
          ? `Téléchargement interrompu (${models.error}).`
          : 'Gardez l’app ouverte, en Wi-Fi de préférence. Vous pouvez déjà analyser : le nouvel œil s’ajoutera dès qu’ils seront là.'}
      </p>
      <div className="barre" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      {models.error && (
        <button className="bouton principal" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </section>
  );
}

interface Props {
  onFiles: (files: File[]) => void;
  interrupted: InterruptedRun | null;
  lastRun: LastRun | null;
  records: ChoiceRecord[];
  /** Les choix ont fini d'être lus sur l'iPhone (pour ne pas crier à la perte trop tôt). */
  recordsLoaded: boolean;
  onRestore: (records: ChoiceRecord[], validations?: PoseValidation[]) => Promise<{ added: number; updated: number }>;
  onSettings: () => void;
  /** Nombre de séances gardées (à rouvrir dans Réglages). */
  seances: number;
  /** Modèles du nouvel œil : téléchargement et état. */
  models: ModelsState | null;
  onRetryModels: () => void;
}

export function Accueil({ onFiles, interrupted, lastRun, records, recordsLoaded, onRestore, onSettings, seances, models, onRetryModels }: Props) {
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
      {update === 'prete' && (
        <div className="info alerte-bloc">
          <p>Nouvelle version prête. Elle s’installera à la prochaine ouverture de l’app, ou tout de suite :</p>
          <button className="bouton principal" onClick={() => void applyPendingUpdate()}>
            Installer maintenant
          </button>
        </div>
      )}

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
          La dernière analyse s’est arrêtée à la photo {interrupted.done} sur {interrupted.total} (l’iPhone a fermé l’app). Touchez
          « Choisir les photos » et re-choisissez les mêmes : celles déjà analysées sont reprises, pas refaites.
        </p>
      )}

      <EtatModeles models={models} onRetry={onRetryModels} />

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
        {seances > 0 && (
          <button className="ligne-info ligne-bouton" onClick={onSettings}>
            <span className="icone-ronde gris">
              <IconTrier size={18} />
            </span>
            <div>
              <strong>Séances précédentes</strong>
              <span className="note bloc">{plural(seances, 'séance')} à rouvrir si besoin</span>
            </div>
            <IconChevron size={14} className="chevron" />
          </button>
        )}
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
