import { useState } from 'react';
import { photoKey, type ChoiceRecord } from '../engine';
import {
  albumsEnabled,
  KEEP_SHORTCUT_NAME,
  KEPT_ALBUM,
  KEPT_BATCH,
  PREP_LIMIT,
  PREP_SHORTCUT_NAME,
  runKeepShortcut,
  setAlbumsEnabled,
  SHORTCUT_NAME,
  TODO_ALBUM,
  type ShortcutPhoto,
} from '../platform/shortcut';
import { listSessions, loadSessionItems } from '../platform/storage/sessionStore';
import { plural } from './format';
import { IconChevron } from './icons';

/**
 * Albums « Triées » et « À trier » (utilisateur, 24/11), version la plus simple :
 * - « Photo Triage Garder » : copie de « Photo Triage » dont la dernière action range dans « Triées » au lieu de
 *   supprimer (le raccourci de suppression ne change pas) ;
 * - « Préparer le tri » : vide « À trier », puis y met les 200 photos non triées les plus récentes.
 * Voir `docs/decisions.md`, point 48.
 */
export function GuideAlbums({ records }: { records: ChoiceRecord[] }) {
  const [on, setOn] = useState(albumsEnabled);
  const [shown, setShown] = useState<'' | 'albums' | 'garder' | 'prep'>('');
  const toggle = (which: 'albums' | 'garder' | 'prep') => setShown((v) => (v === which ? '' : which));
  const titre = (which: 'albums' | 'garder' | 'prep', text: string) => (
    <button className={`titre-aide${shown === which ? ' ouvert' : ''}`} onClick={() => toggle(which)} aria-expanded={shown === which}>
      <span>{text}</span>
      <IconChevron size={14} className="chevron" />
    </button>
  );

  return (
    <>
      <p className="note">
        Les photos gardées vont dans un album « {KEPT_ALBUM} » ; un raccourci remplit un album « {TODO_ALBUM} » avec les
        photos pas encore triées, les plus récentes d’abord. Votre raccourci « {SHORTCUT_NAME} » ne change pas.
      </p>
      <p className="note">
        Dans l’app Raccourcis, une action ajoutée arrive tout en bas, à la suite : ajoutez-les dans l’ordre indiqué. Un{' '}
        <strong>mot bleu</strong> se touche pour être changé.
      </p>

      {titre('albums', '1. Créer les deux albums (une seule fois)')}
      {shown === 'albums' && (
        <ol className="etapes">
          <li>
            Ouvrez l’app <strong>Photos</strong>, faites défiler jusqu’à la rubrique <strong>Albums</strong> (sur
            certaines versions : onglet <strong>Collections</strong>).
          </li>
          <li>
            Touchez <strong>+</strong> (ou « Voir tout » puis <strong>+</strong>), puis <strong>Nouvel album</strong>.
          </li>
          <li>
            Nommez-le exactement <strong>{KEPT_ALBUM}</strong> (é accentué), touchez <strong>Enregistrer</strong>. Si
            Photos propose de choisir des photos, touchez <strong>OK</strong> sans en choisir.
          </li>
          <li>
            Recommencez pour <strong>{TODO_ALBUM}</strong> (« À » avec accent).
          </li>
        </ol>
      )}

      {titre('garder', `2. Créer « ${KEEP_SHORTCUT_NAME} » (une seule fois)`)}
      {shown === 'garder' && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong>, onglet <strong>Raccourcis</strong> : appui long sur « {SHORTCUT_NAME} »,
              puis <strong>Dupliquer</strong>. Une copie apparaît (« {SHORTCUT_NAME} 1 »).
            </li>
            <li>
              Appui long sur la copie, <strong>Renommer</strong>, tapez exactement <strong>{KEEP_SHORTCUT_NAME}</strong>.
            </li>
            <li>
              Ouvrez-la (touchez les <strong>…</strong>), faites défiler tout en bas et touchez la croix{' '}
              <strong>✕</strong> du bloc « <strong>Supprimer</strong> A supprimer ». Seul ce bloc est enlevé.
            </li>
            <li>
              Barre <strong>Rechercher</strong> en bas : tapez « créer un album », touchez <strong>Créer un album
              photo</strong>. Il arrive tout en bas, sous « Fin de la récurrence » : c’est la bonne place.
            </li>
            <li>
              Dans ce bloc : nom de l’album, tapez exactement <strong>{KEPT_ALBUM}</strong> ; contenu, touchez le mot bleu
              et choisissez la variable <strong>A supprimer</strong>. Touchez <strong>OK</strong>.
            </li>
          </ol>
          <p className="note">
            Le nom « A supprimer » reste, mais dans cette copie il ne supprime rien : il range. Si l’album existe déjà, «
            Créer un album photo » y ajoute les photos, sans copie. N’utilisez pas « Enregistrer dans l’album photo » : elle
            copierait chaque photo.
          </p>
        </>
      )}

      {titre('prep', `3. Créer « ${PREP_SHORTCUT_NAME} » (une seule fois)`)}
      {shown === 'prep' && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong>, touchez <strong>+</strong> en haut à droite. Touchez le titre,{' '}
              <strong>Renommer</strong>, tapez exactement <strong>{PREP_SHORTCUT_NAME}</strong>.
            </li>
            <li>
              Ajoutez <strong>Rechercher des photos</strong>. Touchez <strong>Ajouter un filtre</strong>, puis le premier
              mot bleu : <strong>Album</strong> ; laissez « est » ; dernier mot bleu : <strong>{TODO_ALBUM}</strong>.
            </li>
            <li>
              Ajoutez <strong>Si</strong> : Entrée <strong>Photos</strong>, condition <strong>a une valeur</strong>.
            </li>
            <li>
              Ajoutez <strong>Supprimer de l’album photo</strong>, puis faites-le glisser entre <strong>Si</strong> et{' '}
              <strong>Sinon</strong>. Contenu : <strong>Photos</strong> ; album : <strong>{TODO_ALBUM}</strong>. Il
              retire seulement les photos de l’album, sans les supprimer.
            </li>
            <li>
              Ajoutez <strong>Rechercher des photos</strong> (il arrive sous « Fin si »). Filtres :{' '}
              <strong>Album n’est pas {KEPT_ALBUM}</strong> ; <strong>Type de média est Image</strong> ; s’il est proposé,{' '}
              <strong>Est une capture d’écran</strong> éteint. <strong>Trier par</strong> : Date de création, la plus
              récente d’abord. <strong>Limite</strong> : activée, <strong>{PREP_LIMIT}</strong>.
            </li>
            <li>
              Ajoutez <strong>Créer un album photo</strong> : nom <strong>{TODO_ALBUM}</strong>, contenu{' '}
              <strong>Photos</strong> (celles de la dernière recherche). Touchez <strong>OK</strong>.
            </li>
          </ol>
          <p className="note">
            Piège fréquent : si le bloc de l’étape 5 affiche « <strong>Filtrer</strong> Résultat de la condition » au lieu
            de « Rechercher Photos », touchez « Résultat de la condition », puis <strong>Effacer</strong>.
          </p>
          <p className="note">
            Résultat : Rechercher (Album est {TODO_ALBUM}) · Si → Supprimer de l’album · Fin si · Rechercher (pas dans «{' '}
            {KEPT_ALBUM} », {PREP_LIMIT} plus récentes) · Créer un album photo « {TODO_ALBUM} ». Une photo qui revient sans
            cesse (photo sans date, par exemple) : ajoutez-la vous-même à « {KEPT_ALBUM} » (appui long sur la photo,
            « Ajouter à l’album »).
          </p>
        </>
      )}

      <label className="ligne-reglage">
        <span>
          <strong>Mes raccourcis sont prêts</strong>
          <span className="note bloc">
            L’onglet Supprimer propose alors de ranger les photos gardées, et l’accueil « {PREP_SHORTCUT_NAME} ».
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
            runKeepShortcut(photos.slice(batch * KEPT_BATCH, (batch + 1) * KEPT_BATCH));
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
