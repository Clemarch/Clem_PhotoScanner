# Décisions

Journal des choix du projet. Le plan d'origine est dans `plan-initial.md` ; ce fichier dit ce qui a été
retenu, écarté ou reporté, et pourquoi. Les contraintes non négociables (voir `CLAUDE.md`) ne sont pas rediscutées.

## Retenu tel que proposé

| Sujet | Décision | Pourquoi |
| --- | --- | --- |
| Plateforme | PWA statique, sans serveur, GitHub Pages | Seule voie sans ordinateur ni compte développeur Apple. |
| Stack | TypeScript strict, React, Vite | Standard, bien outillé. Preact ou Svelte seraient plus légers, mais l'app pèse déjà ~100 ko compressée : gain négligeable face aux modèles d'IA à venir. |
| Trois couches | `engine` / `platform` / `ui` | Moteur testable sans iPhone et réutilisable. Vérifié par un test et par ESLint. |
| Seuils | Tous dans `src/engine/config.ts` | Un seul endroit à calibrer. |
| Mémoire | Une photo à la fois, réduite à 1024 px | Parade principale au plantage de Safari. |
| Écart entre paquets | 1 minute | Le plan proposait 5 minutes. Testé par l'utilisateur sur ses photos avec le curseur : 1 minute découpe comme il le ferait. |

## Écarts par rapport au plan

### 1. `ingest` sort du moteur
Le plan plaçait la lecture des métadonnées et la création des vignettes dans `engine/ingest`, avec `createImageBitmap`.
C'est contradictoire avec « engine n'accède jamais au navigateur ». Le décodage et la lecture EXIF vivent donc dans
`src/platform/image` ; le moteur ne reçoit que des données déjà extraites (dates, tableau de pixels gris).

### 2. Netteté mesurée par cases, pas sur l'image entière
La variance du Laplacien sur toute l'image pénalise une photo dont le fond est volontairement flou (mode Portrait)
ou un paysage avec un grand ciel. On découpe l'image en grille 8 × 8 et on fait la moyenne du quart de cases le plus
net. Alternative écartée : mesure sur l'image entière (plus simple, mais classe mal les portraits).
Limite connue : à 1024 px, un léger flou de mise au point devient invisible. Au jalon 2, la netteté du visage devra
être mesurée sur un recadrage en pleine résolution.

### 3. La date du fichier n'est jamais utilisée pour grouper
Si la date de prise de vue manque, le navigateur fournit quand même une « date du fichier », qui est souvent l'heure
de la sélection. S'en servir fabriquerait de faux paquets sans prévenir. Les photos sans date vont dans un groupe
« Sans date », bien visible. Le diagnostic affiche les deux dates pour qu'on sache ce que l'iPhone fournit.

### 4. « Usage mémoire » : non mesurable sur Safari
Safari ne donne aucun accès à la mémoire utilisée. L'écran affiche donc une estimation par photo
(largeur × hauteur × 4 octets) et, surtout, un témoin de plantage : si l'app est coupée pendant une analyse, elle
indique au lancement suivant à quelle photo elle s'est arrêtée. C'est la vraie mesure de la limite.

### 5. Décodage avec replis
Trois méthodes essayées dans l'ordre : `createImageBitmap` avec réduction (la plus économe), sans réduction, puis
balise image classique. L'analyse tourne dans un Web Worker (arrière-plan) et bascule dans la page si le Worker
échoue. Le diagnostic indique la méthode réellement utilisée : c'est une des inconnues du jalon 0.

### 6. Reportés (pas encore utiles)
- **Zustand** : l'état actuel tient dans un composant. À ajouter quand plusieurs écrans modifieront les décisions.
- **IndexedDB / cache d'analyse** : l'analyse actuelle prend quelques dizaines de millisecondes par photo ; un cache
  n'apporte rien avant les visages (jalon 2). On évite aussi de copier des photos dans le stockage de l'app.
