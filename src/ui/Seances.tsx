import type { SessionSummary } from '../platform/storage/sessionStore';
import { formatDate, formatShortTime, plural } from './format';
import { IconCorbeille } from './icons';

interface Props {
  seances: SessionSummary[];
  /** Séance affichée en ce moment. */
  currentId: string | null;
  onReopen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

const range = (s: SessionSummary): string => {
  if (s.firstAt === null || s.lastAt === null) return 'Sans date';
  const a = `${formatDate(s.firstAt)} ${formatShortTime(s.firstAt)}`;
  if (formatDate(s.firstAt) === formatDate(s.lastAt)) return `${a} → ${formatShortTime(s.lastAt)}`;
  return `${a} → ${formatDate(s.lastAt)} ${formatShortTime(s.lastAt)}`;
};

/** Toutes les séances gardées sur l'iPhone, à rouvrir (utilisateur, 20/11). */
export function Seances({ seances, currentId, onReopen, onDelete }: Props) {
  if (seances.length === 0)
    return (
      <section className="groupe">
        <p className="note">Aucune séance gardée pour l’instant.</p>
      </section>
    );
  return (
    <section className="groupe">
      <ul className="seances">
        {seances.map((s) => {
          const current = s.sessionId === currentId;
          return (
            <li key={s.sessionId}>
              <div className="seance-texte">
                <strong>{range(s)}</strong>
                <span className="note bloc">
                  {plural(s.photos, 'photo')} ·{' '}
                  {current ? <span className="bleu">ouverte</span> : s.closedAt ? <span className="vert">terminée</span> : 'en cours'}
                </span>
              </div>
              {!current && (
                <>
                  <button className="capsule petite" onClick={() => onReopen(s.sessionId)}>
                    Rouvrir
                  </button>
                  <button
                    className="rond petit-rond"
                    aria-label="Effacer cette séance de l’app"
                    onClick={() => {
                      if (window.confirm('Effacer cette séance de l’app ? Vos photos dans Photos et vos choix ne sont pas touchés.')) onDelete(s.sessionId);
                    }}
                  >
                    <IconCorbeille size={16} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="note">
        Chaque séance garde ses vignettes et ses aperçus sur l’iPhone, jamais les photos d’origine. Effacer une séance libère
        cette place.
      </p>
    </section>
  );
}
