import { KEEP_SHORTCUT_NAME, KEPT_ALBUM, PREP_SHORTCUT_NAME, SHORTCUT_NAME, TODO_ALBUM } from '../platform/shortcut';

/**
 * Albums abandonnés (points 70 à 73). « Créer un album photo » (Raccourcis) copie chaque photo ; « Préparer le tri »
 * refait (copie puis suppression des originales) ne trouvait aucune photo sur l'iPhone de l'utilisateur, qui l'a
 * abandonné le 28/11. L'accueil indique les périodes à choisir. Ce guide dit seulement quoi ranger.
 */
export function GuideAlbums() {
  return (
    <>
      <p className="note">
        Les albums ne servent plus : l’accueil indique quelles photos choisir pour le prochain tri (« Prochain tri »). Votre
        raccourci « {SHORTCUT_NAME} » (suppression) ne change pas.
      </p>
      <ol className="etapes">
        <li>
          App <strong>Raccourcis</strong> : appui long sur « {PREP_SHORTCUT_NAME} », <strong>Supprimer</strong> ; même
          chose pour « {KEEP_SHORTCUT_NAME} » s’il existe encore.
        </li>
        <li>
          App <strong>Photos</strong> › Albums : appui long sur « {TODO_ALBUM} » puis <strong>Supprimer l’album</strong>,
          même chose pour « {KEPT_ALBUM} ». Supprimer un album n’efface aucune photo.
        </li>
        <li>
          S’il reste des photos en double : Photos › Albums › <strong>Doublons</strong> › Sélectionner › Tout sélectionner
          › <strong>Fusionner</strong>.
        </li>
      </ol>
    </>
  );
}
