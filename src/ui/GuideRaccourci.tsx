import { useState } from 'react';
import { SHORTCUT_NAME } from '../platform/shortcut';

/**
 * Marche à suivre, une seule fois, pour créer le raccourci qui supprime les photos (app Raccourcis d'Apple).
 * Une ligne reçue par photo : « nom|début|fin ». Pour chaque ligne, une seule recherche dans Photos avec deux filtres
 * (nom, et date de création dans la fenêtre) : une seule photo correspond. Aperçu, puis confirmation d'iOS.
 */
export function GuideRaccourci({ open = false }: { open?: boolean }) {
  const [shown, setShown] = useState(open);
  return (
    <>
      <button className="titre-aide" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
        <h3>Créer le raccourci de suppression (une fois)</h3>
        <span>{shown ? '▾' : '▸'}</span>
      </button>
      {shown && (
        <ol className="etapes">
          <li>
            App <strong>Raccourcis</strong>, touchez <strong>+</strong>, renommez-le exactement{' '}
            <strong>{SHORTCUT_NAME}</strong>.
          </li>
          <li>
            <strong>Scinder le texte</strong> : « Scinder <strong>Entrée de raccourci</strong> selon{' '}
            <strong>Nouvelles lignes</strong> ». Dans le bloc « Recevoir » apparu en haut, ne cochez que{' '}
            <strong>Texte</strong>.
          </li>
          <li>
            <strong>Répéter avec chaque élément</strong> dans « Texte scindé ».
          </li>
          <li>
            Dans la boucle : <strong>Scinder le texte</strong> « Scinder <strong>Élément de répétition</strong> selon{' '}
            <strong>Personnalisé</strong> » et tapez <strong>|</strong> (barre verticale).
          </li>
          <li>
            Dessous, trois fois <strong>Obtenir l’élément de la liste</strong> (de « Texte scindé ») : le premier avec{' '}
            <strong>Premier élément</strong>, le deuxième avec <strong>Élément à l’indice</strong> 2, le troisième avec{' '}
            <strong>Dernier élément</strong>.
          </li>
          <li>
            Dessous, <strong>Rechercher des photos</strong> (s’il affiche « Filtrer … », touchez le mot bleu puis
            Effacer). Deux filtres : <strong>Nom</strong> <strong>est</strong> « Élément de liste » ; et{' '}
            <strong>Date de création</strong> <strong>est entre</strong> « Élément de liste 2 » et « Élément de liste
            3 ». En haut du bloc : <strong>tous</strong> les éléments sont vrais.
          </li>
          <li>
            Dessous, <strong>Ajouter à la variable</strong> : « Ajouter <strong>Photos</strong> à{' '}
            <strong>A supprimer</strong> ».
          </li>
          <li>
            Après « Fin de la répétition » : <strong>Afficher le résultat</strong> (<strong>A supprimer</strong>) pour
            voir les photos avant de supprimer, puis <strong>Supprimer les photos</strong> (<strong>A supprimer</strong>).
            Touchez <strong>OK</strong>.
          </li>
        </ol>
      )}
    </>
  );
}