- **Lots de 20** : sans cache à sauvegarder, le traitement photo par photo suffit.
- **`pipeline.ts`** : sera créé quand il y aura plus d'une étape à enchaîner.

### 7. Garde-fous de confidentialité vérifiés automatiquement
- Test `tests/unit/contraintes.test.ts` : échoue si le code contient un appel réseau ou une adresse externe.
- ESLint : interdit `fetch`, `XMLHttpRequest`, `WebSocket`, etc.
- Politique CSP (`connect-src 'self'`) injectée dans la page publiée : le navigateur lui-même bloque tout appel
  vers un autre site. `tools/check-dist.mjs` vérifie sa présence à chaque construction.
- Service worker : toute l'app est mise en cache à la première visite, puis fonctionne hors ligne.

## Jalon 2 : visages

### 8. MediaPipe figé en version 0.10.34, parce que les versions 1.x envoient des statistiques à Google
En inspectant le code de `@mediapipe/tasks-vision`, on trouve à partir de la version 1.0.0 un envoi de statistiques
d'usage vers `odml.pa.googleapis.com/v1/log` (confirmé par la « Privacy Notice » de son README : les images ne partent
pas, mais des mesures de performance et d'utilisation, si). C'est incompatible avec « aucune télémétrie ».
Les versions 0.10.x ne contiennent ni ce code ni aucune adresse externe. Décision : version exacte **0.10.34**.
Trois verrous empêchent une régression :
- un test échoue si la version n'est plus une 0.10.x ou si la bibliothèque contient une adresse externe ;
- `tools/check-dist.mjs` échoue si un script publié mentionne un service de statistiques ;
- la politique CSP `connect-src 'self'` fait bloquer par le navigateur tout appel vers un autre site, quoi qu'il arrive.

Alternatives écartées : version 1.x en comptant sur la seule CSP pour bloquer l'envoi (le code essaierait quand même,
et une seule ligne de défense est fragile) ; modifier la bibliothèque à la main (à refaire à chaque mise à jour).
Ne jamais mettre MediaPipe à jour sans refaire cette inspection.

### 9. Modèle et moteur de calcul servis par l'app
`public/models/face_landmarker.task` (3,7 Mo) est versionné dans le dépôt ; le moteur WebAssembly est copié depuis
`node_modules` à chaque construction (`tools/copy-models.mjs`). Rien n'est téléchargé depuis un serveur de Google.
La CSP gagne `'wasm-unsafe-eval'`, qui autorise uniquement l'exécution de ce moteur embarqué.
L'app pèse maintenant environ 15 Mo, téléchargés une seule fois puis disponibles hors ligne.

### 10. Recherche de visages dans la page, sur le processeur
Le décodage reste dans le Web Worker, mais MediaPipe tourne dans la page, avec le processeur (pas la puce graphique).
C'est la configuration la plus éprouvée sur Safari ; le Worker et la puce graphique y sont des sources de pannes
connues. Coût : quelques dizaines de millisecondes par photo pendant lesquelles l'écran ne répond pas, acceptable sur
un écran de progression. À revoir si l'analyse de 100 photos est trop lente sur l'iPhone.
Si le modèle ne démarre pas, l'app continue en classant par netteté seule et le signale.

### 11. Analyse à 1536 px au lieu de 1024
Les visages d'un selfie à deux occupent peu de pixels à 1024 px, et un flou de bougé léger y disparaît.
1536 px coûte environ 9 Mo par photo décodée, une seule à la fois.

### 12. Note d'une photo : ce qui a été retenu du plan, et ce qui change
Retenu : note d'un visage = somme pondérée yeux, regard, expression, netteté du visage (poids : voir point 13) ;
note « visages » = 0,6 × pire visage + 0,4 × moyenne ; vetos yeux fermés et visage coupé, levés si tout le paquet
est concerné.

Changé ou ajouté :
- **Visages principaux seulement** : un visage compte s'il fait au moins 35 % de la surface du plus grand. Un passant
  ne peut plus couler la photo.
