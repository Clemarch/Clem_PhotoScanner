import { useEffect, useState } from 'react';
import { uncovered, type MediaItem, type Span } from '../engine';
import { formatDate, formatShortTime } from './format';
import { listSessions } from '../platform/storage/sessionStore';
import { PREP_LIMIT, PREP_SHORTCUT_NAME, runPrepShortcut, shortcutCount, TODO_ALBUM, type ShortcutPhoto } from '../platform/shortcut';

/** Photo telle que le raccourci la cherche : nom et instant de prise de vue. */
export const asPhoto = (item: MediaItem): ShortcutPhoto => ({ fileName: item.fileName, at: item.instant ?? item.capturedAt });
/** Le raccourci retrouve la photo (nom et heure connus) ? */
export const findable = (item: MediaItem): boolean => shortcutCount([asPhoto(item)]) === 1;

const when = (at: number) => `${formatDate(at)} à ${formatShortTime(at)}`;

/** Une période à choisir, dite simplement. */
function spanText(s: Span, now: number): string {
  if (!Number.isFinite(s.start)) return `prises avant le ${when(s.end)}`;
  if (now - s.end < 60 * 60 * 1000) return `prises après le ${when(s.start)}`;
  return `prises entre le ${when(s.start)} et le ${when(s.end)}`;
}

/**
 * « Prochain tri » (points 70, 71) : l'app sait quelles périodes ses séances ont couvertes et dit lesquelles restent à
 * trier, la plus récente d'abord. Un toucher envoie cette période à « Préparer le tri », qui copie au plus
 * `PREP_LIMIT` photos dans « À trier » et supprime les originales (confirmation d'iOS) : un seul exemplaire de chaque
 * photo, et un album qui ne contient que des photos jamais triées.
 */
export function ProchainTri() {
  const [gaps, setGaps] = useState<Span[] | null>(null);
  const [now] = useState(() => Date.now());
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    let alive = true;
    void listSessions().then((list) => {
      const spans = list.flatMap((s) => (s.firstAt !== null && s.lastAt !== null ? [{ start: s.firstAt, end: s.lastAt }] : []));
      if (alive) setGaps(spans.length ? uncovered(spans, now) : null);
    });
    return () => {
      alive = false;
    };
  }, [now]);
  if (!gaps || gaps.length === 0) return null;
  const [next, ...older] = gaps;
  const oldest = older[older.length - 1];
  return (
    <section className="groupe prochain-tri">
      <strong>Prochain tri</strong>
      <span className="note bloc">
        Photos à trier en premier : <strong>{spanText(next!, now)}</strong>. Un toucher les met dans l’album « {TODO_ALBUM} »
        ({PREP_LIMIT} au plus, les plus récentes d’abord).
      </span>
      <button
        className="bouton grand"
        onClick={() => {
          // Période jusqu'à maintenant pour la plus récente (photos prises depuis l'ouverture de l'accueil comprises).
          runPrepShortcut({ start: next!.start, end: Number.isFinite(next!.end) && now - next!.end < 60 * 60 * 1000 ? Date.now() : next!.end });
          setLaunched(true);
        }}
      >
        Remplir « {TODO_ALBUM} »
      </button>
      {launched && (
        <span className="note bloc">
          L’app Raccourcis lance « {PREP_SHORTCUT_NAME} ». iOS vous demande de confirmer la suppression des photos d’origine :
          c’est normal, elles viennent d’être copiées dans « {TODO_ALBUM} ». Revenez ensuite par « ◀ Photo Triage » en haut à
          gauche, touchez « Choisir les photos », ouvrez l’album « {TODO_ALBUM} » et sélectionnez tout (doigt posé sur la
          photo la plus à droite, glissez vers la gauche puis vers le bas).
        </span>
      )}
      {older.length > 0 && (
        <span className="note bloc">
          Restent aussi : {older.length > 1 ? `${older.length - 1} période${older.length > 2 ? 's' : ''} entre deux séances, et ` : ''}
          les photos {spanText(oldest!, now)}.
        </span>
      )}
    </section>
  );
}
