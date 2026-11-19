import { useState } from 'react';
import type { SavedReport } from '../platform/storage/reports';
import { REPORTS_KEPT, REPORTS_MAX_DAYS } from '../platform/storage/reports';
import { copyText, shareText } from './report';
import { formatDateTime } from './format';

const joinReports = (list: readonly SavedReport[]): string => list.map((r) => r.text).join('\n\n');

/** Rapports conservés sur l'iPhone : les copier ou les partager d'un coup, pour les donner à Claude. */
export function RapportsEnregistres({ reports }: { reports: SavedReport[] }) {
  const [done, setDone] = useState<string | null>(null);
  if (reports.length === 0)
    return (
      <section className="groupe">
        <p className="note">Aucun rapport pour l’instant : il s’en crée un à chaque analyse.</p>
      </section>
    );

  const act = async (key: string, text: string, share: boolean) => {
    if (share) {
      const result = await shareText(text, 'Rapports Photo Triage');
      if (result !== 'annule') setDone(result === 'partage' ? key : `${key}-echec`);
      return;
    }
    setDone((await copyText(text)) ? key : `${key}-echec`);
  };

  return (
    <details className="groupe repli">
      <summary>
        <span>Les {reports.length} dernières analyses</span>
      </summary>
      <p className="note">
        Les {REPORTS_KEPT} dernières analyses ({REPORTS_MAX_DAYS} jours au plus), mises à jour avec vos choix. Texte
        seulement, aucune image. « Partager » ouvre le menu de l’iPhone : choisissez l’app Claude pour me les envoyer.
      </p>
      <div className="rapports-actions">
        <button className="bouton" onClick={() => void act('tous-partage', joinReports(reports), true)}>
          {done === 'tous-partage' ? 'Partagé ✓' : `Partager les ${reports.length}`}
        </button>
        <button className="bouton" onClick={() => void act('tous-copie', joinReports(reports), false)}>
          {done === 'tous-copie' ? 'Copiés ✓' : `Copier les ${reports.length}`}
        </button>
      </div>
      {done?.endsWith('-echec') && <p className="alerte">Impossible ici : essayez l’autre bouton.</p>}
      <ul className="rapports-liste">
        {reports.map((r) => (
          <li key={r.id}>
            <span>
              {r.title}
              <br />
              <span className="note">mis à jour le {formatDateTime(r.at)}</span>
            </span>
            <button className="lien" onClick={() => void act(r.id, r.text, false)}>
              {done === r.id ? 'Copié ✓' : 'Copier'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
