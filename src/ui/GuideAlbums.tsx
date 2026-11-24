import { useState } from 'react';
import { photoKey, type ChoiceRecord } from '../engine';
import {
  albumsEnabled,
  KEPT_ALBUM,
  KEPT_BATCH,
  PREP_SHORTCUT_NAME,
  runShortcut,
  setAlbumsEnabled,
  SHORTCUT_NAME,
  TODO_ALBUM,
  type ShortcutPhoto,
} from '../platform/shortcut';
import { listSessions, loadSessionItems } from '../platform/storage/sessionStore';
import { plural } from './format';
import { IconChevron } from './icons';

/**
 * Albums « Triées » et « À trier » (utilisateur, 24/11) : les photos gardées vont dans « Triées » à l'envoi au
 * raccourci ; « Préparer le tri » remplit « À trier » avec les 2 semaines les plus récentes qui ont encore des photos
 * non triées (en reculant de 2 semaines en 2 semaines, sur 1 an au plus). Voir `docs/decisions.md`, point 48.
 */
export function GuideAlbums({ records }: { records: ChoiceRecord[] }) {
  const [on, setOn] = useState(albumsEnabled);
  const [shown, setShown] = useState<'' | 'maj' | 'prep'>('');
  const toggle = (which: 'maj' | 'prep') => setShown((v) => (v === which ? '' : which));

  return (
    <>
      <p className="note">
        Pour retrouver vos photos à trier sans réfléchir : les photos gardées vont dans un album « {KEPT_ALBUM} », et un
        second raccourci remplit un album « {TODO_ALBUM} » avec les photos pas encore triées (les 2 semaines les plus
        récentes qui en ont).
      </p>

      <button className={`titre-aide${shown === 'maj' ? ' ouvert' : ''}`} onClick={() => toggle('maj')} aria-expanded={shown === 'maj'}>
        <span>1. Mettre à jour « {SHORTCUT_NAME} » (une seule fois)</span>
        <IconChevron size={14} className="chevron" />
      </button>
      {shown === 'maj' && (
        <>
          <ol className="etapes">
            <li>
              Dans l’app <strong>Photos</strong> : onglet <strong>Albums</strong> (ou faites défiler jusqu’à « Albums »),
              touchez <strong>+</strong>, <strong>Nouvel album</strong>, nommez-le <strong>{KEPT_ALBUM}</strong>. Faites de
              même pour <strong>{TODO_ALBUM}</strong>. Pas besoin d’y mettre de photos.
            </li>
            <li>
              App <strong>Raccourcis</strong> : touchez les <strong>…</strong> du raccourci « {SHORTCUT_NAME} » pour
              l’ouvrir.
            </li>
            <li>
              Bloc qui donne la variable <strong>Fin</strong> : touchez <strong>Dernier élément</strong> et choisissez{' '}
              <strong>Élément à l’index</strong>, puis tapez <strong>3</strong>.
            </li>
            <li>
              Juste sous « Rechercher Photos » : supprimez le bloc « Ajouter <strong>Photos</strong> à{' '}
              <strong>A supprimer</strong> » (la croix ✕ à droite). Vous allez le remettre à l’étape 6.
            </li>
            <li>
              À sa place (toujours dans la répétition), ajoutez <strong>Si</strong>. Touchez « Entrée » et choisissez{' '}
              <strong>Élément de répétition</strong> ; condition <strong>se termine par</strong> ; texte{' '}
              <strong>|G</strong>.
            </li>
            <li>
              Entre « Si » et « Sinon » : action <strong>Ajouter à l’album</strong> (tapez « ajouter » dans la recherche).
              Touchez son premier mot bleu et choisissez <strong>Photos</strong> (le résultat de la recherche), puis
              l’album <strong>{KEPT_ALBUM}</strong>. Entre « Sinon » et « Fin si » : <strong>Ajouter à la variable</strong>{' '}
              « Ajouter <strong>Photos</strong> à <strong>A supprimer</strong> ».
            </li>
            <li>
              Sous « Fin de la répétition » : ajoutez <strong>Si</strong> « <strong>A supprimer</strong>{' '}
              <strong>a une valeur</strong> », puis faites glisser <strong>dedans</strong> (avant « Fin si ») les blocs
              « Afficher le résultat » et « Supprimer les photos ». Touchez <strong>OK</strong>.
            </li>
          </ol>
          <p className="note">
            N’utilisez pas « Enregistrer dans l’album photo » : cette action fait une copie de chaque photo. Si « Ajouter à
            l’album » n’existe pas sur votre iPhone, arrêtez-vous et dites-le à Claude.
          </p>
        </>
      )}

      <button className={`titre-aide${shown === 'prep' ? ' ouvert' : ''}`} onClick={() => toggle('prep')} aria-expanded={shown === 'prep'}>
        <span>2. Créer « {PREP_SHORTCUT_NAME} » (une seule fois)</span>
        <IconChevron size={14} className="chevron" />
      </button>
      {shown === 'prep' && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong>, touchez <strong>+</strong>, renommez-le exactement{' '}
              <strong>{PREP_SHORTCUT_NAME}</strong> (touchez le titre, puis Renommer).
            </li>
            <li>
              <strong>Rechercher des photos</strong>, un filtre : <strong>Album est {TODO_ALBUM}</strong>. Pas de limite.
            </li>
            <li>
              <strong>Si</strong> « <strong>Photos</strong> <strong>a une valeur</strong> ». Dedans :{' '}
              <strong>Supprimer de l’album photo</strong> « <strong>Photos</strong> de <strong>{TODO_ALBUM}</strong> ».
              Cette action retire seulement les photos de l’album : elles restent dans votre photothèque.
            </li>
            <li>
              Sous « Fin si » : <strong>Répéter</strong>, touchez « 1 fois » et mettez <strong>26</strong> (26 fois 2
              semaines : 1 an). Les blocs suivants, jusqu’à l’étape 9, vont <strong>dans</strong> la répétition.
            </li>
            <li>
              <strong>Calculer</strong> : « <strong>Index de répétition</strong> × <strong>14</strong> ».
            </li>
            <li>
              <strong>Ajuster la date</strong> : « <strong>Soustraire</strong> <strong>Résultat du calcul</strong>{' '}
              <strong>jours</strong> de <strong>Date actuelle</strong> ». Puis <strong>Définir la variable</strong>{' '}
              <strong>Début</strong>.
            </li>
            <li>
              <strong>Ajuster la date</strong> : « <strong>Ajouter</strong> <strong>14</strong> <strong>jours</strong> à{' '}
              <strong>Début</strong> ». Puis <strong>Définir la variable</strong> <strong>Fin</strong>.
            </li>
            <li>
              <strong>Rechercher des photos</strong> (« lorsque <strong>l’ensemble</strong> des éléments suivants sont
              vrais »), filtres : <strong>Date de création est entre</strong> Début et Fin ; <strong>Album n’est pas{' '}
              {KEPT_ALBUM}</strong> ; <strong>Type de média est Image</strong> ; et, s’il est proposé,{' '}
              <strong>Est une capture d’écran</strong> désactivé. Pas de limite.
            </li>
            <li>
              <strong>Si</strong> « <strong>Photos</strong> <strong>a une valeur</strong> ». Dedans :{' '}
              <strong>Ajouter à l’album</strong> « <strong>Photos</strong> à <strong>{TODO_ALBUM}</strong> », puis{' '}
              <strong>Arrêter ce raccourci</strong>.
            </li>
            <li>
              Sous « Fin de la répétition » : <strong>Afficher l’alerte</strong> « Tout est trié sur l’année écoulée ».
              Touchez <strong>OK</strong>.
            </li>
          </ol>
          <p className="note">
            Il prend les 2 dernières semaines ; si elles sont déjà triées, les 2 semaines d’avant, et ainsi de suite. Une
            photo qui revient sans cesse dans « {TODO_ALBUM} » (photo sans date, par exemple) : ajoutez-la vous-même à
            « {KEPT_ALBUM} » (appui long sur la photo, « Ajouter à l’album »).
          </p>
        </>
      )}

      <label className="ligne-reglage">
        <span>
          <strong>Mes raccourcis sont prêts</strong>
          <span className="note bloc">
            Les photos gardées partent alors vers « {KEPT_ALBUM} », et l’accueil propose « {PREP_SHORTCUT_NAME} ».
          </span>
        </span>
        <input
          className="interrupteur"
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setAlbumsEnabled(e.target.checked);
            setOn(e.target.checked);
          }}
        />
      </label>

      {on && <AnciennesSeances records={records} />}
    </>
  );
}

