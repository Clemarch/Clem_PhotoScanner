import { useState } from 'react';
import {
  albumsEnabled,
  KEEP_SHORTCUT_NAME,
  KEPT_ALBUM,
  PREP_LIMIT,
  PREP_SHORTCUT_NAME,
  setAlbumsEnabled,
  SHORTCUT_NAME,
  TODO_ALBUM,
} from '../platform/shortcut';
import { IconChevron } from './icons';

/**
 * Albums « Triées » et « À trier » (utilisateur, 24/11), version la plus simple :
 * - « Photo Triage Garder » : copie de « Photo Triage » dont la dernière action range dans « Triées » au lieu de
 *   supprimer (le raccourci de suppression ne change pas) ;
 * - « Préparer le tri » : vide « À trier », puis y met les 200 photos non triées les plus récentes.
 * Voir `docs/decisions.md`, point 48.
 */
export function GuideAlbums() {
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
        Ne lancez pas ces raccourcis vous-même depuis l’app Raccourcis : c’est l’app Photo Triage qui leur envoie la liste
        des photos. Lancé seul, « {KEEP_SHORTCUT_NAME} » ne trouve rien.
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
          <li>
            Depuis iOS 27, l’iPhone bloque un raccourci qui met plus de quelques dizaines de photos dans un album (« trying
            to share … Photos items »). Une seule fois : app <strong>Réglages</strong> de l’iPhone ›{' '}
            <strong>Apps</strong> › <strong>Raccourcis</strong> › <strong>Avancé</strong>, activez{' '}
            <strong>Autoriser le partage de grandes quantités de données</strong>. Laissez éteint « Autoriser la
            suppression de grandes quantités de données » : la protection contre les suppressions reste entière.
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
              <strong>✕</strong> du bloc « <strong>Supprimer</strong> … » (Résultats de la répétition, ou A supprimer sur un raccourci plus
              ancien). Seul ce bloc est enlevé.
            </li>
            <li>
              Barre <strong>Rechercher</strong> en bas : tapez « créer un album », touchez <strong>Créer un album
              photo</strong>. Il arrive tout en bas, sous « Fin de la récurrence » : c’est la bonne place.
            </li>
            <li>
              Dans ce bloc : nom de l’album, tapez exactement <strong>{KEPT_ALBUM}</strong> ; contenu, touchez le mot bleu
              et choisissez la même variable que le bloc enlevé (<strong>Résultats de la répétition</strong>, ou A supprimer).
              Touchez <strong>OK</strong>.
            </li>
          </ol>
          <p className="note">
            Dans cette copie, rien n’est supprimé : les photos sont rangées. Si l’album existe déjà, «
            Créer un album photo » y ajoute les photos, sans copie. N’utilisez pas « Enregistrer dans l’album photo » : elle
            copierait chaque photo.
          </p>
          <p className="note">
            <strong>Photos en double ?</strong> (27/11) Ouvrez « {KEEP_SHORTCUT_NAME} » et regardez le dernier bloc, tout en
            bas : il doit s’appeler <strong>Créer un album photo</strong>. S’il s’appelle « Enregistrer dans l’album photo »,
            supprimez-le (croix ✕) et refaites l’étape précédente. Pour nettoyer : app Photos › <strong>Albums</strong> ›
            descendez jusqu’à <strong>Doublons</strong> › <strong>Fusionner</strong> (iOS garde la meilleure version et ses
            albums). Depuis le 27/11, l’app n’envoie plus jamais deux fois la même photo vers « {KEPT_ALBUM} ».
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
          <strong>Utiliser les albums</strong>
          <span className="note bloc">
            L’accueil propose alors « Préparer le prochain tri » : il range les photos gardées et remplit « {TODO_ALBUM} »
            d’un seul toucher.
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

    </>
  );
}
