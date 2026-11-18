import { useState } from 'react';
import { SHORTCUT_DAYS, SHORTCUT_NAME } from '../platform/shortcut';

/**
 * Marche à suivre, une seule fois, pour créer le raccourci qui supprime les photos (app Raccourcis d'Apple).
 * Le raccourci parcourt les photos récentes et ne garde que celles dont le nom, entouré de chevrons, est dans la liste
 * envoyée par l'app (correspondance exacte).
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
            App <strong>Raccourcis</strong>, onglet <strong>Raccourcis</strong>, touchez <strong>+</strong>. Renommez le
            raccourci exactement <strong>{SHORTCUT_NAME}</strong> (touchez le titre en haut, puis Renommer).
          </li>
          <li>
            Ajoutez <strong>Rechercher des photos</strong>. Touchez <strong>Ajouter un filtre</strong> : premier mot bleu{' '}
            <strong>Date de création</strong>, puis <strong>est dans les derniers</strong>, mettez{' '}
            <strong>{SHORTCUT_DAYS}</strong> et <strong>jours</strong>. Pas de limite.
          </li>
          <li>
            Ajoutez <strong>Répéter avec chaque élément</strong> : elle doit dire « Répéter avec chaque élément dans{' '}
            <strong>Photos</strong> ».
          </li>
          <li>
            Dans la boucle, ajoutez <strong>Obtenir le nom</strong> : « Obtenir le nom de <strong>Élément de
            répétition</strong> » (touchez le mot bleu pour le choisir si besoin).
          </li>
          <li>
            Dessous, ajoutez <strong>Si</strong>. Réglez : « Si <strong>Entrée de raccourci</strong>{' '}
            <strong>contient</strong> … ». Dans la case de droite, tapez le signe <strong>&lt;</strong>, touchez la
            variable <strong>Nom</strong> au-dessus du clavier, puis tapez <strong>&gt;</strong>. La case affiche
            « &lt;Nom&gt; » : seule une photo au nom exactement dans la liste correspond.
          </li>
          <li>
            Entre « Si » et « Sinon », ajoutez <strong>Ajouter à la variable</strong> : « Ajouter{' '}
            <strong>Élément de répétition</strong> à <strong>A supprimer</strong> » (tapez « A supprimer » comme nom de
            variable). Supprimez la ligne « Sinon » si vous pouvez, sinon laissez-la vide.
          </li>
          <li>
            Tout en bas, sous « Fin de la répétition », ajoutez <strong>Supprimer les photos</strong> et choisissez la
            variable <strong>A supprimer</strong>.
          </li>
          <li>
            Touchez <strong>OK</strong>. Au premier lancement, autorisez l’accès à Photos. L’iPhone demande toujours de
            confirmer la suppression, avec le nombre de photos : vérifiez qu’il correspond à celui de l’app.
          </li>
        </ol>
      )}
    </>
  );
}
