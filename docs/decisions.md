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

### 21. Premier test du jalon 3 (43 photos, 17/11)
- **Paquet de 29 photos jugé « paysage »** alors qu'une quinzaine montrent des personnes : le nombre de visages
  attendus et le type de photo étaient décidés sur tout le paquet (médiane : 0 visage), donc les visages étaient
  ignorés partout. Ils se décident maintenant **par groupe de pose**. Les comparaisons de netteté, de couleurs et
  d'arrière-plan restent faites sur tout le paquet. « Coucher de soleil » ou « paysage » se décide sur toutes les
  photos sans personne du paquet (c'est la scène qui compte). Un paquet qui mêle les deux est affiché « Mixte »,
  avec le type de chaque pose.
- **« Assez de photos gardées » n'est pas une raison** (remarque de l'utilisateur) : dans la pose B, l'app gardait
  la n° 17 (0,83, différente) et écartait les n° 11 et 12 (0,87, semblables à la n° 9), car le choix mêlait note
  et variété. La sélection suit maintenant **l'ordre des notes** ; seuls les quasi-doublons (écart d'empreinte
  < 0,015) sont sautés. Le refus cite les photos gardées à sa place et les notes (« Les n° 9 et 11 sont mieux notées
  dans cette pose (87 et 87 contre 83 sur 100) »).
- **Visage invisible ≠ visage parfait** : une photo où la personne est là mais son visage introuvable (de dos, tête
  tournée) reçoit la note typique des visages de sa pose, moins 6 %. Avant, elle était supposée parfaite et passait
  devant des photos où le visage est visible et réussi.
- La seconde recherche de visage fonctionne sur iPhone : sur les photos au téléobjectif (n° 1 à 8), tous les visages
  ont été trouvés par elle.
- Boutons Garder / Supprimer vérifiés sur iPhone : le choix « garder » de la n° 21 figure dans le rapport.
- Inclinaison : force de mesure toujours entre 0,04 et 0,10 sur les vraies photos ; mesures de −5,5° à −11° sur les
  n° 37, 38, 40 et 41, à confirmer par l'utilisateur avant de régler quoi que ce soit.
- Coucher de soleil : les photos de 18:16 à 18:18 n'ont que 0 à 4 % de pixels chauds. Seuil à revoir quand un
  vrai coucher de soleil sera testé.
- Protocole de test pour l'utilisateur : `docs/protocole-test.md`.

### 22. Deuxième test du jalon 3 (43 photos, 41 choix de l'utilisateur)
Mesure de l'accord app / utilisateur sur ses 41 choix : 29 identiques (71 %). Sur les 12 photos qu'il garde, l'app en
gardait 7 ; les 5 autres étaient presque toutes des quasi-jumelles d'une photo gardée (selfies n° 30/31, n° 35/36,
n° 37/38, n° 21 et 28 en plus dans une série de 9 paysages). Corrections :

- **« Seules les notes comptent »** (demande de l'utilisateur) : plus de nombre maximal de photos par pose.
  Toute photo à moins de 0,04 de la meilleure de sa pose est gardée (sauf quasi-doublon). Seul le plafond de 25 %
  par paquet reste, et son refus cite les photos mieux notées.
- **Apprentissage : ajustement centré sur le paquet.** Avec 41 choix, l'ajustement valait +0,20 sur presque toutes
  les photos (critères peu discriminants, comme « exposition équilibrée », au poids maximal) : il relevait tout sans
  rien départager, et des notes affichaient plus de 100. Il est maintenant calculé par rapport à la moyenne du paquet
  (somme nulle), avec un rappel vers zéro quatre fois plus fort et des plafonds plus bas (poids ±0,3,
  ajustement ±0,15).
- **Couleurs** : avec des personnes au premier plan, elles ne servent plus qu'à départager (3 % de la note au lieu
  de 10 %). Demande de l'utilisateur.
- **Personnes vues de dos** : dans un groupe sans visage, une personne présente au même endroit sur au moins 60 %
  des photos est un sujet (ex. un couple de dos face à la mer), plus un passant d'arrière-plan.
