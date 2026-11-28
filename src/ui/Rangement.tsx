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
 * « Prochain tri » (points 70 à 73) : l'app sait quelles périodes ses séances ont couvertes et dit lesquelles restent
 * à trier, la plus récente d'abord, et toujours la plus ancienne. Plus de raccourci « Préparer le tri » : il ne
 * trouvait aucune photo sur l'iPhone de l'utilisateur, qui l'a abandonné (28/11).
 */
export function ProchainTri() {
  const [gaps, setGaps] = useState<Span[] | null>(null);
  const [now] = useState(() => Date.now());
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
  return (
    <section className="groupe prochain-tri">
      <strong>Prochain tri</strong>
      <span className="note bloc">
        Périodes jamais triées, la plus récente d’abord : touchez « Choisir les photos » et choisissez les photos…
      </span>
      <ul className="gouts">
        {shown.map((span, i) => (
          <li key={i}>{spanText(span, now)}</li>
        ))}
      </ul>
    </section>
  );
}
