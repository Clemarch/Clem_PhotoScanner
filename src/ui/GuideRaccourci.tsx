import { useState } from 'react';
import { SHORTCUT_NAME } from '../platform/shortcut';
import { IconChevron } from './icons';

/**
 * Marche à suivre, une seule fois, pour créer le raccourci qui supprime les photos (app Raccourcis d'Apple).
 * Version validée sur l'iPhone de l'utilisateur le 19/11 : une ligne reçue par photo (« nom|début|fin »), une seule
 * recherche par photo (nom + date de création dans la fenêtre), aperçu, puis confirmation d'iOS.
 */
export function GuideRaccourci({ open = false }: { open?: boolean }) {
  const [shown, setShown] = useState(open);
  return (
    <>
      <button className={`titre-aide${shown ? ' ouvert' : ''}`} onClick={() => setShown((v) => !v)} aria-expanded={shown}>
        <span>Créer le raccourci (une seule fois)</span>
        <IconChevron size={14} className="chevron" />
      </button>
      {shown && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong>, touchez <strong>+</strong>, renommez-le exactement{' '}
              <strong>{SHORTCUT_NAME}</strong> (touchez le titre, puis Renommer).
            </li>
            <li>
              <strong>Scinder le texte</strong> : « Scinder <strong>Entrée de raccourci</strong> selon{' '}
              <strong>Nouvelles lignes</strong> ». Dans le bloc « Recevoir » apparu en haut, cochez{' '}
              <strong>Texte</strong>.
            </li>
            <li>
              <strong>Répéter avec chaque élément</strong> dans « Scinder le texte ». Tous les blocs suivants, jusqu’à
              l’étape 9, vont <strong>dans</strong> cette boucle.
            </li>
            <li>
              <strong>Scinder le texte</strong> : « Scinder <strong>Élément de répétition</strong> selon{' '}
              <strong>Personnalisé</strong> », et tapez <strong>|</strong> (touches 123 puis #+=).
            </li>
            <li>
              <strong>Obtenir l’élément de la liste</strong> : <strong>Premier élément</strong> depuis « Scinder le
              texte ». Puis <strong>Définir la variable</strong> <strong>Nom photo</strong>.
            </li>
            <li>
              <strong>Obtenir l’élément de la liste</strong> : <strong>Élément à l’index 2</strong>. Puis{' '}
              <strong>Obtenir les dates de</strong> l’entrée. Puis <strong>Définir la variable</strong>{' '}
              <strong>Début</strong>.
            </li>
            <li>
              <strong>Obtenir l’élément de la liste</strong> : <strong>Dernier élément</strong>. Puis{' '}
              <strong>Obtenir les dates de</strong> l’entrée. Puis <strong>Définir la variable</strong>{' '}
              <strong>Fin</strong>.
            </li>
            <li>
              <strong>Rechercher des photos</strong> (« Rechercher <strong>Photos</strong> lorsque{' '}
              <strong>l’ensemble</strong> des éléments suivants sont vrais ») avec deux filtres :{' '}
              <strong>Date de création est entre</strong> Début et Fin (pour mettre une variable dans une date,{' '}
              <strong>appuyez longtemps</strong> sur la date, puis « Sélectionner la variable ») ; et{' '}
              <strong>Nom est</strong> Nom photo. Pas de limite.
            </li>
            <li>
              <strong>Ajouter à la variable</strong> : « Ajouter <strong>Photos</strong> à <strong>A supprimer</strong> ».
            </li>
            <li>
              Sous « Fin de la répétition » : <strong>Afficher le résultat</strong> (A supprimer), l’aperçu, puis{' '}
              <strong>Supprimer les photos</strong> (A supprimer). Touchez <strong>OK</strong>.
            </li>
          </ol>
          <p className="note">
            Pièges connus : une action qui affiche « Filtrer Entrée de raccourci » ou « Filtrer Élément de répétition »
            au lieu de « Rechercher Photos » (touchez le mot bleu, puis Effacer) ; un bloc placé sous la recherche alors
            qu’elle en a besoin (l’ordre compte, de haut en bas).
          </p>
        </>
      )}
    </>
  );
}