- **Paquets réunis à la main** : bouton « Même série que le paquet N : les réunir » (et « Séparer à nouveau »), pour
  une série prise sur plusieurs minutes (photos par le hublot). Pas de réunion automatique : les photos d'une même
  série par le hublot diffèrent autant que deux scènes différentes (écart d'empreinte 0,20).
- Observé, non traité : sur les selfies n° 30/31, l'utilisateur garde celle où **la main n'est pas coupée** en bas.
  Demande un modèle de pose du corps (poignets, coudes) : proposé pour le jalon suivant.
- Les paquets d'une seule photo sont toujours gardés (règle « au moins une photo par paquet ») ; l'utilisateur en a
  supprimé trois. Question posée.

## Jalon 4 : passer à l'action, cadrage du corps, zoom

Plan préparé avant le code : `docs/jalon-4.md`.

### 23. Réponses de l'utilisateur (17/11) et ce qu'elles ont changé
- **Suppression dans Photos** : il coche plusieurs photos avec « Sélectionner », ou trie photo par photo. Écran
  « À supprimer » : chaque paquet dans l'ordre exact de Photos (ordre de prise de vue), photos à supprimer marquées,
  heures de début et de fin, marche à suivre, case « Fait dans Photos » mémorisée (stockage local du navigateur).
- **Paquet entièrement supprimable** si toutes ses photos sont ratées. Le veto n'est plus levé quand tout le paquet
  est concerné (règle du plan d'origine, abandonnée à la demande de l'utilisateur). Photo ratée : défaut
  rédhibitoire, ou très floue sans personne (netteté < 15, seuil de départ : les photos de ciel par le hublot du
  17/11 mesuraient 12 à 43 ; l'utilisateur a supprimé celles à 12 et 27, gardé celle à 43).
- **Photos penchées par le hublot** : confirmées penchées par l'utilisateur (mesures 5,5° à 11°, force 0,04 à 0,05).
  Seuil de fiabilité abaissé de 0,10 à 0,04, et inclinaison jugée **par rapport à la photo la plus droite du paquet**
  (par le hublot, tout est penché : on préfère la moins penchée).
- **Bords du hublot** : part de l'image envahie depuis un bord par une zone sombre et uniforme (grille de 24 × 18
  cases, propagation depuis les bords), comparée à la photo la plus dégagée du paquet. Seulement sans personne au
  premier plan : sur un portrait, des vêtements sombres touchent souvent le bord (vérifié en test : 7 à 12 %).
- **Modèle du corps ajouté** (MediaPipe Pose Landmarker lite, 5,8 Mo, même bibliothèque 0.10.34). Main coupée :
  coude dans l'image et poignet ou index à moins de 2 % du bord (le modèle place une main coupée tout contre le bord,
  0,99, plutôt qu'en dehors : constaté en test). Pieds coupés : genou dedans, cheville ou orteils au bord. Comparé à
  la photo la mieux cadrée du même groupe de pose (le bras qui tient le téléphone d'un selfie est coupé partout).
  Couper au-dessus du genou n'est pas compté (cadrage classique « à mi-cuisse »). Coût mesuré : environ 85 ms par
  photo sur ordinateur.
- **Zoom** dans la visionneuse : pincer, double toucher, déplacer ; la photo d'origine (référence au fichier choisi,
  rien n'est copié) remplace l'image réduite pendant le zoom, une seule à la fois en mémoire.
- Le rapport donne les positions des coudes, poignets et index, pour calibrer sur les photos de l'utilisateur.

### 24. Autres modèles proposés, en attente de validation
Voir le tableau de `docs/jalon-4.md` : reconnaissance de gestes (main devant le visage, gestes voulus), silhouette
des personnes, empreinte d'image, classement de scène. Rien n'est ajouté sans l'accord de l'utilisateur.

### 25. Premier test du jalon 4 sur iPhone : main coupée, double toucher, modèles candidats
- **Double toucher** : le zoom s'annulait au bout d'une seconde. Sur iPhone, le système rejoue un double toucher
  comme un double clic de souris environ une seconde après ; le geste était donc compté deux fois. Les doubles clics
  qui suivent un toucher de moins de 1,5 s sont ignorés.
- **« Main coupée » jamais affichée sur les selfies n° 30/31.** Audit :
  - la règle exigeait le coude dans l'image ; sur une photo très proche, une main au bord apparaît sans son coude.
    Ajout : une main **en partie visible** (un de ses points dans l'image, un autre au bord ou dehors) compte comme
    coupée ; même chose pour les pieds (cheville, talon, orteils) ;
  - si le modèle du corps ne trouve pas une personne vue par le détecteur d'objets, seconde recherche sur un
    recadrage autour d'elle (comme pour les visages).
  - Essais en navigateur sur un portrait réel recadré au milieu des mains : le **modèle du corps** place les coudes
    hors de l'image mais situe mal les mains au bord ; le **modèle des mains** (Hand Landmarker) ne trouve **aucune**
    main coupée (0 main) : il ne reconnaît que des mains entières ; un indice **« couleur de peau au bord »** a été
    essayé puis retiré : il se trompait sur un bureau en bois et des rideaux rouges (6,8 % de « peau » au bord de la
    photo entière, 1,6 % sur la photo coupée).
  - Le **modèle de silhouette avec peau** (Selfie Multiclass, 15,6 Mo) sépare nettement les deux : 0,00 % de peau du
    corps sur les bords de la photo entière, 5,49 % sur la photo coupée aux mains. Proposé à l'utilisateur comme
    vrai détecteur de main ou de bras coupé. Coût mesuré sur ordinateur : environ 0,5 s par photo.
- **Clarté** : l'utilisateur ne voyait pas la différence entre les onglets et se demandait si l'app supprime des
  photos. Onglets renommés « 1. Trier » et « 2. Dans Photos » ; boutons « ✓ À garder » / « ✕ À supprimer » avec la
  mention « Rien n'est supprimé ici ».
- Les choix de l'utilisateur sont conservés d'une version à l'autre (stockage local de l'iPhone) : voulu, pour
  l'apprentissage. Effaçables par « Oublier mes choix ».

### 26. Deuxième test du jalon 4 (33 photos, 67 choix) : trois modèles ajoutés, modèle du corps retiré
Retours de l'utilisateur, avec captures :
- **« Pieds coupés » sur la photo moto n° 29** alors que les pieds sont cachés par une robe : le modèle du corps
  comptait 2 pieds coupés sur cette photo et 1 sur les autres (bruit). **« Main coupée » sur le mauvais selfie**
  (n° 16 au lieu de n° 15) : corps trouvés différemment d'une photo à l'autre. Le modèle du corps est **retiré** ;
  mains, bras et jambes coupés sont repérés par la **silhouette avec peau** (Selfie Multiclass) : part de peau du
  corps sur les bandes de bord, comparée à la photo du même groupe de pose qui en a le moins. Des pieds cachés ou
  chaussés ne sont plus un argument. Vérifié en navigateur : 0 % sur un portrait entier, 5,6 % coupé aux mains.
- **« Bords masqués » sur la ruelle n° 27** (murs sombres) : cette mesure ne s'applique plus qu'aux photos prises
  d'un avion, reconnues par le **classement de scène** (catégories « avion de ligne » ou « aile »), avec des seuils
  relevés (8 % à 30 % au lieu de 3 % à 20 %).
- **4 poses pour 6 photos de la plage** : l'utilisateur zoomait entre les prises (33, 44, 58 mm), ce qui changeait
  l'empreinte de 8 × 8 pixels. Les poses utilisent l'**empreinte fine** (MobileNet v3 small) ; en rafale (moins de 4 s,
  même nombre de visages), même pose sauf scène vraiment différente (ressemblance < 0,5). Seuils à calibrer : le
  rapport donne la ressemblance avec la photo précédente.
- **Quota de 25 % retiré** (demande explicite : « un paquet de 2 photos peut garder les 2 »). Contrainte mise à jour
  dans `CLAUDE.md`.
- **Commentaire sur chaque choix** : zone « Pourquoi ? » dans la visionneuse après « À garder » ou « À supprimer »,
  enregistré avec le choix et repris dans le rapport.
- **Visage masqué** : mesuré par la part de peau de visage dans sa boîte (silhouette), comparée à la même personne
  sur les autres photos ; la mesure par les couleurs ne sert plus que si la silhouette manque.
- **Quasi-doublons** : ressemblance d'empreinte fine ≥ 0,985 (vérifié : deux copies de la même photo, 1,000).
- **Types de photo** ajoutés grâce au classement : document ou capture d'écran, nourriture, animal (photos sans
  personne).
- Coût mesuré sur ordinateur : environ 0,55 s par photo pour les trois modèles ensemble ; à mesurer sur iPhone.

### 27. Explications de l'utilisateur sur quatre de ses choix (17/11)
- Plage n° 3 / n° 4 : « j'aurais pu garder les 2 » (n° 4 pour le regard, n° 3 pour le profil et les deux personnes
  en arrière-plan). → Marge de sélection élargie de 0,04 à 0,06 : deux bonnes photos proches sont gardées toutes
  les deux plus souvent. Regard un peu plus compté (0,12 au lieu de 0,10, pris sur la netteté du visage) : à 0,15, un visage souriant
  qui regarde au loin passait derrière un visage neutre tourné vers l'objectif, contre la remarque du 17/11
  (« regarder au loin peut faire une superbe photo ») ; 0,12 respecte les deux remarques.
