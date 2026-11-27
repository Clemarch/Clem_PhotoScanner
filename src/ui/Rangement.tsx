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

// Séances terminées dont les photos gardées sont déjà parties vers « Triées » (avant le 27/11 : suivi par séance).
const RANGED_KEY = 'photo-triage.seances-rangees';
function loadRanged(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(RANGED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Photos déjà envoyées vers « Triées », une par une (27/11, point 69 : des photos ont été envoyées plusieurs fois au
 * raccourci « Photo Triage Garder », et se sont retrouvées en double ou en triple dans la photothèque). Une photo
 * envoyée ne l'est plus jamais, même si sa séance est rouverte ou si l'on relance le rangement.
 */
const SENT_KEY = 'photo-triage.photos-rangees';
const sentKey = (p: ShortcutPhoto): string => `${p.fileName}|${p.at ?? ''}`;
function loadSent(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw === null ? null : new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function saveSent(keys: Set<string>): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify([...keys]));
  } catch {
    // Mémoire seulement.
  }
}

interface Pending {
  photos: ShortcutPhoto[];
}

/**
 * Photos gardées des séances terminées, jamais envoyées vers « Triées » : toutes leurs photos datées, sauf celles que
 * vous avez supprimées (à la fin d'une séance, chaque photo a un choix, explicite ou accord silencieux).
 */
async function pendingKept(records: ChoiceRecord[], include?: string): Promise<Pending> {
  const removed = new Set(records.filter((r) => r.choice === 'supprimer').map((r) => r.key));
  const ranged = loadRanged();
  let sent = loadSent();
  const seen = new Set<string>();
  const photos: ShortcutPhoto[] = [];
  const migrated = new Set<string>();
  for (const s of await listSessions()) {
    // `include` : séance qui vient de se terminer (sa clôture est peut-être encore en cours d'écriture).
    if (!s.closedAt && s.sessionId !== include) continue;
    for (const item of await loadSessionItems(s.sessionId)) {
      const key = photoKey(item);
      if (removed.has(key) || seen.has(key) || !findable(item)) continue;
      seen.add(key);
      const photo = asPhoto(item);
      // Première fois avec le suivi par photo : les photos des séances déjà rangées comptent comme envoyées.
      if (sent === null && ranged.has(s.sessionId)) {
        migrated.add(sentKey(photo));
        continue;
      }
      if (sent?.has(sentKey(photo)) || migrated.has(sentKey(photo))) continue;
      photos.push(photo);
    }
  }
  if (sent === null) {
    sent = migrated;
    saveSent(sent);
  }
  return { photos };
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
  const [lastLot, setLastLot] = useState<ShortcutPhoto[]>([]);
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
    const lot = pending.photos.slice(batch * KEPT_BATCH, (batch + 1) * KEPT_BATCH);
    // Marquées envoyées avant de partir : jamais renvoyées (une deuxième fois les mettrait en double).
    saveSent(new Set([...(loadSent() ?? []), ...lot.map(sentKey)]));
    setLastLot(lot);
    runKeepThenPrep(lot);
    setLaunched(true);
    if (batch + 1 < batches) setBatch((b) => b + 1);
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
      {launched && lastLot.length > 0 && (
        <button
          className="lien"
          onClick={() => {
            // Seulement si l'app Raccourcis a affiché une erreur : ce lot seul redevient à ranger (jamais tout).
            if (!window.confirm(`Renvoyer seulement ce lot (${plural(lastLot.length, 'photo')}) ? À faire uniquement si l’app Raccourcis a affiché une erreur : sinon ces photos sont déjà rangées.`)) return;
            const sent = loadSent() ?? new Set<string>();
            for (const p of lastLot) sent.delete(sentKey(p));
            saveSent(sent);
            setLastLot([]);
            setLaunched(false);
            setBatch(0);
            setReload((r) => r + 1);
          }}
        >
          Le raccourci a affiché une erreur ? Renvoyer ce lot
        </button>
      )}
    </section>
  );
}