- **Visage caché ou absent** (cas réel de la casquette) : on compare le nombre de visages de la photo à la médiane
  du paquet. Chaque visage manquant retire une part de la note. Critère absent du plan.
- **Netteté relative** : la netteté du visage est rapportée au visage le plus net du paquet, avec une racine carrée
  pour adoucir (la mesure brute varie sur plusieurs ordres de grandeur).
- **Cadrage** (0,15 dans le plan) : pas encore mesuré, les deux autres poids sont renormalisés.
- **Seuil absolu de 0,45, budget par pose, quota** : non appliqués. C'est le jalon 3. Pour l'instant l'app classe les
  photos de chaque paquet et marque la première ; elle ne décide pas encore lesquelles garder.

Limites connues, à calibrer sur les rapports de l'utilisateur :
- Le modèle est fait pour des visages proches (selfie, portrait). Des personnes petites dans le cadre ne sont pas
  détectées : la photo est alors jugée comme un paysage.
- « Pas prête » n'est approché que par le regard, l'expression et la netteté du visage.

### 13. Calibrage sur le premier rapport réel (selfie à deux, 8 photos)
Le premier essai sur iPhone a mal classé le paquet. Le rapport a montré trois défauts de calcul :

- **Regard faux sur les selfies.** Les deux personnes obtenaient 0,15 à 0,25 sur toutes les photos. Au grand-angle,
  un visage au bord de l'image doit tourner la tête d'environ 20° pour regarder le téléphone ; mesurée par rapport à
  l'axe de l'appareil, cette rotation passait pour un regard de côté. Correction : on calcule la direction de
  l'objectif vue depuis le visage, à partir de sa position dans l'image et de la focale réelle lue dans la photo
  (23 mm pour la caméra selfie). Vérification sur les données : visage à 80 % de la largeur, rotation mesurée de −20°,
  rotation attendue de −18,7°. Au téléobjectif la correction devient négligeable.
  Alternative écartée : la position 3D estimée par MediaPipe, qui suppose un angle de champ fixe et se trompe dès
  que l'objectif change.
- **Direction des yeux.** Peu fiable seule, elle saturait la pénalité. Elle ne sert plus qu'à reconnaître une tête
  tournée dont les yeux reviennent vers l'objectif : on retient la lecture la plus favorable des deux. L'inclinaison
  haut-bas compte moitié moins que la rotation gauche-droite.
- **Yeux ouverts.** Le détecteur annonce 25 à 30 % de « clignement » pour des yeux ouverts (sourire, lunettes), ce qui
  départageait les photos sur du bruit. La note est maintenant maximale au-dessus d'un seuil et nulle en dessous
  d'un autre.
- **Netteté des visages.** Chaque visage était comparé au plus net du paquet, donc à celui de l'autre personne, et
  une mesure isolée très haute faisait passer les autres pour flous. Chaque personne est maintenant comparée à
  elle-même (visages rangés de gauche à droite), avec une référence qui ignore la valeur la plus haute.

Poids d'un visage revus en conséquence : 0,20 yeux + 0,30 regard + 0,30 expression + 0,20 netteté (le plan :
0,30 / 0,25 / 0,20 / 0,25). Les yeux agissent surtout par le veto ; l'expression est ce qui distinguait le mieux
les photos ratées de ce paquet.

Le rapport de diagnostic liste maintenant les photos dans l'ordre de la journée, avec la position de chaque visage,
l'écart à l'objectif et la direction des yeux, pour continuer le calibrage.

### 14. Le contenu d'abord : refonte de la note après les remarques de l'utilisateur
Retour de l'utilisateur sur le paquet de selfies : l'app choisissait encore une photo techniquement bonne mais ratée
(casquette tenue devant le visage). Ses critères, dans ses mots : regarder l'objectif n'est pas obligatoire (regarder
au loin peut donner une superbe photo) ; les personnes en arrière-plan gênent ; le cadrage et un plan bien droit
comptent ; un beau sourire, pas quelqu'un qui parle ; aucun élément qui perturbe (casquette, bouteille en main…).

