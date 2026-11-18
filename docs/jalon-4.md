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

Tous publiés par Google pour MediaPipe (fiches et téléchargement : ai.google.dev/edge/mediapipe/solutions/vision),
exécutés par la même bibliothèque, déjà inspectée (aucun envoi de données), embarqués dans l'app. Tailles vérifiées
le 17/11 sur le serveur officiel des modèles.

| Modèle | Taille | Ce qu'il apporterait | Avis |
| --- | --- | --- | --- |
| Silhouette avec peau (« Selfie Multiclass ») | 15,6 Mo | Pour chaque pixel : fond, cheveux, peau du corps, peau du visage, vêtements, accessoires. **Main, bras, tête coupés par le bord** (peau du corps qui touche le bord : 0 % contre 5,5 % lors de l'essai) ; **visage masqué** (casquette, main devant) par la part de peau dans le visage. | Ajouté (17/11) |
| Empreinte d'image (« MobileNet v3 small ») | 3,9 Mo | Ressemblance fine entre photos : quasi-doublons (selfies n° 30/31), groupes de pose, apprentissage des goûts sur le contenu même de l'image. | Ajouté (17/11) |
| Classement de scène (« EfficientNet-Lite0 ») | 5,2 Mo | Environ 1000 types de scènes et d'objets : critères selon le type (nourriture, animaux, ville…), repérage des captures d'écran et photos de documents à mettre de côté. | Ajouté (17/11) |
| Gestes (« Gesture Recognizer ») | 8 Mo | V de la victoire, pouce levé… : confirme une pose voulue. Ne voit pas une main coupée (essai : 0 main trouvée). | Ajouté (18/11) |
| Objets, version plus fine (« EfficientDet-Lite2 ») | 7,2 Mo | Repère mieux les petites personnes et objets en arrière-plan ; environ 3 fois plus lent. | Facultatif |
| Corps, version complète (« Pose Landmarker full ») | 9 Mo | Points du corps plus précis. Gain faible pour nos usages. | Non |

Écartés : modèles « esthétiques » généralistes (NIMA, prédicteurs fondés sur CLIP) : 15 à plus de 300 Mo, une autre
bibliothèque à inspecter, et peu utiles pour départager des photos quasi identiques d'une rafale.

## Ordre de travail et vérifications

1. Moteur : mesures du corps, inclinaison relative, bords masqués, paquets ratés. Tests unitaires sur données
   reconstituées (dont les selfies n° 30 et 31).
2. iPhone : modèle du corps (même moteur MediaPipe), photo d'origine pour le zoom.
3. Écrans : onglet « À supprimer », zoom, cases « Fait ».
4. Test en navigateur, contrôle d'absence de réseau, puis test sur iPhone par l'utilisateur.