- Rue n° 24 : gardée parce qu'un peu plus zoomée (cadrage). Ruelle n° 25 : gardée parce que prise de plus loin
  (profondeur), et parce qu'un passant apparaît sur la n° 27. → Le cadrage préféré dépend de la scène : c'est du goût,
  laissé à l'apprentissage (et, plus tard, à un apprentissage sur l'empreinte fine de l'image). Le passant, lui,
  est mesurable : sans personne au premier plan, une personne qui apparaît pèse trois fois plus et est signalée dès
  un poids de 0,05 (au lieu de 0,5).
- Moto n° 33 : « les sourires, les doigts en V, le regard vers le photographe : l'alignement de tous ces petits
  détails ». Sourire et regard sont mesurés ; le V ne l'est pas : il faudrait le modèle des gestes, proposé à
  nouveau à l'utilisateur.

### 28. Captures d'écran mises de côté, modèle des gestes (18/11)

- **Captures d'écran, QR codes, cartes, documents** : l'utilisateur laissait le choix entre « ne pas les analyser » et
  « toujours les garder ». Retenu : les deux. Elles sont **mises de côté** (comme les RAW) : ni analysées en détail,
  ni rangées dans un paquet, ni proposées à la suppression ; elles apparaissent en vignettes dans « Mis de côté ».
  Deux façons de les reconnaître :
  - **capture d'écran ou image enregistrée** : aucune marque d'appareil ni focale dans les métadonnées. Pas de modèle
    lancé, donc plus rapide ;
  - **photo d'un document ou d'un écran** : catégorie principale du classement de scène parmi documents (site web,
    menu…) ou écrans (moniteur, télévision, ordinateur, téléphone), avec un score d'au moins 0,3, et aucun visage.
  Une photo aux métadonnées illisibles n'est pas mise de côté (rien n'est présumé).
- **Gestes** (accord de l'utilisateur, 18/11) : modèle « Gesture Recognizer » de MediaPipe (8,4 Mo, servi par la même
  bibliothèque 0.10.34). Lancé seulement sur les photos avec visage. Un V, un pouce levé ou le signe « je t'aime »
  (score ≥ 0,6) donne la raison « Geste voulu » et un bonus de 5 % à la note, comme une pose. Nouveau critère appris
  `geste`.
- **Sélection dans la galerie** : le sélecteur de photos appartient à iOS ; l'app ne peut ni le modifier ni ajouter
  une sélection « de la première à la dernière ». Le glisser du doigt sur plusieurs vignettes est une fonction
  d'iOS, à essayer dans ce sélecteur.
