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
  const [shown, setShown] = useState<'' | 'albums' | 'maj' | 'prep'>('');
  const toggle = (which: 'albums' | 'maj' | 'prep') => setShown((v) => (v === which ? '' : which));

  return (
    <>
      <p className="note">
        Pour retrouver vos photos à trier sans réfléchir : les photos gardées vont dans un album « {KEPT_ALBUM} », et un
        second raccourci remplit un album « {TODO_ALBUM} » avec les photos pas encore triées (les 2 semaines les plus
        récentes qui en ont).
      </p>

      <p className="note">
        À savoir dans l’app Raccourcis : une action ajoutée depuis la recherche arrive <strong>tout en bas</strong>.
        Maintenez-la appuyée puis faites-la glisser à l’endroit indiqué. Un <strong>mot bleu</strong> se touche pour être
        changé ; pour y mettre une variable, touchez-le puis choisissez-la dans la liste (ou appui long, « Sélectionner
        la variable »).
      </p>

      <button className={`titre-aide${shown === 'albums' ? ' ouvert' : ''}`} onClick={() => toggle('albums')} aria-expanded={shown === 'albums'}>
        <span>1. Créer les deux albums (une seule fois)</span>
        <IconChevron size={14} className="chevron" />
      </button>
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
            Nommez-le exactement <strong>{KEPT_ALBUM}</strong> (T majuscule, é accentué), touchez{' '}
            <strong>Enregistrer</strong>. Si Photos propose de choisir des photos, touchez <strong>OK</strong> sans en
            choisir.
          </li>
          <li>
            Recommencez pour <strong>{TODO_ALBUM}</strong> (A majuscule avec accent : « À »).
          </li>
        </ol>
      )}

      <button className={`titre-aide${shown === 'maj' ? ' ouvert' : ''}`} onClick={() => toggle('maj')} aria-expanded={shown === 'maj'}>
        <span>2. Mettre à jour « {SHORTCUT_NAME} » (une seule fois)</span>
        <IconChevron size={14} className="chevron" />
      </button>
      {shown === 'maj' && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong>, onglet <strong>Raccourcis</strong> : appui long sur «{' '}
              {SHORTCUT_NAME} », puis <strong>Modifier</strong>.
            </li>
            <li>
              Dans le bloc <strong>Rechercher Photos</strong> : s’il reste un filtre « Album n’est pas Choisir » (essai
              d’hier), touchez le <strong>⊖</strong> à sa droite pour l’enlever. Il ne doit rester que « Date de création
              est entre Début et Fin » et « Nom est Nom photo ».
            </li>
            <li>
              Juste au-dessus de « Définir la variable <strong>Fin</strong> » : le bloc « Obtenir{' '}
              <strong>Dernier élément</strong> de Texte scindé ». Touchez <strong>Dernier élément</strong>, choisissez{' '}
              <strong>Élément à l’index</strong>, touchez le chiffre apparu et tapez <strong>3</strong>.
            </li>
            <li>
              En bas, barre <strong>Rechercher</strong> : tapez « si » et touchez l’action <strong>Si</strong>. Elle
              arrive en bas avec « Sinon » et « Fin si ». Faites glisser la ligne <strong>Si</strong> juste sous le bloc
              « Ajouter Photos à A supprimer », donc encore <strong>au-dessus</strong> de « Fin de la répétition ».
            </li>
            <li>
              Dans « Si » : touchez <strong>Entrée</strong>, choisissez <strong>Élément de répétition</strong>.
              Touchez <strong>Condition</strong>, choisissez <strong>se termine par</strong>. Touchez <strong>Texte</strong>{' '}
              et tapez <strong>|G</strong> (« | » : touches 123, puis #+=).
            </li>
            <li>
              Faites glisser le bloc « Ajouter <strong>Photos</strong> à <strong>A supprimer</strong> » entre{' '}
              <strong>Sinon</strong> et <strong>Fin si</strong>.
            </li>
            <li>
              Barre Rechercher : tapez « créer un album » et touchez <strong>Créer un album photo</strong>. Faites-le
              glisser entre <strong>Si</strong> et <strong>Sinon</strong>. Touchez le nom de l’album et tapez exactement{' '}
              <strong>{KEPT_ALBUM}</strong> ; touchez le mot bleu du contenu et choisissez <strong>Photos</strong> (le
              résultat de « Rechercher Photos »). Si l’album existe déjà, les photos y sont ajoutées, sans copie.
            </li>
            <li>
              Barre Rechercher : encore <strong>Si</strong>. Faites-le glisser juste <strong>sous</strong> « Fin de la
              répétition ». Entrée : <strong>A supprimer</strong> ; condition : <strong>a une valeur</strong>.
            </li>
            <li>
              Faites glisser les blocs qui étaient sous « Fin de la répétition » (« Afficher le résultat » ou « Coup
              d’œil », puis « Supprimer les photos ») entre ce nouveau <strong>Si</strong> et son <strong>Sinon</strong>.
              Laissez « Sinon » vide.
            </li>
            <li>
              Touchez <strong>OK</strong> en haut à droite.
            </li>
          </ol>
          <p className="note">
            Résultat attendu, de haut en bas : Scinder le texte · Répéter avec chaque élément · Scinder le texte (|) ·
            Nom photo · Début · Fin (index 3) · Rechercher Photos · <strong>Si</strong> se termine par |G → Créer un album
            photo « {KEPT_ALBUM} » · <strong>Sinon</strong> → Ajouter à A supprimer · Fin si · Fin de la répétition ·{' '}
            <strong>Si</strong> A supprimer a une valeur → Afficher · Supprimer les photos · Fin si.
          </p>
          <p className="note">
            N’utilisez pas « Enregistrer dans l’album photo » : cette action fait une copie de chaque photo.
          </p>
        </>
      )}

      <button className={`titre-aide${shown === 'prep' ? ' ouvert' : ''}`} onClick={() => toggle('prep')} aria-expanded={shown === 'prep'}>
        <span>3. Créer « {PREP_SHORTCUT_NAME} » (une seule fois)</span>
        <IconChevron size={14} className="chevron" />
      </button>
      {shown === 'prep' && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong>, touchez <strong>+</strong> en haut à droite. Touchez le titre en haut,{' '}
              <strong>Renommer</strong>, tapez exactement <strong>{PREP_SHORTCUT_NAME}</strong>.
            </li>
            <li>
              Ajoutez <strong>Rechercher des photos</strong>. Touchez <strong>Ajouter un filtre</strong> ; touchez le
              premier mot bleu, choisissez <strong>Album</strong> ; laissez <strong>est</strong> ; touchez le dernier mot
              bleu, choisissez <strong>{TODO_ALBUM}</strong>. Laissez « Limite » éteint.
            </li>
            <li>
              Ajoutez <strong>Si</strong> (il se place dessous). Entrée : <strong>Photos</strong> ; condition :{' '}
              <strong>a une valeur</strong>.
            </li>
            <li>
              Ajoutez <strong>Supprimer de l’album photo</strong> et faites-le glisser entre <strong>Si</strong> et{' '}
              <strong>Sinon</strong>. Contenu : <strong>Photos</strong> ; album : <strong>{TODO_ALBUM}</strong>. Cette
              action retire seulement les photos de l’album : elles restent dans votre photothèque.
            </li>
            <li>
              Ajoutez <strong>Répéter</strong> (il doit être <strong>sous</strong> « Fin si »). Touchez « 1 fois » et
              mettez <strong>26</strong> (26 fois 2 semaines = 1 an). Les étapes 6 à 12 se placent{' '}
              <strong>entre</strong> « Répéter » et « Fin de la répétition ».
            </li>
            <li>
              Ajoutez <strong>Calculer</strong>. Premier nombre : variable <strong>Index de répétition</strong> ; touchez
              « + » et choisissez <strong>×</strong> ; second nombre : <strong>14</strong>.
            </li>
            <li>
              Ajoutez <strong>Ajuster la date</strong>. Touchez <strong>Ajouter</strong> et choisissez{' '}
              <strong>Soustraire</strong> ; nombre : variable <strong>Résultat du calcul</strong> ; unité :{' '}
              <strong>jours</strong> ; date : variable <strong>Date actuelle</strong>.
            </li>
            <li>
              Ajoutez <strong>Définir la variable</strong>, nommez-la <strong>Début</strong> (elle reçoit « Date
              ajustée »).
            </li>
            <li>
              Ajoutez <strong>Ajuster la date</strong> : laissez <strong>Ajouter</strong> ; nombre :{' '}
              <strong>14</strong> ; unité : <strong>jours</strong> ; date : variable <strong>Début</strong>. Puis{' '}
              <strong>Définir la variable</strong> <strong>Fin</strong>.
            </li>
            <li>
              Ajoutez <strong>Rechercher des photos</strong>, avec ces filtres (bouton « Ajouter un filtre » pour
              chacun) : <strong>Date de création est entre</strong> Début et Fin (appui long sur chaque date, «
              Sélectionner la variable ») ; <strong>Album n’est pas {KEPT_ALBUM}</strong> ; <strong>Type de média est
              Image</strong> ; et, s’il est proposé, <strong>Est une capture d’écran</strong> éteint. En haut du bloc :
              « lorsque <strong>l’ensemble</strong> des éléments ». Limite éteinte.
            </li>
            <li>
              Ajoutez <strong>Si</strong>. Entrée : <strong>Photos</strong> (celles de cette dernière recherche) ;
              condition : <strong>a une valeur</strong>.
            </li>
            <li>
              Entre ce <strong>Si</strong> et son <strong>Sinon</strong> : <strong>Créer un album photo</strong>{' '}
              (nom : <strong>{TODO_ALBUM}</strong> ; contenu : <strong>Photos</strong>), puis{' '}
              <strong>Arrêter ce raccourci</strong>.
            </li>
            <li>
              Tout en bas, sous « Fin de la répétition » : <strong>Afficher l’alerte</strong>, texte « Tout est trié sur
              l’année écoulée ». Touchez <strong>OK</strong> en haut à droite.
            </li>
          </ol>
          <p className="note">
            Résultat attendu : Rechercher (Album est {TODO_ALBUM}) · Si → Supprimer de l’album · Fin si · Répéter 26 fois
            → Calculer · Ajuster (Début) · Ajuster (Fin) · Rechercher · Si → Créer un album photo « {TODO_ALBUM} » ·
            Arrêter ce raccourci · Fin si · Fin de la répétition · Afficher l’alerte.
          </p>
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
