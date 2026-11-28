# Photo Triage — règles du projet

PWA 100 % locale pour iPhone (Safari, iPhone 14 Pro) : l'utilisateur sélectionne les photos d'une journée,
l'app les groupe en paquets puis en poses, propose les meilleures et montre lesquelles supprimer à la main.

Plan d'origine : `docs/plan-initial.md` (proposition, pas une spécification).
Décisions prises et écarts : `docs/decisions.md` — à mettre à jour à chaque nouveau choix.

## Contraintes non négociables

- Tout reste sur l'iPhone : aucun appel réseau après l'installation, aucune télémétrie, modèles d'IA embarqués.
  Seule exception (demande de l'utilisateur, 24/11) : les modèles du nouvel œil sont téléchargés par l'app à
  l'ouverture, depuis sa propre adresse, jusqu'à ce qu'ils soient là (`src/platform/storage/models.ts`, point 44).
- Pas d'ordinateur côté utilisateur : tout se teste sur iPhone via l'URL GitHub Pages.
- Aucune suppression automatique. L'écran final rend la suppression la plus simple possible : bouton qui passe la
  liste au raccourci « Photo Triage » (app Raccourcis), une recherche par photo (nom + fenêtre de ±2 s), aperçu puis confirmation d'iOS
  (`docs/decisions.md`, points 31 et 33). « Créer un album photo » (Raccourcis) enregistre toujours une copie
  (point 70) : plus d'album « Triées » ni de « Photo Triage Garder ». Albums abandonnés (points 71 à 73) : l'accueil
  indique les périodes non triées à choisir (`src/engine/coverage.ts`).
- Jamais de photos dans le dépôt (`tests/fixtures/` est ignoré par git).
- Interface en français, fluide, soignée, utilisable d'une main.
- RAW repérés et mis de côté. Vidéos plus tard (`MediaItem.kind`). Live Photos non ciblées.
- Captures d'écran, images enregistrées, photos de documents ou d'écrans : mises de côté, toujours gardées
  (`src/engine/grouping/aside.ts`, `docs/decisions.md`, point 28).
- Esprit de la sélection : jugement relatif par paquet ; seules les notes décident. Plus de quota : retiré à la
  demande de l'utilisateur (17/11, « un paquet de 2 photos peut garder les 2 »). Au moins 1 photo gardée par paquet,
  sauf si toutes sont ratées (accord de l'utilisateur, 17/11). Dans une pose : la meilleure, plus celles nettement
  différentes (tête, expression, geste, personnes, cadrage), presque aussi bien notées (écart ≤ 0,02) et sans défaut ;
  identiques : supprimées (19/11, point 37). Presque aussi bonnes et un peu différentes : proposées à la suppression,
  signalées dans le tri éclair (accord de l'utilisateur, 25/11, point 55 : il garde 1,4 photo par pose, l'app 2,1).
  Aucune règle de nombre par pose (utilisateur, 25/11, point 57) : aucune, une ou toutes peuvent être gardées, seule
  l'analyse des images décide ; le nombre gardé par pose n'est qu'un indicateur. En groupe, tout le monde doit regarder ; seule, une personne peut regarder ailleurs (point 39).
  Netteté jugée sur les visages ; jambes coupées par le bas : cadre naturel ; objet tenu (planche…) : partie du sujet.

## Utilisateur

Novice, sans ordinateur. Toute consigne qui lui est adressée : en français, numérotée, sans jargon,
avec l'endroit exact où toucher, et chaque terme technique expliqué en une phrase.
Ne pas entamer un nouveau jalon sans son accord.
Après chaque mise à jour, lui dire précisément quels tests faire sur l'iPhone et quelles informations renvoyer
pour avancer (demande de l'utilisateur, 17/11) : s'appuyer sur `docs/protocole-test.md` et préciser ce qui est
propre à ce test.

## Architecture

- `src/engine` : TypeScript pur. N'importe ni `platform`, ni `ui`, ni bibliothèque externe ; ne touche pas au navigateur.
  Tous les seuils et poids dans `src/engine/config.ts`.
- `src/platform` : tout ce qui dépend de Safari (décodage, Worker, MediaPipe, appareil). Importe `engine`.
- `src/ui` : React. Importe `engine` et `platform`.
- Mémoire iOS : une photo décodée à la fois, réduite à 1536 px, `close()` et canvas remis à zéro après usage.
  Nouvel œil : mémoire plafonnée à 1 Go (le moteur réserve 4 Go d'un bloc), lancé une fois la mémoire des moteurs de
  l'analyse rendue, jamais pendant une analyse, sur les aperçus (points 58, 59).
- Notation : le contenu (expression, masquage, arrière-plan, objets, cadrage, couleurs selon le type de photo) classe ;
  la technique (netteté, yeux) ne sert qu'à repérer des défauts. Voir `docs/decisions.md`, points 14 à 17.
- Enchaînement d'une journée : `src/engine/pipeline.ts` (paquets → notes → poses → sélection). Paquets toujours
  selon le contenu (`config.grouping.byContent`) ; le temps seulement sans empreinte. Personne seule ≠ groupe.
- Séances : toutes gardées sur l'iPhone (`src/platform/storage/sessionStore.ts`), terminées une fois tout envoyé à la
  suppression, rouvrables depuis Réglages › Séances (point 40), à sortir des statistiques si déjà triées avant
  (`src/platform/storage/excludedSessions.ts`, point 59). Images gardées en octets, jamais en Blob (iOS ne
  relit plus un Blob après redémarrage, point 47).
- Interface : `src/ui/style.css` (style d'Apple, mode sombre), icônes dans `src/ui/icons.tsx`, version affichée dans
  `src/ui/version.ts`. Photos non touchées enregistrées comme accords (`ChoiceRecord.implicit`) à l'envoi au raccourci.
- Tri éclair (« Pourquoi ? », « se valent », « aucune n'est bonne » : `PoseValidation.why`, `.note`, `.tie`, `.weak`, points 65, 66) : file `src/engine/triage/queue.ts`, justesse et confiance `src/engine/triage/calibration.ts`, journal
  `src/platform/storage/validations.ts`, écran `src/ui/screens/TriEclair.tsx`. La justesse de l'app se mesure sur les
  poses validées (point 41), pas sur les corrections.
- Choix de l'utilisateur : IndexedDB (`src/platform/storage/choices.ts`), mesures et empreinte d'image (8 bits),
  jamais d'image. Apprentissage : `src/engine/learning/preferences.ts` ; goûts par l'image, en test :
  `src/engine/learning/taste.ts` ; accord honnête : `src/engine/evaluation.ts`.
- Labo d'apprentissage (jalon 7, point 61) : candidats `src/engine/learning/lab.ts` (réglages `config.lab`), calcul en
  Worker `src/platform/worker/lab.ts`, écran `src/ui/screens/Labo.tsx`. Mesure seulement : la formule décide.
- Vocabulaire de contexte du nouvel œil (jalon 8, point 62) : idées dans `tools/vocab/concepts.py`, converties de mon
  côté par `tools/vocab/build.py` en `src/engine/learning/vocab.generated.ts` (ne pas modifier à la main), lues par
  `src/engine/learning/context.ts`. Aucun modèle de plus sur l'iPhone. Visages : SigLIP 2 aussi sur chaque visage
  principal recadré (`FaceMetrics.clip`, `ChoiceRecord.fclip`, passage `config.ranker.eyeVersion`, point 63).
  Jamais la place dans la rafale comme critère (corrélation, pas causalité : utilisateur, 27/11).
  Réseau de neurones du Labo : `src/engine/learning/nn.ts` (`config.net`, point 64), mesure seulement.
- Sauvegarde des goûts : `src/engine/learning/backup.ts` (format) et `src/platform/storage/backupFile.ts` (fichier,
  iCloud Drive via la feuille de partage). Une séance peut couvrir une après-midi ou plusieurs jours.

## MediaPipe : ne pas mettre à jour sans inspection

Modèles embarqués dans `public/models/` : `face_landmarker.task` (visages), `efficientdet_lite0.tflite` (objets),
`selfie_multiclass_256x256.tflite` (silhouette avec peau), `mobilenet_v3_small.tflite` (empreinte fine),
`efficientnet_lite0.tflite` (classement de scène) et `gesture_recognizer.task` (gestes : V, pouce levé). Le modèle du corps a été retiré (`docs/decisions.md`, point 26).
« Nouvel œil » (réglage 13, approuvé le 21/11), dans `public/models/onnx/` : `siglip2_base_int8.onnx` (SigLIP 2,
Apache-2.0 ; remplace CLIP le 24/11 : performance avant tout, point 45) et
`hsemotion_b0_va.onnx` (émotions des visages, Apache-2.0), exécutés par `onnxruntime-web` figé en 1.30.0 (test de
garde : aucune adresse de statistiques). En coulisse : ils ne décident rien tant que la comparaison honnête
(`src/engine/learning/ranker.ts`, point 42) ne montre pas qu'ils font mieux que la formule.
Tout nouveau modèle se propose d'abord à l'utilisateur.
`@mediapipe/tasks-vision` est figé en 0.10.34. Les versions 1.x envoient des statistiques d'usage à Google
(voir `docs/decisions.md`, point 8). Un test et `tools/check-dist.mjs` bloquent toute régression.

## Commandes

- `npm test` : tests unitaires + garde-fous (pas de réseau, moteur pur).
- `npm run lint` : ESLint (mêmes garde-fous).
- `npm run build` : vérification des types, construction, puis contrôle de `dist/` (CSP, aucune ressource externe).
- `npm run dev` : serveur local.

## Déploiement

GitHub Actions (`.github/workflows/deploy.yml`) publie sur GitHub Pages à chaque envoi sur `main`.

## État

Jalons 0 à 3 faits (diagnostic, paquets, visages, type de photo, poses, sélection, visionneuse, apprentissage).
Jalon 4 en cours (plan : `docs/jalon-4.md`) : onglet « Dans Photos », zoom, paquets ratés, hublot, silhouette,
empreinte fine, classement de scène, commentaires sur les choix, gestes, captures mises de côté, « à vérifier ».
Réglage 8 (plan : `docs/jalon-5.md`) : sauvegarde des goûts, séances, comparaison, apprentissage par l'image en test.
Réglage 9 : plusieurs photos par pose si différentes, regard en groupe, photo prise par erreur, lots de 49.
Réglage 10 : nouvelle présentation (onglets Trier, Supprimer, Réglages), paquets selon le contenu, accords
silencieux (photos non touchées = d'accord), yeux plissés jugés par personne, sauvegarde datée (point 38).
Réglage 10 bis (point 39) et réglage 11 (point 40) : séances terminées et rouvertes, groupe ≠ personne seule.
Jalon 6 (plan : `docs/jalon-6.md`), réglage 12 (point 41) : tri éclair pose par pose, justesse honnête mesurée sur
les poses validées, confiance calibrée. Réglage 13 (point 42) : nouvel œil en coulisse (CLIP + émotions des visages),
comparé honnêtement à la formule.
Jalon 7 (plan : `docs/jalon-7.md`, point 61) : labo d'apprentissage, courbe des prédictions séance par séance.
Jalon 8 en cours (plan : `docs/jalon-8.md`) : l'app découvre vos règles. Étape 1 faite (point 62) : vocabulaire de
contexte, candidat « Formule + contexte » dans le Labo. Étape 2 faite (point 63) : le nouvel œil regarde chaque visage.
Réseau de neurones dans le Labo, rattrapage du nouvel œil enchaîné (point 64). Visages en 10 traits, sourire réajusté,
« Pourquoi ? » et « Les deux se valent » dans le tri éclair (point 65). Raisons précises, « Autre… », « Aucune n'est
vraiment bonne » (point 66). Flou de bougé repéré : photo ratée, montrée dans le tri éclair (point 67).
Toutes les poses dans le tri éclair (photos seules et « sûres » comprises), Réglages › « Poses jamais vues » (point 68).
Rangement dans « Triées » suivi photo par photo (point 69), puis albums retirés : ils copiaient chaque photo (point 70).
Album « À trier » refait (point 71) puis abandonné ; analyse qui reprend après un verrouillage d'écran (point 73).
Modèle restant proposé : objets plus fins.
