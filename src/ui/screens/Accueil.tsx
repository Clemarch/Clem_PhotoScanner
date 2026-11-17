import type { InterruptedRun } from '../../platform/device';

interface Props {
  onFiles: (files: File[]) => void;
  interrupted: InterruptedRun | null;
}

export function Accueil({ onFiles, interrupted }: Props) {
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
        <p className="note">Version de test · jalon 3 · réglage 3</p>
      </div>
    </main>
  );
}
