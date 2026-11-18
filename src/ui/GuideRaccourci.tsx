import { useState } from 'react';
import { SHORTCUT_NAME } from '../platform/shortcut';

/** Marche à suivre, une seule fois, pour créer le raccourci qui supprime les photos (app Raccourcis d'Apple). */
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
            Ouvrez l’app <strong>Raccourcis</strong> (icône aux carrés bleu et rose), onglet <strong>Raccourcis</strong> en bas, puis touchez <strong>+</strong> en haut à droite.
          </li>
          <li>
            Touchez le titre « Nouveau raccourci » en haut, puis <strong>Renommer</strong>, et tapez exactement{' '}
            <strong>{SHORTCUT_NAME}</strong> (majuscules et espace compris). Touchez OK.
          </li>
          <li>
            Touchez la barre <strong>Rechercher des actions</strong> en bas, tapez « scinder » et touchez{' '}
            <strong>Scinder le texte</strong>. Si le mot bleu n’est pas déjà « Entrée de raccourci », touchez-le et
            choisissez <strong>Entrée de raccourci</strong>. Laissez « Nouvelles lignes ».
          </li>
          <li>
            Recherchez « répéter » et touchez <strong>Répéter avec chaque élément</strong>. Elle se place sous
            l’action précédente et utilise son résultat.
          </li>
          <li>
            Recherchez « rien » et touchez <strong>Rien</strong> : placez-la entre « Répéter avec chaque élément » et
            « Fin de la répétition ». Elle empêche l’action suivante de prendre le nom de la photo comme point de départ.
          </li>
          <li>
            Recherchez « rechercher des photos » et touchez <strong>Rechercher des photos</strong> : placez-la juste sous
            « Rien », toujours avant « Fin de la répétition ». Elle doit commencer par « Rechercher <strong>Toutes les
            photos</strong> ». Si elle affiche « Filtrer Élément de répétition », touchez « Élément de répétition » et
            choisissez <strong>Effacer</strong>.
          </li>
          <li>
            Dans cette action : touchez <strong>Ajouter un filtre</strong>, touchez le premier mot bleu et choisissez{' '}
            <strong>Nom</strong>, laissez « est », touchez la case de droite et choisissez la variable{' '}
            <strong>Élément de répétition</strong> (au-dessus du clavier). Touchez <strong>Trier par</strong> : « Date de
            création », ordre « Plus récent en premier ». Activez <strong>Limite</strong> et mettez 1.
          </li>
          <li>
            Recherchez « supprimer les photos » et touchez <strong>Supprimer les photos</strong> : elle doit être tout en
            bas, sous « Fin de la répétition », et dire « Supprimer Résultats de la répétition ».
          </li>
          <li>Touchez <strong>OK</strong> (ou ✓) en haut à droite. C’est fini.</li>
        </ol>
      )}
    </>
  );
}
