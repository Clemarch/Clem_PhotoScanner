import { useEffect, useState } from 'react';
import { photoKey, type ChoiceRecord, type MediaItem } from '../engine';
import { plural } from './format';
import { listSessions, loadSessionItems } from '../platform/storage/sessionStore';
import {
  albumsEnabled,
  KEPT_ALBUM,
  KEPT_BATCH,
  PREP_LIMIT,
  runKeepThenPrep,
  shortcutCount,
  TODO_ALBUM,
  type ShortcutPhoto,
} from '../platform/shortcut';

/** Photo telle que le raccourci la cherche : nom et instant de prise de vue. */
export const asPhoto = (item: MediaItem): ShortcutPhoto => ({ fileName: item.fileName, at: item.instant ?? item.capturedAt });
/** Le raccourci retrouve la photo (nom et heure connus) ? */
export const findable = (item: MediaItem): boolean => shortcutCount([asPhoto(item)]) === 1;

// Séances terminées dont les photos gardées sont déjà parties vers « Triées ».
const RANGED_KEY = 'photo-triage.seances-rangees';
function loadRanged(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(RANGED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveRanged(ids: Set<string>): void {
  try {
    localStorage.setItem(RANGED_KEY, JSON.stringify([...ids]));
  } catch {
    // Mémoire seulement.
  }
}

interface Pending {
  photos: ShortcutPhoto[];
  sessionIds: string[];
}

/**
 * Photos gardées des séances terminées, pas encore rangées : toutes leurs photos datées, sauf celles que vous avez
 * supprimées (à la fin d'une séance, chaque photo a un choix, explicite ou accord silencieux).
 */
async function pendingKept(records: ChoiceRecord[], include?: string): Promise<Pending> {
  const removed = new Set(records.filter((r) => r.choice === 'supprimer').map((r) => r.key));
  const ranged = loadRanged();
  const seen = new Set<string>();
  const photos: ShortcutPhoto[] = [];
  const sessionIds: string[] = [];
  for (const s of await listSessions()) {
    // `include` : séance qui vient de se terminer (sa clôture est peut-être encore en cours d'écriture).
    if ((!s.closedAt && s.sessionId !== include) || ranged.has(s.sessionId)) continue;
    sessionIds.push(s.sessionId);
    for (const item of await loadSessionItems(s.sessionId)) {
      const key = photoKey(item);
      if (removed.has(key) || seen.has(key) || !findable(item)) continue;
      seen.add(key);
      photos.push(asPhoto(item));
    }
  }
  return { photos, sessionIds };
}

/**
 * « Prochain tri » (utilisateur, 25/11 : tout doit se faire depuis l'app, d'un toucher) : range les photos gardées
 * des séances terminées dans « Triées », puis remplit « À trier » avec les photos pas encore triées les plus récentes.
 * Un seul bouton ; l'app Raccourcis s'ouvre, enchaîne les deux raccourcis, puis on revient par « ◀ ».
 */
export function ProchainTri({ records, include }: { records: ChoiceRecord[]; include?: string }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [batch, setBatch] = useState(0);
  const [launched, setLaunched] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    void pendingKept(records, include).then((p) => alive && setPending(p));
    return () => {
      alive = false;
    };
  }, [records, include, reload]);
  if (!albumsEnabled() || !pending) return null;

  const n = pending.photos.length;
  const batches = Math.max(1, Math.ceil(n / KEPT_BATCH));
  const go = () => {
    runKeepThenPrep(pending.photos.slice(batch * KEPT_BATCH, (batch + 1) * KEPT_BATCH));
    setLaunched(true);
    if (batch + 1 >= batches) {
      // Rangement envoyé : ces séances ne seront plus reproposées.
      saveRanged(new Set([...loadRanged(), ...pending.sessionIds]));
    } else setBatch((b) => b + 1);
  };
  const last = batch + 1 >= batches;

  return (
    <section className="groupe prochain-tri">
      <strong>Prochain tri</strong>
      <span className="note bloc">
        {n > 0
          ? `Un toucher : vos ${plural(n, 'photo')} gardée${n > 1 ? 's' : ''} rejoignent l’album « ${KEPT_ALBUM} », puis l’album « ${TODO_ALBUM} » se remplit avec les ${PREP_LIMIT} photos pas encore triées les plus récentes.`
          : `Un toucher : l’album « ${TODO_ALBUM} » se remplit avec les ${PREP_LIMIT} photos pas encore triées les plus récentes.`}
      </span>
      <button className="bouton grand" onClick={go}>
        {batches > 1 && !launched ? `Préparer le prochain tri (1 sur ${batches})` : batches > 1 && !last ? `Continuer (${batch + 1} sur ${batches})` : 'Préparer le prochain tri'}
      </button>
      {launched && (
        <span className="note bloc">
          L’app Raccourcis s’en occupe (quelques secondes). Revenez ensuite par « ◀ Photo Triage » en haut à gauche,
          touchez « Choisir les photos », puis l’album « {TODO_ALBUM} ». Pour en choisir plusieurs, posez le doigt sur la
          photo la plus à droite et glissez vers la gauche, puis vers le bas (vers la droite, iOS referme l’album).
        </span>
      )}
      {(launched || n === 0) && (
        <button
          className="lien"
          onClick={() => {
            // Rangement refusé par l'iPhone (25/11) : les séances redeviennent à ranger.
            saveRanged(new Set());
            setLaunched(false);
            setBatch(0);
            setReload((r) => r + 1);
          }}
        >
          Le raccourci a affiché une erreur ? Tout ranger à nouveau
        </button>
      )}
    </section>
  );
}