Remarque : le rapport envoyé à ce moment-là venait encore de l'ancienne version (le réglage 2 n'était pas chargé sur
l'iPhone). Cette refonte part des critères de l'utilisateur, pas d'une évaluation du réglage 2.

Changements :
- **La technique devient un filtre de défauts.** Une netteté d'au moins 60 % de la référence du paquet vaut la note
  maximale : une photo plus nette n'est plus une meilleure photo. Seul un vrai flou pénalise. Les yeux agissent par le
  veto et une note saturée.
- **Poids d'un visage** : 0,55 expression, 0,20 netteté (défaut), 0,15 yeux, 0,10 regard. Le regard ne génère plus
  aucune raison affichée.
- **Expression détaillée** : « en train de parler » (bouche ouverte sans sourire) et « moue » deviennent des raisons
  distinctes ; « beau sourire » est affiché seulement si personne ne parle.
- **Visage en partie masqué** : couleur moyenne du haut (yeux) et du bas (bouche, menton) de chaque visage, comparée
  à la même personne sur les autres photos du paquet (au moins 3 photos complètes). Un objet devant le visage change
  la couleur de la zone. Ne repère pas une main (même couleur que la peau).
- **Objets gênants** : nouveau modèle MediaPipe ObjectDetector (EfficientDet-Lite0, 80 catégories COCO, 4,6 Mo,
  même bibliothèque 0.10.34 déjà inspectée). Un objet de la liste `content.distractingLabels` (bouteille, verre,
  téléphone, sac…) compte s'il touche la zone des personnes ou s'il est grand. Limite : COCO ne connaît pas
  « casquette » ni « chapeau », d'où la mesure de masquage ci-dessus.
- **Personnes en arrière-plan** : personnes détectées qui ne contiennent aucun visage principal, plus les petits
  visages non rattachés, pondérés par leur taille et leur position (au centre, elles gênent plus).
- **Cadrage, photo penchée** : direction dominante des grandes lignes (horizon, bâtiments), mesurée sur l'image
  moyennée par blocs de 2 × 2 pixels. Pénalité au-delà de 1,5°, pleine à 6°, seulement si assez de contours sont
  alignés pour que la mesure soit fiable.
- **Jugement relatif** : arrière-plan et objets sont comptés par rapport à la photo la plus dégagée du paquet. Ce qui
  est présent partout (la plage derrière, un sac porté tout du long) ne départage rien.
- À note égale, la photo la plus nette passe devant.

Vérifié en navigateur sur un portrait réel décliné : version propre en tête, puis personne en arrière-plan, photo
penchée de 4° (mesurée 3,1°), objet tenu (détecté comme « sandwich »), visage masqué en dernier.
Coût : environ 110 ms de plus par photo pour la détection d'objets (mesuré sur ordinateur, à confirmer sur iPhone).

Alternatives écartées pour l'instant :
- **Modèle esthétique** (type NIMA ou CLIP + tête « esthétique ») : 15 à 90 Mo, et ces modèles notent presque
  pareil des photos quasi identiques d'une rafale, qui est justement le cas à départager.
- **Apprentissage des goûts de l'utilisateur** (jalon 5 du plan) : seule façon de couvrir les critères qu'on ne peut
  pas tous énumérer. Proposé à l'utilisateur pour être avancé ; nécessite ses choix sur des paquets réels.

### 15. Réglage 4, d'après le premier rapport du réglage 3
Le réglage 3 a donné un ordre jugé « mieux » par l'utilisateur (n° 4 meilleure ; la photo à la casquette 6e sur 8,
pénalisée pour « moue »). Le rapport a montré :

