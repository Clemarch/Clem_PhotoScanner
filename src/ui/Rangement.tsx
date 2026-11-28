import { useEffect, useState } from 'react';
import { uncovered, type MediaItem, type Span } from '../engine';
import { formatDate, formatShortTime } from './format';
import { listSessions } from '../platform/storage/sessionStore';
import { PREP_LIMIT, PREP_SHORTCUT_NAME, prepText, runPrepShortcut, shortcutCount, TODO_ALBUM, type ShortcutPhoto } from '../platform/shortcut';

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
  const [launched, setLaunched] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void listSessions().then((list) => {
      const spans = list.flatMap((s) => (s.firstAt !== null && s.lastAt !== null ? [{ start: s.firstAt, end: s.lastAt }] : []));
      // Trous de moins de 3 h entre deux séances ignorés : ce sont les pauses d'une même journée de tri (28/11 : quatre
      // périodes de quelques minutes à quelques heures, toutes vides, cachaient les photos d'avant la 1re séance).
      if (alive) setGaps(spans.length ? uncovered(spans, now, 3 * 60 * 60 * 1000) : null);
    });
    return () => {
      alive = false;
    };
  }, [now]);
  if (!gaps || gaps.length === 0) return null;
  // Toutes les périodes non triées, la plus récente d'abord (28/11 : la plus récente peut être vide, par exemple
  // aucune photo prise depuis la dernière séance ; le raccourci vidait alors « À trier » sans rien y mettre).
  // Les 3 plus récentes, et toujours la plus ancienne (photos d'avant la première séance).
  const shown = gaps.length > 4 ? [...gaps.slice(0, 3), gaps[gaps.length - 1]!] : gaps;
  const sent = (span: Span) => ({ start: span.start, end: now - span.end < 60 * 60 * 1000 ? Date.now() : span.end });
  const fill = (span: Span, i: number) => {
    // Période jusqu'à maintenant pour la plus récente (photos prises depuis l'ouverture de l'accueil comprises).
    runPrepShortcut(sent(span));
    setLaunched(i);
  };
  return (
    <section className="groupe prochain-tri">
      <strong>Prochain tri</strong>
      <span className="note bloc">
        Périodes jamais triées, la plus récente d’abord. Un toucher met leurs photos dans l’album « {TODO_ALBUM} » ({PREP_LIMIT}{' '}
        au plus, les plus récentes d’abord). Si l’album reste vide, cette période n’a pas de photo : prenez la suivante.
      </span>
      {shown.map((span, i) => (
        <button key={i} className={`bouton${i === 0 ? ' grand' : ''}`} onClick={() => fill(span, i)}>
          {launched === i ? '✓ ' : ''}Photos {spanText(span, now)}
        </button>
      ))}
      {launched !== null && (
        <span className="note bloc">
          Envoyé au raccourci : <code>{prepText(sent(shown[launched]!))}</code>. L’app Raccourcis lance « {PREP_SHORTCUT_NAME} ». iOS vous demande de confirmer la suppression des photos d’origine :
          c’est normal, elles viennent d’être copiées dans « {TODO_ALBUM} ». Revenez ensuite par « ◀ Photo Triage » en haut à
          gauche, touchez « Choisir les photos », ouvrez l’album « {TODO_ALBUM} » et sélectionnez tout (doigt posé sur la
          photo la plus à droite, glissez vers la gauche puis vers le bas).
        </span>
      )}
    </section>
  );
}