/**
 * Photos triées avant les albums : celles des séances terminées (tout envoyé à la suppression), sauf celles que vous
 * avez supprimées, partent vers « Triées » par lots.
 */
function AnciennesSeances({ records }: { records: ChoiceRecord[] }) {
  const [photos, setPhotos] = useState<ShortcutPhoto[] | null>(null);
  const [open, setOpen] = useState(0);
  const [batch, setBatch] = useState(0);
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    setBusy(true);
    const removed = new Set(records.filter((r) => r.choice === 'supprimer').map((r) => r.key));
    const sessions = await listSessions();
    const seen = new Set<string>();
    const list: ShortcutPhoto[] = [];
    for (const s of sessions) {
      if (!s.closedAt) continue;
      for (const item of await loadSessionItems(s.sessionId)) {
        const at = item.instant ?? item.capturedAt;
        const key = photoKey(item);
        if (at === null || removed.has(key) || seen.has(key)) continue;
        seen.add(key);
        list.push({ fileName: item.fileName, at });
      }
    }
    setOpen(sessions.filter((s) => !s.closedAt).length);
    setPhotos(list);
    setBatch(0);
    setBusy(false);
  };

  if (!photos)
    return (
      <div className="albums-actions">
        <p className="note">Vos photos déjà triées avant les albums peuvent rejoindre « {KEPT_ALBUM} » en une fois.</p>
        <button className="bouton" disabled={busy} onClick={() => void prepare()}>
          {busy ? 'Recherche…' : `Ranger mes anciennes photos triées`}
        </button>
      </div>
    );

  const batches = Math.ceil(photos.length / KEPT_BATCH);
  return (
    <div className="albums-actions">
      <p className="note">
        {photos.length === 0
          ? 'Aucune photo gardée dans vos séances terminées.'
          : `${plural(photos.length, 'photo')} gardée${photos.length > 1 ? 's' : ''} dans vos séances terminées.`}
        {open > 0 && ` ${plural(open, 'séance')} pas encore terminée${open > 1 ? 's' : ''} : ses photos partiront à la suppression.`}
      </p>
      {batch < batches ? (
        <button
          className="bouton principal"
          onClick={() => {
            runShortcut([], photos.slice(batch * KEPT_BATCH, (batch + 1) * KEPT_BATCH));
            setBatch((b) => b + 1);
          }}
        >
          {batches > 1 ? `Envoyer le lot ${batch + 1} sur ${batches}` : `Ranger ${plural(photos.length, 'photo')} dans « ${KEPT_ALBUM} »`}
        </button>
      ) : (
        photos.length > 0 && <p className="note">Envoyé. Revenez ici si un lot a échoué : rouvrez Réglages pour recommencer.</p>
      )}
    </div>
  );
}
