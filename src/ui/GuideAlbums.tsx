import { useState } from 'react';
import { KEEP_SHORTCUT_NAME, KEPT_ALBUM, PREP_LIMIT, PREP_SHORTCUT_NAME, SHORTCUT_NAME, TODO_ALBUM } from '../platform/shortcut';
import { IconChevron } from './icons';

/**
 * Album « À trier » (point 71, accord de l'utilisateur, 27/11). Dans l'app Raccourcis, « Créer un album photo »
 * enregistre toujours une copie (point 70) : « Préparer le tri » copie donc les photos de la période reçue dans
 * « À trier », puis supprime les originales (confirmation d'iOS). Chaque photo reste en un seul exemplaire.
 * « Photo Triage Garder » et l'album « Triées » ne servent plus.
 */
export function GuideAlbums() {
  const [shown, setShown] = useState<'' | 'prep' | 'menage'>('');
  const toggle = (which: 'prep' | 'menage') => setShown((v) => (v === which ? '' : which));
  const titre = (which: 'prep' | 'menage', text: string) => (
    <button className={`titre-aide${shown === which ? ' ouvert' : ''}`} onClick={() => toggle(which)} aria-expanded={shown === which}>
      <span>{text}</span>
      <IconChevron size={14} className="chevron" />
    </button>
  );
  return (
    <>
      <p className="note">
        L’accueil dit quelles photos restent à trier, et un toucher les met dans l’album « {TODO_ALBUM} » ({PREP_LIMIT} à la
        fois). Dans l’app Raccourcis, mettre une photo dans un album en fait toujours une copie : le raccourci copie donc
        les photos dans « {TODO_ALBUM} », puis supprime les originales (iOS vous demande de confirmer). Chaque photo reste en
        un seul exemplaire. Votre raccourci « {SHORTCUT_NAME} » (suppression) ne change pas.
      </p>

      {titre('prep', `1. Refaire « ${PREP_SHORTCUT_NAME} » (une seule fois)`)}
      {shown === 'prep' && (
        <>
          <ol className="etapes">
            <li>
              App <strong>Raccourcis</strong> : appui long sur « {PREP_SHORTCUT_NAME} », <strong>Supprimer</strong>. Puis
              touchez <strong>+</strong> en haut à droite, touchez le titre, <strong>Renommer</strong>, tapez exactement{' '}
              <strong>{PREP_SHORTCUT_NAME}</strong>.
            </li>
            <li>
              Barre <strong>Rechercher</strong> en bas : <strong>Scinder le texte</strong>. Dans le bloc : « Scinder{' '}
              <strong>Entrée de raccourci</strong> selon <strong>Personnalisé</strong> », tapez <strong>|</strong>{' '}
              (touches 123 puis #+=). Dans le bloc « Recevoir » apparu en haut, cochez seulement <strong>Texte</strong>.
            </li>
            <li>
              <strong>Obtenir l’élément de la liste</strong> : <strong>Premier élément</strong> depuis « Scinder le
              texte ». Puis <strong>Obtenir les dates de</strong> « Élément de la liste ». Puis{' '}
              <strong>Définir la variable</strong>, nom <strong>Début</strong>, sur « Dates ».
            </li>
            <li>
              Encore <strong>Obtenir l’élément de la liste</strong> : touchez « Premier élément » pour choisir{' '}
              <strong>Dernier élément</strong>, puis touchez la liste et choisissez le résultat de « Scinder le texte »
              (<strong>Sélectionner une variable</strong>, puis le bloc de l’étape 2). Puis <strong>Obtenir les dates de</strong> « Élément de la liste », puis{' '}
              <strong>Définir la variable</strong> <strong>Fin</strong> sur « Dates ».
            </li>
            <li>
              <strong>Rechercher des photos</strong> : <strong>Ajouter un filtre</strong>, choisissez{' '}
              <strong>Album</strong> <strong>est</strong> <strong>{TODO_ALBUM}</strong>. Limite désactivée.
            </li>
            <li>
              <strong>Si</strong> : « Photos <strong>a une valeur</strong> ». Entre <strong>Si</strong> et{' '}
              <strong>Sinon</strong> : <strong>Supprimer de l’album photo</strong>, contenu <strong>Photos</strong>,
              album <strong>{TODO_ALBUM}</strong> (vide l’album, n’efface aucune photo). Touchez la croix de « Sinon » si
              vous voulez, il ne sert pas.
            </li>
            <li>
              Sous « Fin si », encore <strong>Rechercher des photos</strong>, avec deux filtres : <strong>Date de
              création</strong> <strong>est entre</strong> <strong>Début</strong> et <strong>Fin</strong> ; puis{' '}
              <strong>Type de média</strong> <strong>est</strong> <strong>Image</strong>. Trier par{' '}
              <strong>Date de création</strong>, ordre <strong>Plus récentes d’abord</strong>. Activez{' '}
              <strong>Limite</strong> et réglez <strong>{PREP_LIMIT}</strong>.
            </li>
            <li>
              <strong>Créer un album photo</strong> : nom <strong>{TODO_ALBUM}</strong>, contenu : touchez le mot bleu,{' '}
              <strong>Sélectionner une variable</strong>, puis touchez le bloc de l’étape 7.
            </li>
            <li>
              <strong>Supprimer les photos</strong> : contenu, la même chose qu’à l’étape 8 (<strong>Sélectionner une
              variable</strong>, puis le bloc de l’étape 7). Ce sont les originales, déjà copiées dans « {TODO_ALBUM} ».
            </li>
          </ol>
          <p className="note">
            Résultat : Scinder · Élément (premier) · Dates · Début · Élément (dernier) · Dates · Fin · Rechercher (album{' '}
            {TODO_ALBUM}) · Si → Supprimer de l’album · Fin si · Rechercher (entre Début et Fin, images, plus récentes,
            {` ${PREP_LIMIT}`}) · Créer un album photo {TODO_ALBUM} · Supprimer les photos.
          </p>
          <p className="note">
            <strong>Premier essai avec 3 photos</strong> : réglez la limite de l’étape 7 à <strong>3</strong>, touchez
            « Remplir « {TODO_ALBUM} » » sur l’accueil de l’app, confirmez la suppression. Dans Photos, l’album «{' '}
            {TODO_ALBUM} » doit montrer 3 photos, et chacune une seule fois dans la photothèque (touchez une photo, puis
            balayez vers le haut : la date doit être celle de la prise de vue). Si tout va bien, remettez{' '}
            {PREP_LIMIT}.
          </p>
        </>
      )}

      {titre('menage', '2. Ce qui ne sert plus')}
      {shown === 'menage' && (
        <ol className="etapes">
          <li>
            App Raccourcis : appui long sur « {KEEP_SHORTCUT_NAME} », <strong>Supprimer</strong>.
          </li>
          <li>
            App Photos › Albums : appui long sur « {KEPT_ALBUM} », <strong>Supprimer l’album</strong> (aucune photo n’est
            effacée).
          </li>
          <li>
            S’il reste des photos en double : Photos › Albums › <strong>Doublons</strong> › Sélectionner › Tout
            sélectionner › <strong>Fusionner</strong>.
          </li>
        </ol>
      )}
    </>
  );
}
