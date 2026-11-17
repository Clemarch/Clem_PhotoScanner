# Jalon 4 : passer à l'action (supprimer), cadrage du corps, zoom

Plan préparé avant le code, à partir des réponses de l'utilisateur du 17/11. Les écarts en cours de route vont dans
`decisions.md`.

## Réponses de l'utilisateur qui orientent ce jalon

1. **Suppression dans Photos** : soit il sait ce qu'il garde et utilise « Sélectionner » pour cocher plusieurs photos,
   soit il trie à la volée, photo par photo, en supprimant les 2 ou 3 moins bonnes dès qu'il a trouvé la bonne.
2. **Un paquet peut être entièrement supprimé** si toutes ses photos sont ratées.
3. **Ajouter le modèle du corps** (mains, pieds coupés) ; proposer les autres modèles utiles, à ajouter après
   validation.
4. **Photos par le hublot** : penchées, mais c'est inévitable ; comptent le cadrage, les couleurs, et éviter les bords
   du hublot qui cachent le paysage.
5. **Zoom** dans la visionneuse, pour vérifier un regard ou un détail.

## Ce qui est construit

### Écran « À supprimer »
- Nouvel onglet. Pour chaque paquet : toutes ses photos **dans l'ordre exact de l'app Photos** (ordre de prise de
  vue), celles à supprimer bien marquées, celles gardées visibles mais atténuées. C'est une carte à reproduire dans
  Photos avec « Sélectionner ».
- Heure de début et de fin de chaque paquet, pour le retrouver vite en faisant défiler Photos.
- Case « Fait dans Photos » par paquet : le paquet se replie. Mémorisée sur l'iPhone.
- En tête, la marche à suivre dans Photos, en quelques étapes, et le rappel que les photos supprimées restent
  30 jours dans « Supprimés récemment ».

### Cadrage du corps (modèle MediaPipe Pose Landmarker « lite », 5,8 Mo)
- 33 points du corps par personne (épaules, coudes, poignets, hanches, genoux, chevilles…), avec leur visibilité.
- **Main coupée** : coude dans l'image, poignet hors de l'image ou collé au bord. **Pieds coupés** : genou dans
  l'image, cheville hors de l'image.
- Jugé par rapport au paquet : sur un selfie, le bras qui tient le téléphone est coupé sur toutes les photos ; seule
  une coupure *en plus* pénalise (cas des selfies n° 30 et 31 du 16/11).

### Zoom dans la visionneuse
- Pincer pour zoomer, double toucher pour zoomer ou revenir, glisser pour se déplacer dans la photo zoomée.
- Dès qu'on zoome, l'app affiche la **photo d'origine en pleine définition** (lue sur l'iPhone, rien n'est copié).
- Changer de photo en glissant reste possible quand on n'est pas zoomé.

### Paquets entièrement ratés
- Une photo est **ratée** si elle a un défaut rédhibitoire (yeux fermés, visage coupé) ou si elle est très floue
  (sans visage, netteté mesurée sous un seuil absolu).
- Si toutes les photos d'un paquet sont ratées, l'app propose de toutes les supprimer. Sinon, la règle « au moins
  une photo gardée » reste.

### Hublot et photos penchées
- L'inclinaison est jugée **par rapport au paquet** : la photo la plus droite n'est pas pénalisée, les autres le sont
  pour leur écart avec elle.
- **Bords masqués** : part de l'image envahie depuis les bords par une zone sombre et uniforme (montant du hublot,
  doigt sur l'objectif), comparée aux autres photos du paquet.

## Autres modèles proposés (à valider par l'utilisateur avant ajout)

Tous sont des modèles MediaPipe de la même bibliothèque, déjà inspectée (aucun envoi de données), embarqués.

| Modèle | Taille | Ce qu'il apporterait |
| --- | --- | --- |
| Reconnaissance de gestes | 8 Mo | Repère les gestes voulus (V de la victoire, pouce levé…) et les mains : confirme une « pose », et voit une **main devant le visage** (aujourd'hui invisible, car de la même couleur que la peau). |
| Silhouette des personnes (« selfie segmenter ») | 0,25 Mo | Contour exact des personnes : cadrage précis (personne coupée, trop petite, mal placée), séparation sujet / fond. |
| Empreinte d'image (« image embedder ») | 4 Mo | Ressemblance fine entre photos : meilleurs groupes de pose et quasi-doublons, et apprentissage des goûts sur le contenu de l'image. |
| Classement de scène (« image classifier ») | 5 Mo | Reconnaît environ 1000 types de scènes et d'objets : critères adaptés à plus de types (nourriture, animaux, villes…) et repérage des captures d'écran et photos de documents. |

Écartés pour l'instant : modèles « esthétiques » généralistes (lourds, et peu utiles pour départager des photos
quasi identiques d'une rafale), qui demanderaient en plus une autre bibliothèque.

## Ordre de travail et vérifications

1. Moteur : mesures du corps, inclinaison relative, bords masqués, paquets ratés. Tests unitaires sur données
   reconstituées (dont les selfies n° 30 et 31).
2. iPhone : modèle du corps (même moteur MediaPipe), photo d'origine pour le zoom.
3. Écrans : onglet « À supprimer », zoom, cases « Fait ».
4. Test en navigateur, contrôle d'absence de réseau, puis test sur iPhone par l'utilisateur.