- **Casquette non vue comme objet.** Elle est tenue devant le buste, sous le visage : la couleur du bas du visage
  n'a pas bougé (masquage 0,00). Ajout : couleur de la zone sous le visage (cou, buste), comparée à la même personne
  sur les autres photos, avec des seuils plus larges que pour le visage car le buste bouge davantage. Raison :
  « quelque chose devant la personne ». Non vérifié sur les photos de l'utilisateur (le rapport du réglage 4 le dira).
- **Fausse « personne en arrière-plan »** sur la photo où une personne a détourné la tête : sans visage trouvé, sa
  silhouette passait pour un passant. Une personne détectée à la place d'un sujet sur une autre photo du paquet
  (recouvrement d'au moins 30 %) est maintenant un sujet.
- **Visage sombre ≠ visage masqué.** Un visage entièrement plus sombre est une question de lumière : la mesure de
  masquage ne tient plus compte de la luminosité générale du visage, et une raison distincte « visage plus sombre »
  apparaît sous 70 % de la luminosité habituelle de la personne.
- **Exposition** (critère du plan pour les paysages, absent jusque-là) : part de pixels brûlés et bouchés, comparée
  à la photo la mieux exposée du paquet.
- **Horizon : jamais jugé sur les vraies photos.** La force de la mesure y vaut 0,06 à 0,09, sous le seuil de 0,10
  (texture des nuages). Essai d'un tri des contours (ne garder que les 15 % les plus marqués) : aucun gain sur les
  tests, et moins bon sur un portrait penché ; écarté. Le seuil reste à calibrer sur des photos réellement penchées.
- Observé, non modifié : le détecteur voit un sac à dos sur toutes les photos du paquet ; présent partout, il ne
  pénalise pas. Durée totale : 2,9 s pour 14 photos, soit environ 20 s pour une journée de 100 photos.

## Jalon 3 : sélection, visionneuse, choix et apprentissage

Plan préparé avant le code : `docs/jalon-3.md`. Écarts et choix faits en cours de route :

### 16. Retours de l'utilisateur sur le réglage 3 (il garde les n° 1, 3 et 7 du paquet de selfies)
- **La moue est une pose voulue** (geste de la main pour la photo) : plus aucune pénalité ; une moue, comme un
  sourire, améliore l'expression ; raison positive « pose voulue ». Une expression calme vaut 0,7 (au lieu de 0,55) :
  seule la parole reste un défaut.
- **Photo 7 : visage non trouvé, mais présent.** Seconde recherche de visage sur le recadrage de chaque personne
  détectée sans visage. Si elle échoue encore et qu'une personne se tient à la place d'un sujet, raison « visage non
  analysé » et pénalité légère (6 % par visage), au lieu de « visage caché » (50 %).
- **Netteté d'un visage quand un autre manque** : chaque visage est rattaché à la bonne personne par sa position
  habituelle, au lieu d'être comparé au visage le plus net du paquet (qui pouvait être celui de l'autre personne).
- **Casquette portée** : pour le haut du visage, seule la couleur compte ; l'ombre d'une visière n'est plus un masquage.
- Le paquet est reconstitué dans `tests/unit/feedback.test.ts` à partir du rapport : les n° 1, 3 et 7 y sont dans la
  moitié haute du classement. L'ordre exact entre photos presque équivalentes (notes à 0,02 près) relève du goût :
  c'est le rôle de l'apprentissage.

### 17. Type de photo et esthétique
- Type décidé par paquet : selfie (caméra avant ≤ 23 mm), portrait, groupe (3 visages et plus), coucher de soleil
  (au moins 10 % de pixels orange ou jaune saturés, intensité ≥ 0,25), paysage. Affiché avec « On cherche : … ».
- Esthétique relative au paquet : couleurs chaudes, contraste, vivacité (mesure de Hasler et Süsstrunk), équilibre
  de l'exposition (luminosité proche d'un niveau moyen, peu de zones brûlées ou bouchées). Poids selon le type
  (`config.scene.aesthetic`). Sans visage : 70 % esthétique, 30 % netteté ; avec visages : 10 % esthétique.
