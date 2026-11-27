import { useEffect, useState } from 'react';
import { uncovered, type MediaItem, type Span } from '../engine';
import { formatDate, formatShortTime } from './format';
import { listSessions } from '../platform/storage/sessionStore';
import { shortcutCount, type ShortcutPhoto } from '../platform/shortcut';

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
 * « Prochain tri » sans albums (27/11, point 70 : le bloc « Créer un album photo » de l'app Raccourcis enregistre une
 * copie de chaque photo ; les albums « À trier » et « Triées » avaient mis 2 copies de chaque photo triée). L'app sait
 * quelles périodes ses séances ont couvertes : elle dit lesquelles restent à trier, la plus récente d'abord.
 */
export function ProchainTri() {
  const [gaps, setGaps] = useState<Span[] | null>(null);
  const [now] = useState(() => Date.now());
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
        Touchez « Choisir les photos », puis choisissez les photos <strong>{spanText(next!, now)}</strong> (au plus 200 à la
        fois : l’analyse reste rapide).
      </span>
      {older.length > 0 && (
        <span className="note bloc">
          Restent aussi : {older.length > 1 ? `${older.length - 1} période${older.length > 2 ? 's' : ''} entre deux séances, et ` : ''}
          les photos {spanText(oldest!, now)}.
        </span>
      )}
    </section>
  );
}
