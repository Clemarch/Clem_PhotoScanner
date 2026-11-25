import type { Session } from '../session';
import type { ChoiceRecord } from '../../engine';
import { ProchainTri } from '../Rangement';
import { formatDate, plural } from '../format';
import { IconCoche, IconPlus } from '../icons';

interface Props {
  session: Session;
  onReopen: () => void;
  onNewDay: (files: File[]) => void;
  onSeances: () => void;
  records: ChoiceRecord[];
}

/**
 * Séance terminée : tout est parti à la suppression, ses photos ne s'affichent plus (utilisateur, 20/11). On peut la
 * rouvrir, en commencer une nouvelle, ou retrouver les précédentes dans Réglages.
 */
export function SeanceTerminee({ session, onReopen, onNewDay, onSeances, records }: Props) {
  const dates = session.results.map((r) => r.item.capturedAt).filter((t): t is number => t !== null);
  const first = dates.length ? Math.min(...dates) : null;
  const last = dates.length ? Math.max(...dates) : null;
  return (
    <main className="page">
      <header className="grand-titre">
        <h1>Terminé</h1>
      </header>
      <ProchainTri records={records} include={session.id} />
      <section className="carte heros">
        <span className="heros-icone vert">
          <IconCoche size={30} />
        </span>
        <h2>Séance terminée</h2>
        <p className="doux">
          {plural(session.results.length, 'photo')}
          {first !== null && ` du ${formatDate(first)}`}
          {last !== null && first !== null && formatDate(last) !== formatDate(first) && ` au ${formatDate(last)}`}. Les photos à
          supprimer sont parties dans Photos : elles restent 30 jours dans Albums › « Supprimés récemment ».
        </p>
        <label className="bouton principal">
          <IconPlus size={17} /> Nouvelle séance
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) onNewDay(files);
            }}
          />
        </label>
        <button className="bouton" onClick={onReopen}>
          Rouvrir cette séance
        </button>
        <button className="lien" onClick={onSeances}>
          Toutes les séances
        </button>
      </section>
      <p className="note centre">
        Si la suppression n’a pas abouti dans le raccourci, rouvrez la séance : l’onglet Supprimer permet de recommencer
        l’envoi.
      </p>
    </main>
  );
}
