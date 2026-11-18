import { useState } from 'react';
import { SHORTCUT_NAME } from '../platform/shortcut';

/**
 * Marche à suivre, une seule fois, pour créer le raccourci qui supprime les photos (app Raccourcis d'Apple).
 * Le raccourci cherche chaque nom reçu dans Photos (quelques photos par nom, donc rapide), puis ne garde une photo que
 * si « <nom|date à la seconde> » figure dans le texte reçu (les noms seuls ne sont pas uniques).
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
            App <strong>Raccourcis</strong>, touchez <strong>+</strong>, renommez le raccourci exactement{' '}
            <strong>{SHORTCUT_NAME}</strong> (touchez le titre, puis Renommer).
          </li>
          <li>
            Ajoutez <strong>Scinder le texte</strong> : « Scinder <strong>Entrée de raccourci</strong> selon Nouvelles
            lignes ». Un bloc « Recevoir … depuis Nulle part » apparaît en haut : touchez son premier mot bleu et ne
            cochez que <strong>Texte</strong>.
          </li>
          <li>
            Ajoutez <strong>Répéter avec chaque élément</strong> (dans « Texte scindé »).
          </li>
          <li>
            Dans cette boucle, ajoutez <strong>Rechercher des photos</strong>. S’il affiche « Filtrer Élément de
            répétition », touchez ce mot bleu puis <strong>Effacer</strong> : il doit dire « Rechercher{' '}
            <strong>Photos</strong> ». Ajoutez le filtre <strong>Nom</strong> <strong>est</strong>{' '}
            <strong>Élément de répétition</strong>. Pas de limite.
          </li>
          <li>
            Juste dessous, ajoutez une seconde <strong>Répéter avec chaque élément</strong> : « … dans{' '}
            <strong>Photos</strong> ». Elle se place dans la première boucle.
          </li>
          <li>
            Dans cette seconde boucle, ajoutez dans l’ordre (le mot bleu doit être « Élément de répétition{' '}
            <strong>2</strong> », celui de la seconde boucle) :
            <br />• <strong>Obtenir le nom</strong> de Élément de répétition 2 ;
            <br />• <strong>Obtenir les détails des images</strong> : <strong>Date de prise de vue</strong> de Élément de
            répétition 2 ;
            <br />• <strong>Formater la date</strong> : format <strong>Personnalisé</strong>, chaîne exactement{' '}
            <strong>yyyy-MM-dd HH:mm:ss</strong> (deux « s » à la fin) ;
            <br />• <strong>Si</strong> <strong>Entrée de raccourci</strong> <strong>contient</strong>{' '}
            <strong>&lt;Nom|Date formatée&gt;</strong> (tapez &lt;, variable Nom, |, variable Date formatée, &gt;) ;
            <br />• entre « Si » et « Sinon » : <strong>Ajouter à la variable</strong> « Élément de répétition 2 » à{' '}
            <strong>A supprimer</strong>.
          </li>
          <li>
            Tout en bas, sous les deux « Fin de la répétition », ajoutez <strong>Supprimer les photos</strong> :{' '}
            <strong>A supprimer</strong>. Touchez <strong>OK</strong>.
          </li>
          <li>
            L’iPhone demande toujours de confirmer, avec le nombre de photos : il doit être celui de l’app. Les photos
            restent 30 jours dans « Supprimés récemment ».
          </li>
        </ol>
      )}
    </>
  );
}