- Seuil « coucher de soleil » abaissé de 0,30 à 0,25 après un essai : un ciel du soir un peu terne doit compter.
  À calibrer sur les photos de l'utilisateur (le rapport donne les mesures).

### 18. Groupes de pose et sélection
- Empreinte : vignette de 8 × 8 pixels en couleur. Une photo rejoint le groupe courant si elle diffère de moins de
  0,10 de la précédente et de 0,14 du premier du groupe, sans pause de plus de 20 s ni visage déplacé. Seuils à
  calibrer : le rapport donne l'écart avec la photo précédente.
- Sélection du plan d'origine (budget de 20 % par pose, plafond de 25 % par paquet, au moins une photo, variété) ;
  le seuil absolu de 0,45 est abandonné (notes relatives au paquet).
- Quasi-doublons : écart d'empreinte inférieur à 0,015 seulement (très proche de l'identique), pour ne pas écarter
  des variantes d'une même pose que l'utilisateur aime garder.

### 19. Choix et apprentissage, sur l'iPhone
- Boutons Garder / Supprimer dans la visionneuse ; choix enregistrés dans IndexedDB (mesures seulement, jamais
  d'image), clés « nom de fichier | date de prise de vue », donc retrouvés si on réanalyse les mêmes photos.
- Apprentissage : régression logistique sur les paires « gardée contre supprimée » d'un même paquet ; un poids par
  critère, rappelé vers zéro, plafonné à ±0,4 ; ajustement de la note plafonné à ±0,2. Recalculé entièrement à chaque
  choix. Bouton « Oublier mes choix ».
- Écarté pour l'instant : un modèle d'IA esthétique (lourd, et peu discriminant entre photos quasi identiques).

### 20. Accès complet à la photothèque
Impossible depuis Safari : une page web ne voit que les photos choisies dans le sélecteur. Il faudrait une app
native (Expo), donc un compte Apple Developer (99 €/an) et une installation par TestFlight, possible sans Mac grâce
aux compilations dans le nuage d'Expo (EAS). Gains : choisir « hier » automatiquement, et supprimer les photos
écartées d'une seule confirmation d'iOS. Proposé pour après le jalon 4, à la décision de l'utilisateur.

## Points ouverts pour les jalons suivants (rien n'est codé)

Ces remarques sur le plan seront tranchées avec l'utilisateur le moment venu.

1. **Tester la suppression plus tôt.** Le plus gros risque d'usage n'est pas l'analyse mais la fin : retrouver à la
   main 80 photos sur 100 dans l'app Photos. Proposition : dès le jalon 3, un écran final minimal, et envisager la
   logique inverse — marquer en favori les 20 % à garder (4 fois moins de gestes), puis supprimer le reste de la
   journée d'un coup. Le pont Raccourcis mérite d'être testé avant le jalon 4, car il conditionne cet écran.
2. ~~« Pire visage » sur les visages principaux seulement~~ : fait au jalon 2.
3. **Veto yeux fermés relatif.** Un grand sourire plisse les yeux et ressemble à un clignement. Le veto doit comparer
   la photo aux autres du même groupe plutôt qu'utiliser un seuil fixe.
4. **Groupes de pose sans modèle supplémentaire d'abord.** Essayer temps + position du visage + empreinte visuelle
   simple avant d'embarquer un modèle d'embedding (lourd à télécharger et à faire tourner).
5. **Poids de la formule** : à calibrer sur les paquets annotés, pas avant.
6. **Seuil de 0,45 absolu** : en tension avec le jugement relatif ; la règle du minimum le compense, à vérifier sur
   des cas réels.

## Hébergement

GitHub Pages n'est gratuit que pour un dépôt public. Le premier dépôt (`ClemPhotoScanner`) était privé :
l'utilisateur a créé le dépôt public `Clem_PhotoScanner`, qui devient le dépôt du projet. Le code y est visible,
jamais les photos, qui n'y sont pas.
