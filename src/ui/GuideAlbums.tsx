import { KEEP_SHORTCUT_NAME, KEPT_ALBUM, PREP_SHORTCUT_NAME, SHORTCUT_NAME, TODO_ALBUM } from '../platform/shortcut';

/**
 * Albums « Triées » et « À trier » retirés (27/11, point 70). Le bloc « Créer un album photo » de l'app Raccourcis
 * enregistre une copie de chaque photo qu'on lui donne : « Préparer le tri » copiait les photos dans « À trier »,
 * « Photo Triage Garder » les copiait encore dans « Triées » (1 originale + 2 copies). Aucun bloc de Raccourcis ne
 * range une photo dans un album sans la copier. Ce guide explique le nettoyage ; le prochain tri est indiqué par l'app
 * (dates à choisir, sur l'accueil).
 */
export function GuideAlbums() {
  return (
    <>
      <p className="note">
        Les albums « {TODO_ALBUM} » et « {KEPT_ALBUM} » sont retirés : le bloc « Créer un album photo » de l’app Raccourcis
        <strong> enregistre une copie</strong> de chaque photo (sa sortie s’appelle « Fichier multimédia photo
        enregistré »). Chaque photo triée par les albums (du 21 au 25/11 environ) existe donc en 3 exemplaires. L’accueil
        vous dit maintenant quelles photos choisir pour le prochain tri. Votre raccourci « {SHORTCUT_NAME} » (suppression)
        ne change pas.
      </p>
      <ol className="etapes">
        <li>
          App <strong>Photos</strong> › <strong>Albums</strong> › descendez jusqu’à <strong>Doublons</strong> (rubrique
          Utilitaires). Touchez <strong>Sélectionner</strong>, puis <strong>Tout sélectionner</strong>, puis{' '}
          <strong>Fusionner</strong>. iOS garde un seul exemplaire de chaque photo, le meilleur, et l’ensemble de ses
          albums ; les copies partent dans « Supprimés récemment ».
        </li>
        <li>
          App <strong>Raccourcis</strong> : appui long sur « {KEEP_SHORTCUT_NAME} », <strong>Supprimer</strong> ; même chose
          pour « {PREP_SHORTCUT_NAME} ». Ils ne servent plus.
        </li>
        <li>
          Facultatif : app Photos › Albums, appui long sur « {TODO_ALBUM} » puis <strong>Supprimer l’album</strong>, même
          chose pour « {KEPT_ALBUM} ». Supprimer un album n’efface aucune photo.
        </li>
      </ol>
    </>
  );
}
