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
Retenu : note d'un visage = 0,30 yeux + 0,25 regard + 0,20 expression + 0,25 netteté du visage ;
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
- Le regard additionne l'écart des yeux et la rotation de la tête sans les compenser : une tête tournée avec les yeux
  vers l'objectif est un peu trop pénalisée.
- Le modèle est fait pour des visages proches (selfie, portrait). Des personnes petites dans le cadre ne sont pas
  détectées : la photo est alors jugée comme un paysage.
- « Pas prête » n'est approché que par le regard, l'expression et la netteté du visage.

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