- **Constat sur le rapport du 18/11** (82 photos, 75 choix) : accord 55 % ; l'app ne propose de supprimer que 3
  photos que l'utilisateur garde (sur 26), mais garde 31 photos qu'il supprime. Elle garde trop (49 sur 82, contre
  26 pour l'utilisateur), surtout dans les longues poses de paysage, où les notes sont très proches. Simulation sur
  le rapport : marge 0,03 → accord 66 %, 22 photos sur 26 retrouvées ; marge 0,06 → 55 %, 23 sur 26. Marge laissée à
  0,06 pour l'instant ; proposition faite à l'utilisateur : un état « à vérifier » pour les photos presque aussi
  bonnes.

### 29. « À vérifier », et audit de durabilité (18/11)

- **Troisième état « à vérifier »** (demande de l'utilisateur) : dans chaque pose, la meilleure est gardée ; une photo
  à moins de 0,01 d'elle aussi (ex aequo) ; à moins de 0,03, elle est **à vérifier** : pastille bleue « ? », carte
  « À vérifier » en tête de « 1. Trier », et l'utilisateur tranche avec « À garder » / « À supprimer ». Tant qu'il n'a
  rien dit, elle est **gardée** (jamais supprimée sans lui). Au-delà de 0,03 : à supprimer. Sur le rapport du 18/11,
  cela donne environ 38 photos gardées et 7 à vérifier, au lieu de 49 gardées. Ses choix sur ces photos sont les plus
  utiles à l'apprentissage.
- **Audit de durabilité** :
  1. *Effacement des choix par Safari* : le rapport indique « installée : non ». Dans un onglet Safari, iOS peut
     effacer le stockage d'un site non visité pendant 7 jours, donc les choix et l'apprentissage. Corrigé en partie :
     l'app demande un stockage durable (`navigator.storage.persist`), le rapport dit s'il est accordé, et l'accueil
     conseille d'installer l'app sur l'écran d'accueil (marche à suivre en 3 étapes).
  2. *Mise à jour sur une connexion faible* (cas du 17/11) : l'accueil affiche « mise à jour en cours » puis « prête,
     fermez et rouvrez ».
  3. *Critères qui changent de sens* : chaque choix enregistre désormais la version des critères (`v`), pour pouvoir
     plus tard écarter ou recalculer les choix anciens si un critère est redéfini. Un critère ajouté vaut 0,5 dans
     les anciens choix (déjà le cas).
  4. *Captures d'écran* : des métadonnées illisibles ne font plus passer une vraie photo pour une capture ; le
     commentaire « Screenshot » écrit par iOS est reconnu.
  5. *Mémoire* : six modèles MediaPipe chargés en même temps (chacun avec son moteur). Le rapport du 18/11 (82 photos)
     n'a montré aucun arrêt ; le modèle des gestes ne tourne que sur les photos avec visage. À surveiller sur de plus
     grosses journées (une analyse interrompue est signalée à l'accueil).
  6. *Apprentissage* : des poids touchent déjà leur plafond (équilibre +0,30) avec 76 choix, signe de bruit. Rester
     prudent : plafonds inchangés, et l'état « à vérifier » apporte des choix plus informatifs.

### 30. Écran tenu allumé pendant l'analyse (18/11)

- **Constat** : l'iPhone s'est mis en veille 2 à 3 fois pendant une analyse (rapport du 18/11 : « Écran maintenu
  allumé : non », alors que le Wake Lock est géré par Safari). Le verrou n'était demandé qu'une fois, sans reprise,
  et iOS le retire dès que la page passe en arrière-plan.
- **Correction** (`keepScreenAwake`, `src/platform/device.ts`) : verrou système redemandé au retour au premier plan
  et avant chaque photo ; si le système refuse, secours par une vidéo muette de 2 secondes (`public/nosleep.mp4`,
  1,5 Ko, invisible, en boucle). Le rapport indique la méthode, le nombre de reprises et la raison d'un échec.
- Pas encore testé sur iPhone : à vérifier avec une analyse longue (écran à ne pas toucher pendant 2 minutes).

### 31. Une photo par pose, poses moins découpées, apprentissage prudent, suppression par Raccourcis (18/11)

Retours de l'utilisateur sur le rapport du 18/11 (44 photos) : « deux photos identiques gardées, c'est à l'app de
trier » (bateau n° 19/20) ; « 4 photos gardées sur 5 alors qu'une seule suffit » (baignade n° 12 à 16) ; « je ne vais
pas supprimer moi-même les photos ».

- **Une photo gardée par pose**, la mieux notée. « Ex aequo gardés » est retiré. « À vérifier » ne reste que pour les
  photos de personnes, à moins de 0,02 de la meilleure (une expression peut départager). Paysages : l'app tranche.
- **Poses moins découpées** : en rafale (6 s au plus entre deux photos), même pose si la ressemblance reste d'au moins
  0,6, que les visages aient été trouvés ou non. La baignade (5 photos en 5 s) était coupée en 4 poses parce que les
  visages, dans l'eau et de loin, étaient trouvés sur certaines photos seulement.
- **Apprentissage prudent** : avec 42 choix (app réinstallée), il décalait les notes de ±0,15, plus que l'écart entre
  deux photos d'une rafale, et dans des sens contradictoires (photo penchée préférée…). Les poids sont désormais
  multipliés par n / (n + 150), n = nombre de choix, et l'ajustement plafonné à 0,08.
- Estimation sur ce rapport : environ 19 photos gardées sur 43 au lieu de 30 (l'utilisateur en garde 13).
- **Suppression par l'app Raccourcis** (contrainte « aucune suppression automatique » respectée : iOS demande
  confirmation, et les photos restent 30 jours dans « Supprimés récemment ») : bouton « Supprimer les N photos » dans
  « 2. Dans Photos ». Il ouvre le raccourci « Photo Triage » (créé une fois par l'utilisateur, marche à suivre dans
  l'app) avec les noms des photos (nom du fichier sans extension, une par ligne). Le raccourci cherche chaque photo
  par son nom (la plus récente si deux portent le même nom) puis les supprime en une fois. Une app web ne peut pas
  supprimer elle-même : c'est le seul pont sans app native.
- **App native** (question de l'utilisateur) : possible sans ordinateur en construisant l'app sur les serveurs de
  GitHub (Mac loués) et en l'installant par TestFlight, mais il faut un compte développeur Apple (99 € par an) et une
  réécriture partielle (accès direct à toute la photothèque, sans sélection, et suppression). Proposé seulement si
  le pont Raccourcis ne suffit pas.

### 32. Raccourci : comparaison des noms par le raccourci lui-même (18/11)

Essais de l'utilisateur : la liste des noms arrive bien dans le raccourci (« IMG_0696 », « IMG_0697 »), et
« Obtenir le nom » d'une photo renvoie bien « IMG_0701 », mais le filtre « Nom » de « Rechercher des photos » ne trouve
rien, que ce soit avec « est » ou « contient ». Le raccourci est donc refait sans ce filtre : il parcourt les photos des
14 derniers jours, lit le nom de chacune et garde celles dont « <nom> » figure dans le texte reçu. L'app entoure chaque
nom de chevrons (« <IMG_0696> ») : la correspondance est exacte (pas de « contient » approximatif, remarque de
l'utilisateur). L'iPhone demande toujours confirmation, avec le nombre de photos. Au-delà de 14 jours, l'app prévient
que le raccourci ne les trouvera pas.

**Complément (18/11, soir)** : l'utilisateur a constaté que six photos de sa photothèque s'appellent « IMG_0696 »
(le compteur de l'iPhone repart à zéro, photos reçues…). Le nom seul ne suffit donc pas, d'où les échecs. L'app
envoie désormais « <IMG_0696|2026-11-18 22:45:12> » : nom et heure de prise de vue à la seconde, dans le fuseau
actuel de l'iPhone. Elle tient compte du fuseau du lieu de la photo (`OffsetTimeOriginal`), pour qu'une photo prise en
voyage soit bien retrouvée. Le raccourci forme la même clé avec « Obtenir le nom », « Date de prise de vue » et
« Formater la date » (format yyyy-MM-dd HH:mm:ss). Si une heure ne correspond pas, la photo n'est pas trouvée, donc
pas supprimée : l'erreur possible est toujours du côté prudent.

**Complément (19/11, raccourci rapide)** : parcourir toutes les photos des 30 derniers jours était très lent (quatre
actions par photo, plus de mille photos). Les essais ont aussi montré que le filtre « Nom » de « Rechercher des
photos » fonctionne (il trouvait les six « IMG_0696 ») : les échecs venaient d'actions branchées sur la mauvaise
entrée et d'un format de secondes sans zéro (« s » au lieu de « ss »). Nouveau raccourci : pour chaque nom reçu, une
recherche par nom (quelques photos seulement), puis la vérification exacte « <nom|heure> » sur ces quelques photos.
L'app envoie les noms un par ligne, puis toutes les clés sur la dernière ligne. Plus de limite de 14 ou 30 jours.

### 33. Raccourci de suppression : une recherche par photo, nom + fenêtre de temps (19/11)

Retour de l'utilisateur : bien plus de six photos portent le même nom, et parcourir les photos (même celles d'un seul
nom) reste lent. « On tourne en rond » : il faut une solution robuste.

- **Principe** : pour chaque photo à supprimer, UNE recherche dans Photos avec deux filtres à la fois : Nom est
  « IMG_0696 », et Date de création entre « 22:29:51 » et « 22:29:55 » (±2 s autour de la prise de vue). Un même nom
  et une même seconde à 2 s près désignent une seule photo. Plus de boucle sur la photothèque, plus de comparaison de
  texte dans le raccourci (fini les pièges de format, comme « s » au lieu de « ss »), pas de limite de jours.
- **Texte envoyé** : une ligne par photo, « nom|début|fin », dates « yyyy-MM-dd HH:mm:ss » dans le fuseau actuel de
  l'iPhone (année en premier : pas d'ambiguïté jour/mois). Le raccourci les découpe avec « Scinder le texte » (|) et
  « Obtenir l'élément de la liste ».
- **Sécurité** : le raccourci affiche les photos trouvées (« Afficher le résultat ») avant la confirmation d'iOS ;
  l'app dit combien il doit y en avoir. Une photo sans heure de prise de vue n'est pas envoyée (l'app le signale). La
  liste envoyée est consultable dans l'app.
- **Pourquoi pas la milliseconde seule** : l'heure de Photos et celle des métadonnées de la photo peuvent différer de
  quelques millisecondes ; une égalité exacte serait fragile. Nom + fenêtre de 2 s est sûr et tolérant.
- **Limite connue** : je ne peux pas exécuter l'app Raccourcis moi-même ; si « est entre » n'accepte pas une variable
  texte, ajouter « Obtenir les dates depuis l'entrée » sur les éléments 2 et 3 (consigne donnée à l'utilisateur).

**Validé sur l'iPhone le 19/11** : suppression réussie et rapide (3 photos de test). Points appris pendant la
construction : une variable se met dans un champ de date par un appui long, puis « Sélectionner la variable » ; les
sorties de « Obtenir l'élément de la liste » portent toutes le même nom, d'où « Définir la variable » (Nom photo,
Début, Fin) pour éviter toute confusion ; l'ordre des blocs compte. Le guide dans l'app reprend exactement cette
version.

### 34. Rapports conservés, affichage mieux calibré (19/11)

- **Rapports** : chaque analyse enregistre son rapport sur l'iPhone (IndexedDB, base passée en version 2), mis à jour
  une seconde après chaque choix ; on garde les 10 derniers, 30 jours au plus. Liste à l'accueil et dans Diagnostic,
  avec « Partager » (feuille de partage d'iOS, vers l'app Claude par exemple) et « Copier » un ou tous les rapports.
  L'app n'envoie toujours rien elle-même : c'est l'utilisateur qui choisit de partager.
- **Affichage trop zoomé** : Safari zoome sur un champ de texte dont la police fait moins de 16 px (la case
  « Pourquoi ? » faisait 15 px) et reste zoomé ensuite. Corrigé : 16 px, `maximum-scale=1` dans la balise viewport
  (empêche ce zoom automatique), `touch-action: manipulation` (pas de zoom par double toucher hors visionneuse),
  aucun débordement horizontal (vérifié sur les quatre écrans), titres et boutons un peu plus compacts.

### 35. Réglage 8 : sauvegarde des goûts, séances, comparaison, apprentissage par l'image en test (19/11)

Plan et audit des risques : `docs/jalon-5.md`.

- **Sauvegarde** : fichier `photo-triage-gouts.json.gz` (JSON compact versionné, mesures en millièmes, empreinte
  de l'image en base64 sur 8 bits ; gzip si disponible), enregistré par la feuille de partage d'iOS dans iCloud Drive
  › Photo Triage. Rappel à l'accueil (20 nouveaux choix, ou 14 jours). Restauration = fusion, rien n'est effacé.
- **Séances** : « séance » au lieu de « journée », date au-dessus de chaque jour, dernière séance rappelée à
  l'accueil (« continuez après le … à … »), alerte si un paquet recoupe ou suit de près la séance précédente.
- **Apprentissage par l'image, en test** : l'empreinte est enregistrée avec chaque nouveau choix. Vote des choix
  voisins (autres paquets seulement), centré sur la pose. Aucune influence sur les décisions : le rapport donne
  l'accord brut, l'accord **honnête** (goûts appris sans les choix du paquet évalué ; remarque de l'utilisateur :
  le 83 % était gonflé) et l'accord simulé avec le vote de l'image, à partir de 20 choix avec empreinte.
- **Comparer** : depuis la visionneuse, deux photos d'une même pose l'une sous l'autre, zones qui changent
  entourées (alignement ± 6 %, écarts de couleur par case), différences mesurées en clair, et « Garder l'une,
  supprimer l'autre » d'un toucher.

### 36. Séance perdue au retour d'une autre app, commentaire difficile à saisir (19/11)

- **Constat** : l'utilisateur a quitté l'app pour une autre ; au retour, l'app était revenue à l'accueil (séance
  perdue), avec « 0 choix » et « jamais sauvegardés ».
- **Cause certaine de la séance perdue** : iOS ferme en arrière-plan les apps web qui prennent de la mémoire ; au
  retour, la page est rechargée et la séance n'existait qu'en mémoire. **Correction** : la séance (mesures,
  vignettes, aperçus, réglages) est enregistrée sur l'iPhone (IndexedDB, base version 3) et reprise d'elle-même au
  lancement suivant, pendant 14 jours ou jusqu'à la séance suivante. Seule perte : le zoom montre l'aperçu et non la
  photo d'origine (qu'une app web ne peut pas relire après fermeture).
- **Choix et réglages disparus** : la base IndexedDB et le stockage local étaient vides tous les deux, ce qui ne
  s'explique pas par la fermeture seule. Causes possibles : icône de l'app supprimée puis remise sur l'écran
  d'accueil (chaque icône a son propre stockage), ou base inaccessible. **Protections** : copie de secours des
  choix dans le stockage local (reprise automatique si la base est vide ou illisible) ; mise à jour de base qui ne
  peut plus rester bloquée ; état du stockage dans le rapport (base, choix repris, séance reprise) ; et la
  sauvegarde iCloud permet de tout restaurer.
- **Commentaire** : la case était tout en bas du panneau, difficile à atteindre. Remplacée par un bouton juste sous
  « À garder / À supprimer », qui ouvre une fenêtre en haut de l'écran (au-dessus du clavier) avec des raisons
  fréquentes à toucher (« Meilleur sourire », « Yeux fermés », « Main ou pied coupé »…).

### 37. Réglage 9 : plusieurs photos d'une même pose, regard en groupe, photo prise par erreur, lots de 49 (19/11)

Règle de l'utilisateur (19/11) : « si c'est vraiment des photos identiques, je supprime… si les personnes bougent un
petit peu, changent de geste, apportent quelque chose de différent, alors je peux toutes les prendre, si elles sont
bien. S'il n'y a pas des yeux fermés, s'il n'y a pas un geste indésiré ».

- `src/engine/selection/difference.ts` mesure ce qui change entre deux photos d'une pose : tête (rotation), expression
  (sourire, moue, bouche), regard, gestes voulus, personnes qui bougent ou changent de nombre, cadrage (empreinte
  fine, ou empreinte simple à défaut). Trois niveaux : aucune, légère, nette. Seuils dans `config.selection.different`.
- Sélection dans une pose : la meilleure est gardée. Une autre photo est gardée en plus (« différente ») si elle est
  nettement différente de chaque photo déjà gardée, sans défaut bloquant (`config.selection.blocking` : yeux, parle,
  visage masqué ou flou, regard ailleurs, erreur probable…) et à moins de 0,08 de la meilleure. Légèrement différente
  et presque aussi bonne : « à vérifier ». Identique : supprimée (« trop proche »), même si sa note est égale. Une
  image quasi identique reste « trop proche » sauf si un visage change nettement.
- Photo de groupe : les gens doivent regarder l'objectif (poids du regard 0,3 sur les visages d'une photo de groupe,
  raison « quelqu'un regarde ailleurs »). Une personne seule peut regarder ailleurs.
- Photo prise par erreur (pied, sol) : aucune personne, floue, nettement penchée → note baissée, et « à vérifier »
  si c'est la seule du paquet.
- Objets parasites : seuls ceux détectés avec assurance (≥ 0,7) comptent (le frisbee imaginaire du rapport).
- Raccourci : iOS refuse d'en supprimer 50 ou plus d'un coup ; l'utilisateur garde cette protection. L'écran
  « À supprimer » envoie des lots de 49 (« Supprimer le lot 1 sur 3 »).
- Non traité : yeux plissés (données contradictoires), geste indésiré (pas détectable de façon fiable).

### 38. Réglage 10 : nouvelle présentation, paquets selon le contenu, accords silencieux, yeux plissés (19/11)

Demandes de l'utilisateur après le réglage 9, validées point par point avant de coder :

- **Paquets selon ce que montrent les photos** (« ça dépend des sujets et des poses, pas du timing »). Une photo
  rejoint le paquet en cours si elle ressemble (empreinte fine ≥ 0,55) à l'une de ses 4 dernières photos, ou si elle
  suit de moins de 10 s (rafale) ; jamais au-delà de 3 h. Sans empreinte : écart de temps, comme avant. Seuil mesuré
  sur les 106 photos de sa sauvegarde : même paquet, 3 paires sur 4 au-dessus de 0,59 ; paquets différents, 9 sur 10
  sous 0,44. Le curseur de temps passe dans Réglages (interrupteur « Selon ce que montrent les photos »).
  Cas réel : même paysage photographié à 1 h 10 d'écart, plus zoomé la 2e fois : désormais un seul paquet.
- **« À vérifier » laissé dans son paquet** : plus de section en haut, plus d'encadré rouge dans l'onglet de
  suppression. Le paquet est souligné en bleu, avec une phrase d'explication ; la visionneuse montre une bande de
  miniatures du paquet pour comparer.
- **Accords silencieux** (« quand je clique pas c'est que je suis d'accord ») : quand un paquet part au raccourci (ou
  est marqué « Fait »), chaque photo non touchée est enregistrée comme un choix « laissé tel quel »
  (`ChoiceRecord.implicit`). L'apprentissage et l'accord honnête en tiennent compte : avant, seules les corrections
  comptaient, et l'accord affiché (0/6 au rapport du 19/11) ne mesurait que les désaccords. Ces choix ne sont pas
  affichés comme « votre choix ». Sauvegarde : une 10e colonne, les anciennes sauvegardes se lisent toujours.
- **Yeux plissés jugés par personne** (soleil de face : tout le monde plisse les yeux). Ouverture habituelle de chaque
  personne = médiane sur sa pose (3 photos au moins) ; en dessous de 0,6, des yeux « fermés » ne sont pas un
  clignement (raison « yeux plissés », pas de veto). Un vrai clignement (yeux grands ouverts ailleurs) reste un défaut.
- **Sauvegarde** : nom daté (« Photo Triage 2026-11-19 19h20 (182 choix) ») ; le nom du dernier fichier est affiché ;
  alerte à l'accueil si l'iPhone a moins de choix qu'à la dernière sauvegarde. Rappel : une mise à jour de l'app
  n'efface pas les choix.
- **Présentation** façon Apple : trois onglets à icônes (Trier, Supprimer, Réglages), grands titres et barre compacte
  en défilant, résumé en trois cases, meilleure photo de chaque pose en grand avec une étoile, bouton flottant vers la
  suppression, écran de suppression centré sur un seul bouton avec la progression des lots. Le Diagnostic, la
  sauvegarde, les rapports, le guide du raccourci et « Oublier mes choix » (double confirmation, rubrique « Avancé »)
  sont dans Réglages ; le détail par photo du diagnostic est replié. La suppression à la main est repliée dans
  « Détail par paquet » (GoPro, autre appareil, photos sans date). Mode sombre seulement : les photos s'y jugent mieux
  et la barre d'état de l'iPhone reste lisible (texte blanc).
- Non retenu pour l'instant : « Supprimer tout le paquet » (l'utilisateur verra plus tard).
- Audit du 19/11 (corrigé) : un paquet n'est « Fait » que si toutes ses photos sont parties au raccourci (les photos
  sans date restent à supprimer à la main) ; rouvrir un paquet efface ses accords silencieux ; yeux habituels =
  médiane sur les autres photos de la personne (deux clignements sur quatre restent des défauts) ; à la
  restauration, un vrai choix l'emporte toujours sur un accord silencieux ; l'alerte « goûts perdus » ne compte que
  les vrais choix et se remet à zéro après « Oublier mes choix » ; l'interrupteur des paquets est gardé sur l'iPhone.

### 39. Retours du 19/11 au soir : planche de surf, regard seul, poses, jambes, netteté du visage, comparaison

Rapport de 38 photos (surf), accord 7/23 :

- **Objet qui fait partie du sujet** (planche de surf entre deux personnes : « il faut la voir comme une 3e
  personne ») : quand une planche, des skis, un vélo, un chien… est détecté (≥ 0,5), « objet devant la personne » ne
  compte plus (`config.content.subjectObjects`).
- **Personne seule** : elle peut regarder ailleurs. Le regard ne compte plus dans sa note (poids 0) ; tête baissée ou
  levée de 25° ou plus, des paupières « fermées » ne sont pas un clignement (photo 3, tête baissée de 42°, gardée).
  En groupe, rien ne change : tout le monde doit regarder.
- **Même pose malgré un cadrage qui bouge** : en rafale, des photos très ressemblantes (≥ 0,8) restent dans la même
  pose même si le visage se déplace dans l'image (paquet 1 : la photo 1 était seule en pose A et gardée d'office).
- **Jambes coupées par le bas** : cadre naturel, plus un défaut. Seuls les bords gauche et droit, hors du bas de
  l'image, comptent (mains, bras coupés).
- **Netteté** : avec des personnes, c'est la netteté des visages qui compte, plus celle de l'image entière.
  La comparaison ne parle plus de « l'image plus nette » quand il y a des visages : c'était l'incohérence relevée
  (une photo « plus nette » mais moins bien notée, à cause d'un arrière-plan plus net).
- **Comparaison côte à côte** : gauche (jaune) et droite (bleu), note sur 100, « Garder celle-ci », puis un tableau
  « Pourquoi ces notes » avec chaque critère qui diffère (le meilleur en vert) et la part des goûts appris.
- **Visionneuse** : la bande de miniatures du paquet reste visible après « Garder » ou « Supprimer ».
- **Légende** sous le résumé : étoile = meilleure de sa pose, coche = gardée, ? = à départager, croix = à supprimer.
- **Relecture** : l'objet-sujet doit toucher la zone d'une personne et vaut pour tout le groupe de pose (une planche
  manquée sur une photo n'y devient pas « objet devant ») ; « tête baissée » se juge par rapport à l'objectif (un
  selfie pris d'en haut reste vérifié pour les clignements) ; la comparaison ne montre plus le regard comme une raison
  quand la personne est seule, et les photos y sont affichées entières (zones qui changent bien placées).

### 40. Séances terminées et rouvertes, paquets sans interrupteur, groupe ≠ personne seule, accessoire en main (20/11)

- **Séance terminée** : quand tous les paquets à supprimer sont partis au raccourci (ou marqués « Fait »), la séance
  se termine : ses photos ne s'affichent plus dans Trier ni Supprimer, la pastille rouge disparaît. Écran « Séance
  terminée » : Nouvelle séance, Rouvrir cette séance, Toutes les séances.
- **Toutes les séances sont gardées** sur l'iPhone (vignettes, aperçus, mesures, réglages ; jamais les photos
  d'origine), listées dans Réglages › Séances, avec « Rouvrir » et une corbeille pour en effacer une. Format :
  `src/platform/storage/sessionStore.ts` (`s:<id>` complet, `i:<id>` résumé, `courante` pointeur) ; l'ancien format
  (une seule séance) est repris à la première lecture. Une séance terminée ne se rouvre plus seule au lancement ; une
  séance en cours se rouvre seule pendant 14 jours, ensuite seulement depuis la liste. « Seule » ou « groupe » : on ne
  compte que les personnes au premier plan (3 % de l'image au moins), pas les passants.
- **Interrupteur « Selon ce que montrent les photos » retiré** (« ça doit toujours être le cas ») : les paquets sont
  toujours découpés selon le contenu ; le temps ne sert plus que si l'empreinte manque.
- **Groupe ≠ personne seule** (« pas le même nombre de personnes, ça peut pas être le même paquet ») : passer d'une
  photo d'une seule personne à une photo de groupe (personnes détectées), ou l'inverse, ouvre un nouveau paquet, sauf
  scène presque identique (≥ 0,8). En rafale aussi, deux photos sans rapport (ressemblance < 0,4) sont séparées
  (selfie à trois puis portrait 9 s après : 0,21).
- **Objet en main : tout dépend de l'intention** (21/11). Tasse levée en train de boire : elle fait partie de
  l'attitude, pas une gêne. Bouteille d'eau tenue bras baissé, qu'on ne veut pas montrer : elle gêne et baisse un peu
  la note. Indice retenu : la hauteur de l'objet par rapport au visage. Tasse, verre, bouteille ou téléphone sur le
  corps d'un sujet et à moins de 2,5 hauteurs de visage sous son visage (bouche, poitrine) : voulu ; plus bas : gênant.
- Non traité : « mieux cadrée (mieux zoomée) » (photo 11) ; préférence de cadrage serré à apprendre plus tard.

### 41. Jalon 6, réglage 12 : tri éclair, justesse honnête, confiance calibrée (21/11)

Plan et mesures : `docs/jalon-6.md`. Constat mesuré sur les sauvegardes : avec les signaux actuels, deviner la photo
gardée plafonne vers 60-65 % ; le « mode duel » est abandonné. Nouvelle approche validée par l'utilisateur :
l'app automatise ce qui est fiable et rend le choix subjectif ultra rapide, puis apprend des vraies décisions.

- **Tri éclair** (`src/ui/screens/TriEclair.tsx`, file `src/engine/triage/queue.ts`) : une pose par écran, photos en
  grand, proposition de l'app cochée, un toucher bascule garder/supprimer, « Valider ». S'ouvre de lui-même après
  une analyse ; carte « ⚡ Tri éclair » en haut de l'onglet Trier pour continuer ou tout revoir. Loupe : double
  toucher pour zoomer.
- **Données propres** : chaque pose validée enregistre un choix par photo (`ChoiceRecord.via = 'pose'`) et la
  proposition de l'app à cet instant (`ChoiceRecord.app`, désormais sur tous les choix). Journal des poses validées
  (base IndexedDB version 4, magasin `validations`), repris dans la sauvegarde des goûts. Validée en moins de 0,7 s
  sans rien changer : comptée comme vue, pas apprise.
- **Justesse honnête** : part des photos et des poses validées où la proposition de l'app était juste ; affichée dans
  Réglages (« Justesse de l'app », objectif 80 %) et dans le rapport, avec le détail par écart de note.
- **Confiance calibrée** (`src/engine/triage/calibration.ts`) : une pose est « sûre » et n'est plus montrée que si,
  à son écart de note, au moins 30 poses validées donnent raison à l'app à 90 %. Au départ, aucune.
- Phase suivante (réglage 13, à approuver) : meilleurs modèles d'analyse en coulisse (expression du visage
  HSEmotion, compréhension d'image SigLIP ou CLIP), comparés honnêtement à la formule sur les poses validées.

### 42. Réglage 13 : « nouvel œil » en coulisse (21/11)

Approuvé par l'utilisateur (« ok ça me va, vas-y »). Mesures faites avant de choisir (`docs/jalon-6.md`) :

| Modèle | Taille | Calcul (1 fil, WebAssembly) | Verdict |
|---|---|---|---|
| HSEmotion EfficientNet-B0, émotions + valence (Apache-2.0) | 16 Mo | 80-125 ms / visage | **Retenu** |
| HSEmotion MobileFaceNet (Apache-2.0) | 8 Mo | 40 ms / visage | Repli si trop lent |
| CLIP ViT-B/32 int8 (MIT) | 89 Mo | 210-250 ms / photo | **Retenu** |
| CLIP ViT-B/32 q4 | 64 Mo | 574 ms, moins fidèle (même ordre de ressemblance que int8 dans 88 % des cas) | Écarté |
| SigLIP 2 base int8 (Apache-2.0) | 95 Mo | 720-870 ms / photo | Écarté pour l'instant : 3,5 fois plus lent |

Dans l'app (mesuré, 24 photos de test) : +296 ms par photo ; aucune requête externe ; marche avec la politique de
sécurité actuelle (`wasm-unsafe-eval`).

- Exécution : `onnxruntime-web` figé en 1.30.0 (MIT ; aucune adresse de statistiques, vérifié par un test), un seul
  fil, aucun travailleur ni en-tête spécial. Module `src/platform/vision/eye.ts`, chargé seulement à l'analyse.
- Les deux modèles (`public/models/onnx/`, licences dans `LICENCES.txt`) arrivent avec la mise à jour, comme les
  autres (règle « aucun appel réseau après l'installation », relevée par l'audit) : environ 120 Mo de plus, une seule
  fois (ensuite seulement s'ils changent). S'ils manquent, l'analyse continue sans eux.
- La comparaison honnête se calcule au calme (3 s après la dernière validation), sur 400 paires au plus, pour ne pas
  ralentir l'app ; une photo de la séance testée n'entre jamais dans l'apprentissage (photos analysées deux fois).
- Mesures gardées : empreinte CLIP de la photo (`MediaItem.clip`), émotions de chaque visage principal
  (`FaceMetrics.emotion`) ; avec chaque choix : empreinte (8 bits) et résumé des émotions (`ChoiceRecord.clip`,
  `emo`), repris dans la sauvegarde.
- **En coulisse** : un classement personnel (`src/engine/learning/ranker.ts`) apprend sur les poses validées dans le
  tri éclair. Il ne décide rien. Le rapport et Réglages comparent, séance par séance (chaque séance testée avec un
  apprentissage fait sur les autres seulement), la part des paires « gardée / supprimée » bien ordonnées par la
  formule et par le nouvel œil. Adopté seulement s'il fait nettement mieux, après plusieurs séances.

### 43. Réglage 13 bis : nouvel œil en arrière-plan

- Le nouvel œil ne tourne plus pendant l'analyse : il part après, dans son propre fil
  (`src/platform/vision/eye.worker.ts`, lancé par `eyeRunner.ts`), une photo à la fois, pendant que l'utilisateur
  trie. Les modèles de l'analyse sont déjà fermés : leur mémoire ne s'ajoute plus à celle du nouvel œil (environ
  350 Mo), rendue à l'iPhone quand le fil se ferme.
- Progression affichée dans Réglages. Les choix déjà faits sur une photo sont complétés quand son résultat arrive.
- Mesures gardées avec la séance toutes les 20 photos et à la fin, sans toucher à ses réglages, à son état
  (terminée) ni à la séance ouverte (`updateSessionMeasures`). Une séance reprise ou rouverte n'a plus les photos
  d'origine : le nouvel œil n'y repasse pas.

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
