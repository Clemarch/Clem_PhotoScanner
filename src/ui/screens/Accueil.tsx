import { useEffect, useState } from 'react';
import { isInstalled, type InterruptedRun } from '../../platform/device';
import { watchUpdate, type UpdateStatus } from '../../platform/update';
import { GuideRaccourci } from '../GuideRaccourci';

interface Props {
  onFiles: (files: File[]) => void;
  interrupted: InterruptedRun | null;
}

export function Accueil({ onFiles, interrupted }: Props) {
  const [update, setUpdate] = useState<UpdateStatus>(null);
  useEffect(() => watchUpdate(setUpdate), []);
  const installed = isInstalled();
  return (
    <main className="accueil">
      <div className="accueil-haut">
        <img className="logo" src="./icon.svg" alt="" />
        <h1>Photo Triage</h1>
        <p className="doux">
          Choisissez toutes les photos d’une journée. Elles sont analysées ici, sur votre iPhone : rien n’est envoyé,
          rien n’est supprimé.
        </p>
      </div>

      {update === 'telechargement' && (
        <p className="info">
          Mise à jour en cours de téléchargement. Gardez l’app ouverte, de préférence en Wi-Fi, jusqu’au message
          « prête ».
        </p>
      )}
      {update === 'prete' && (
        <p className="info">
          Nouvelle version prête : fermez complètement l’app (balayez-la vers le haut), puis rouvrez-la.
        </p>
      )}

      {!installed && (
        <details className="info">
          <summary>Conseil : installez l’app sur l’écran d’accueil</summary>
          <p>
            Dans un onglet Safari, l’iPhone peut effacer vos choix « garder / supprimer » si l’app n’est pas ouverte
            pendant quelques jours. Installée, elle les conserve.
          </p>
          <ol>
            <li>Dans Safari, touchez le bouton Partager (le carré avec une flèche vers le haut).</li>
            <li>Touchez « Sur l’écran d’accueil », puis « Ajouter ».</li>
            <li>Ouvrez ensuite l’app depuis sa nouvelle icône.</li>
          </ol>
          <p className="note">Vos choix déjà faits dans Safari ne suivent pas : l’app installée repart de zéro.</p>
        </details>
      )}

      <section className="info">
        <GuideRaccourci />
      </section>

      {interrupted && (
        <p className="alerte">
          La dernière analyse s’est arrêtée brutalement à la photo {interrupted.done} sur {interrupted.total}.
          Notez ces deux nombres : ils nous indiquent la limite de l’iPhone.
        </p>
      )}

      <div className="accueil-bas">
        <label className="bouton principal">
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
        <p className="note">Version de test · jalon 4 · réglage 6 bis (guide du raccourci à l’accueil)</p>
      </div>
    </main>
  );
}
