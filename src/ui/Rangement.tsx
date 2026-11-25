import { useState } from 'react';
import type { DayAnalysis, MediaItem } from '../engine';
import type { Session } from './session';
import { finalKeep, type Choices } from './choices';
import { plural } from './format';
import {
  albumsEnabled,
  KEPT_ALBUM,
  KEPT_BATCH,
  PREP_SHORTCUT_NAME,
  runKeepShortcut,
  runPrepShortcut,
  shortcutCount,
  TODO_ALBUM,
  type ShortcutPhoto,
} from '../platform/shortcut';

/** Photo telle que le raccourci la cherche : nom et instant de prise de vue. */
export const asPhoto = (item: MediaItem): ShortcutPhoto => ({ fileName: item.fileName, at: item.instant ?? item.capturedAt });
/** Le raccourci retrouve la photo (nom et heure connus) ? */
export const findable = (item: MediaItem): boolean => shortcutCount([asPhoto(item)]) === 1;

/** Photos gardées de la séance : tout sauf ce qui part à la suppression (photos illisibles exclues : elles reviendront). */
export function keptPhotosOf(session: Session, day: DayAnalysis, choices: Choices): ShortcutPhoto[] {
  const removeIds = new Set(day.packs.flatMap((pack) => pack.pack.items.filter((it) => !finalKeep(it, pack, choices).keep).map((it) => it.id)));
  return session.results.filter((r) => !r.diagnostic.error && !removeIds.has(r.item.id) && findable(r.item)).map((r) => asPhoto(r.item));
}

// Séance dont les photos gardées sont déjà parties vers l'album « Triées » (survit au changement d'écran).
const KEPT_KEY = 'photo-triage.triees-envoyees';
function keptSentFor(): string | null {
  try {
    return localStorage.getItem(KEPT_KEY);
  } catch {
    return null;
  }
}
function saveKeptSent(sessionId: string | null): void {
  try {
    if (sessionId) localStorage.setItem(KEPT_KEY, sessionId);
    else localStorage.removeItem(KEPT_KEY);
  } catch {
    // Mémoire seulement.
  }
}

/** Ranger les photos gardées de la séance dans « Triées » (raccourci « Photo Triage Garder »), par lots de 150. */
export function RangerTriees({ session, photos }: { session: Session; photos: ShortcutPhoto[] }) {
  const [sent, setSentState] = useState(() => keptSentFor() === session.id);
  const [batch, setBatch] = useState(0);
  const setSent = (on: boolean) => {
    setSentState(on);
    saveKeptSent(on ? session.id : null);
  };
  if (photos.length === 0) return null;
  const batches = Math.ceil(photos.length / KEPT_BATCH);
  const n = photos.length;
  const s = n > 1 ? 's' : '';
  return (
    <div className="albums-etape">
      <strong>Ranger les photos gardées dans « {KEPT_ALBUM} »</strong>
      <span className="note bloc">
        {sent
          ? `C’est fait : les ${plural(n, 'photo')} gardée${s} sont parties vers « ${KEPT_ALBUM} ».`
          : `${plural(n, 'photo')} gardée${s} : une fois rangée${s}, elle${s} ne reviendr${n > 1 ? 'ont' : 'a'} plus dans « ${TODO_ALBUM} ». Rien n’est supprimé.`}
      </span>
      {sent ? (
        <button
          className="lien"
          onClick={() => {
            setBatch(0);
            setSent(false);
          }}
        >
          Ranger à nouveau
        </button>
      ) : (
        <button
          className="bouton principal"
          onClick={() => {
            runKeepShortcut(photos.slice(batch * KEPT_BATCH, (batch + 1) * KEPT_BATCH));
            if (batch + 1 >= batches) setSent(true);
            else setBatch((b) => b + 1);
          }}
        >
          {batches > 1 ? `Ranger le lot ${batch + 1} sur ${batches}` : `Ranger dans « ${KEPT_ALBUM} »`}
        </button>
      )}
    </div>
  );
}

/**
 * Fin de séance, avec les albums (utilisateur, 25/11 : « Comment est-ce que je mets à jour les albums ? ») : ranger les
 * gardées, puis préparer « À trier » pour la prochaine fois. Rien si les raccourcis des albums ne sont pas prêts.
 */
export function EtapesAlbums({ session, day, choices }: { session: Session; day: DayAnalysis; choices: Choices }) {
  if (!albumsEnabled()) return null;
  return (
    <section className="groupe albums-etapes">
      <h3>Pour la prochaine séance</h3>
      <RangerTriees session={session} photos={keptPhotosOf(session, day, choices)} />
      <div className="albums-etape">
        <strong>Préparer l’album « {TODO_ALBUM} »</strong>
        <span className="note bloc">
          À faire après avoir rangé : « {PREP_SHORTCUT_NAME} » met dans « {TODO_ALBUM} » les 200 photos pas encore triées
          les plus récentes (vos dernières photos d’abord). Revenez ensuite ici (« ◀ » en haut à gauche).
        </span>
        <button className="bouton" onClick={runPrepShortcut}>
          Préparer « {TODO_ALBUM} »
        </button>
      </div>
    </section>
  );
}
