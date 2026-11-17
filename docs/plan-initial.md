# Photo Triage — architecture et prompt Claude Code

Nov 17, 2026 · @Clemoush

PWA 100 % locale pour iPhone : on sélectionne une journée de photos, l'app les groupe en paquets et en poses, garde les meilleures et montre clairement lesquelles supprimer à la main.

**Statut : simple proposition de départ, pas une spécification.** Cette architecture, ces modules, ces formules, ces seuils et ce plan ont été rédigés sans accès au code ni à l'environnement, et sans avoir évalué toutes les possibilités. Claude Code est invité à tout remettre en cause : stack, découpage, algorithmes, poids, ordre des jalons. S'il juge qu'une meilleure version du projet existe, il doit la proposer et la construire. Seules les contraintes de la section « Décisions actées » viennent de l'utilisateur et restent fixes.

**Profil de l'utilisateur : novice.** Il n'a jamais développé d'application. À chaque fois qu'on lui demande de faire quelque chose (sur GitHub, sur son iPhone, dans Claude Code), les consignes doivent être détaillées, numérotées, en français, sans jargon, avec l'endroit exact où toucher ou cliquer. Tout terme technique est expliqué en une phrase.

## Décisions actées

- **Matériel** : iPhone 14 Pro, aucun ordinateur pour l'instant. Un portage sur PC est prévu plus tard.
- **Plateforme** : PWA dans Safari, installée sur l'écran d'accueil, sans serveur.
- **Confidentialité** : tout reste sur l'iPhone ou dans iCloud. Aucune photo ni donnée n'est partagée, aucun appel réseau après l'installation. Les modèles d'IA sont embarqués.
- **Entrée** : à chaque fois, l'utilisateur sélectionne d'un coup toutes les photos d'une même journée. En pratique, ce sont celles de la veille, normalement déjà stockées sur l'iPhone.
- **Sortie** : aucune suppression automatique. Un écran « À supprimer » rend la suppression manuelle dans Photos la plus simple possible.
- **Cas d'usage central** : mini-shootings de 15 à 20 photos d'une personne, où l'on garde les 2 ou 3 meilleures. Un paquet de 30 photos peut contenir plusieurs poses : on garde 1 ou 2 photos par pose. Les sujets varient : les paysages, sans visage, sont jugés sur la netteté globale, l'exposition et l'horizon.
- **Critères** : la personne regarde l'objectif, mimiques ratrées, flou, yeux fermés.
- **Jugement relatif** : on compare les photos d'un même groupe. Si tout est flou, la moins floue gagne.
- **Quota** : 15 à 25 % de photos gardées au maximum. Ce plafond ne doit jamais fausser l'algorithme : une photo moyenne sort, même s'il n'en reste qu'une sur 10, mais chaque paquet garde au moins 1 photo.
- **Interface** : très fluide, soignée, en français, avec les raisons de chaque décision visibles.
- **Hors périmètre** : Instagram et création de contenu. La V1 ne traite que les photos : les vidéos viendront plus tard (le code prévoit un type « média »). Les Live Photos ne sont pas ciblées et les RAW sont traités à part dans Lightroom.
- **Code** : moteur d'analyse en TypeScript pur, séparé de l'interface, pour le réutiliser sur Expo ou sur PC.

## Architecture

&#91;embedded content: architecture · 3 couches, 6 étapes\]

Les photos entrent par l'interface, traversent les six étapes du Worker, et seuls les résultats remontent. Une fois l'app installée, aucun réseau n'est utilisé.

## Structure du dépôt

Trois couches strictement séparées : `engine` (logique pure, aucun accès au navigateur), `platform` (tout ce qui touche Safari) et `ui` (affichage). `engine` n'importe jamais `platform` ni `ui`, ce qui rend le moteur testable sans iPhone et réutilisable sur Expo ou sur PC.

```text
photo-triage/
├─ CLAUDE.md                  # règles du projet pour Claude Code
├─ package.json, vite.config.ts, tsconfig.json
├─ public/
│  ├─ manifest.webmanifest    # PWA
│  └─ models/                 # modèles MediaPipe + WASM, embarqués
├─ src/
│  ├─ engine/                 # TypeScript pur
│  │  ├─ types.ts             # Photo, Pack, PoseGroup, FaceMetrics, Decision
│  │  ├─ config.ts            # tous les seuils et poids, au même endroit
│  │  ├─ ingest/              # date, orientation, vignette, hash perceptuel
│  │  ├─ grouping/            # paquets (temps) puis poses (similarité)
│  │  ├─ analysis/            # visages, netteté, exposition
│  │  ├─ scoring/             # score par photo, comparaison relative
│  │  ├─ selection/           # quota, diversité, règle du minimum
│  │  └─ pipeline.ts          # enchaîne les étapes, émet la progression
│  ├─ platform/
│  │  ├─ worker/              # Web Worker + protocole de messages
│  │  ├─ vision/              # adaptateur MediaPipe
│  │  ├─ storage/             # IndexedDB : cache, décisions
│  │  └─ image/               # décodage, réduction, orientation
│  ├─ ui/
│  │  ├─ screens/             # Import, Analyse, Paquets, À supprimer
│  │  ├─ components/
│  │  └─ state/               # store Zustand
│  └─ main.tsx
├─ tests/
│  ├─ unit/                   # grouping, scoring, selection
│  └─ fixtures/               # photos de test, jamais versionnées
└─ tools/                     # script d'évaluation sur paquets annotés
```

## Modules et services

Chaque module fait une seule chose et se teste seul. Les choix techniques marqués « à valider » sont à confirmer pendant le jalon 0.

| Module | Rôle | Entrée → sortie | Technique |
| --- | --- | --- | --- |
| `ingest` | Lit la date et l'orientation, crée une vignette de 1024 px, calcule un hash perceptuel | `File` → `Photo` | `exifr`, `createImageBitmap` |
| `grouping/packs` | Découpe la journée en paquets : écart de temps, puis ressemblance du cadre | `Photo[]` → `Pack[]` | seuil de temps + distance visuelle |
| `grouping/poses` | Regroupe, dans un paquet, les photos de même pose | `Pack` → `PoseGroup[]` | embedding d'image + orientation de la tête + position du visage (à valider) |
| `analysis/faces` | Regard, yeux, sourire, bouche, orientation, visage coupé | `Photo` → `FaceMetrics[]` | MediaPipe Face Landmarker |
| `analysis/sharpness` | Netteté mesurée sur le visage, flou de boughé | pixels + boîte du visage → nombre | variance du Laplacien |
| `scoring` | Note chaque photo, puis la compare aux autres de son groupe | métriques → `score` | formules ci-dessous |
| `selection` | Applique quota, diversité et règle du minimum | scores → `Decision[]` | algorithme ci-dessous |
| `worker` | Exécute le pipeline hors du thread principal | messages ↔ interface | `postMessage`, objets transférables |
| `storage` | Garde le cache d'analyse, les décisions et les réglages | clé → valeur | IndexedDB (`idb`) |
| `ui` | Quatre écrans, comparaison côte à côte, raisons affichées | état → écran | React + Vite + Zustand |

## Algorithme de sélection

Chaque photo reçoit une note absolue, puis est comparée aux autres de son groupe de pose. Le quota est un plafond, jamais un objectif.

| Critère | Mesure | Effet |
| --- | --- | --- |
| Yeux ouverts | `eyeBlinkLeft`, `eyeBlinkRight` | veto si clignement sur un visage principal |
| Regard | `eyeLook*` + orientation de la tête | score |
| Sourire, bouche | `mouthSmile*`, `jawOpen`, `mouthFunnel` | score, pénalité si bouche en pleine parole |
| Visage coupé | boîte du visage au contact du bord | veto |
| Netteté du visage | variance du Laplacien dans la boîte du visage | score |
| Exposition du visage | histogramme dans la boîte du visage | score |
| Cadrage | marges, horizon | score |

Score d'un visage, puis d'une photo. Le visage le plus raté pèse le plus. Les poids sont des valeurs de départ à calibrer sur vos photos. Sans visage (paysage), F est remplacé par la netteté globale et l'exposition.

```latex
q_f = 0.30\,\text{yeux} + 0.25\,\text{regard} + 0.20\,\text{expression} + 0.25\,\text{netteté}
```

```latex
F(p) = 0.6\,\min_f q_f + 0.4\,\overline{q_f}\qquad S(p) = 0.70\,F(p) + 0.15\,T(p) + 0.15\,C(p)
```

Décision, dans l'ordre :

1. Un veto exclut la photo, sauf si tout le paquet est concerné.
2. Une photo est éligible si S(p) ≥ 0.45 (seuil absolu).
3. Dans un groupe de pose de n photos, le budget est un plafond :

```latex
b(G) = \max\bigl(1,\ \lceil 0.20\,n_G \rceil\bigr)
```

4. Les photos sont choisies une par une pour varier les expressions (diversité MMR), et une photo n'est gardée que si sa note reste à 0.10 de la meilleure du groupe :

```latex
\text{choix} = \arg\max_{p \in G \setminus K}\ 0.7\,S(p) + 0.3\,\bigl(1 - \max_{k \in K}\mathrm{sim}(p,k)\bigr)
```

5. Plafond du paquet de N photos : ⌈ 0.25 N ⌉. Au-delà, on retire les moins bien notées.
6. Règle du minimum : si aucune photo n'est éligible, le paquet est « dégradé » et on garde les ⌈ 0.15 N ⌉ meilleures, entre 1 et 3.

Tous ces nombres vivent dans `engine/config.ts`.

## Problèmes anticipés

Les trois premiers peuvent bloquer le projet. On les teste au jalon 0, avant d'écrire le moteur.

| Risque | Pourquoi c'est grave | Parade |
| --- | --- | --- |
| Safari retire la date de prise de vue | Sans date, impossible de former les paquets | Écran de diagnostic au premier lancement ; activer l'option de métadonnées du sélecteur ; repli sur l'ordre des noms de fichier puis la ressemblance visuelle |
| Plantage mémoire de l'onglet | L'analyse est perdue en cours de route | Une photo décodée à la fois, réduite à 1024 px avec `createImageBitmap`, `close()` après usage, lots de 20, progression sauvegardée dans IndexedDB |
| iOS suspend l'app écran verrouillé | L'analyse s'interrompt | Wake Lock à tester en PWA ; reprise automatique depuis le cache |
| Sélection de centaines de photos lente ou refusée | Le sélecteur prépare les fichiers avant de rendre la main | Mesurer au jalon 0 la taille de sélection supportée ; sinon proposer des demi-journées |
| Regard et sourire peu fiables (profil, lunettes, petit visage) | Mauvaises décisions de tri | Seuils calibrés sur vos photos, raisons affichées, correction en un geste, 30 paquets annotés pour mesurer |
| Poses mal regroupées (trop fusionnées ou trop coupées) | Le quota est faux | Curseur de sensibilité, fusion et scission manuelles, groupes visibles |
| Retrouver les photos à supprimer dans Photos | Friction maximale de l'usage final | Écran « À supprimer » : heure exacte, numéro dans la journée, miniature, ordre identique à Photos, regroupé par paquet ; pont Raccourcis testé plus tard |
| Orientation, HEIC, Live Photos, mode Portrait | Visages détectés de travers, netteté faussée | Normaliser l'orientation, mesurer la netteté sur le visage seulement, tester chaque cas |
| Installation et mises à jour de la PWA | Il faut une adresse HTTPS | GitHub Pages via GitHub Actions, service worker versionné |
| Fuite de données | Briserait le principe de confidentialité | Aucune télémétrie, modèles embarqués, politique CSP `connect-src 'self'` |

## Plan par étapes

Six jalons, chacun avec un critère de passage mesuré sur votre iPhone.

1. **Jalon 0, diagnostic.** Un écran : choisir des photos, afficher date, nom, type (HEIC, JPEG, DNG), taille, orientation, temps de décodage et mémoire. *Passage :* la date est lue et 100 photos (une journée type) passent sans plantage, avec un test de charge à 300.
2. **Jalon 1, paquets sans IA.** Ingestion, découpage par temps, netteté globale, tests unitaires, écran Paquets minimal. *Passage :* une vraie journée est découpée comme vous le feriez.
3. **Jalon 2, visages.** MediaPipe, métriques, score par photo, raisons affichées. *Passage :* yeux fermés et regards ailleurs repérés sur 30 paquets annotés.
4. **Jalon 3, poses et sélection.** Regroupement des poses, quota, diversité, règle du minimum. *Passage :* la sélection coïncide avec la vôtre sur la majorité des paquets annotés (seuil à fixer ensemble).
5. **Jalon 4, interface finale.** Écran « À supprimer », transitions fluides, PWA hors ligne, déploiement GitHub Pages.
6. **Jalon 5, goûts et suppression.** Apprentissage par choix garder/jeter, test du pont Raccourcis, port Expo ou PC.

## Prompt pour Claude Code

À coller tel quel dans Claude Code, après avoir ajouté ce document au dépôt. Il demande d'abord à Claude Code d'auditer et d'améliorer ce plan, puis couvre les jalons 0 et 1 seulement.

```text
Tu es mon ingénieur principal sur "Photo Triage", une PWA 100 % locale pour iPhone (Safari sur iOS 26.6.1, iPhone 14 Pro).

STATUT DU PLAN JOINT (IMPORTANT)
Le document d'architecture joint est une PROPOSITION de départ, rédigée par un autre assistant sans accès à ton code ni à ton environnement, et sans avoir évalué toutes les possibilités. Ce n'est pas une spécification. Remets en cause tout ce qui n'est pas une contrainte non négociable ci-dessous : stack, découpage en modules, arborescence, formules et poids, seuils, choix d'algorithmes (regroupement des poses, MediaPipe, embeddings, mesure de netteté), ordre des jalons. Si tu connais une meilleure approche, ou si la meilleure version du projet final est différente, dis-le et construis-la.
1. Avant de coder, audite le plan : liste ce que tu changerais et pourquoi, avec les alternatives évaluées et leurs compromis.
2. Tranche toi-même les points mineurs. Demande-moi pour ceux qui changent mon usage ou mes contraintes.
3. Consigne chaque décision (retenue ou écartée) dans docs/decisions.md.
Seules les CONTRAINTES NON NÉGOCIABLES ci-dessous sont fixes.

OBJECTIF
Je sélectionne toutes les photos d'une journée. L'app les regroupe en paquets (prises de vue rapprochées dans le temps), puis en groupes de pose, et ne propose de garder que les meilleures de chaque groupe. Elle ne supprime rien : elle me montre clairement quelles photos je dois supprimer à la main dans l'app Photos.

CONTRAINTES NON NÉGOCIABLES
- Tout reste sur mon iPhone : aucune photo ni donnée ne quitte l'appareil, aucun appel réseau après l'installation, aucune télémétrie. Modèles d'IA embarqués.
- Je n'ai pas d'ordinateur : l'app doit fonctionner sur iPhone (PWA dans Safari au départ). Un portage Expo ou PC est possible plus tard.
- Aucune suppression automatique. L'écran final doit me rendre la suppression manuelle la plus simple possible.
- Jamais de photos dans le dépôt (tests/fixtures dans .gitignore). Usage : je sélectionne toutes les photos d'une journée d'un coup ; interface en français, très fluide, soignée, utilisable d'une main. Contexte : je traite en général les photos de la veille, déjà stockées sur l'iPhone. Mes sujets varient (personnes, paysages). Je veux éviter les Live Photos. Mes RAW sont traités à part dans Lightroom : repère-les (type de fichier) et mets-les de côté. Les vidéos viendront plus tard : prévois dès maintenant un type MediaItem (photo ou vidéo).

PROPOSITION DE DÉPART (à challenger)
- Pas de backend. Hébergement statique (GitHub Pages).
- TypeScript strict. Trois couches : src/engine (logique pure, aucun import du DOM, de platform ou de ui), src/platform (Worker, MediaPipe, IndexedDB, décodage d'image), src/ui (React + Vite + Zustand). Arborescence : src/engine/{types,config,ingest,grouping,analysis,scoring,selection,pipeline}, src/platform/{worker,vision,storage,image}, src/ui/{screens,components,state}, tests/, tools/.
- Tous les seuils et poids dans src/engine/config.ts.
- Safari iOS : décoder une photo à la fois, la réduire à 1024 px avec createImageBitmap, appeler close() après usage, traiter par lots de 20, sauvegarder la progression dans IndexedDB.

RÈGLES DE SÉLECTION (point de départ à améliorer ; l'esprit est fixe : jugement relatif par paquet, quota = plafond, au moins 1 photo par paquet)
- Note d'un visage : 0.30 yeux + 0.25 regard + 0.20 expression + 0.25 netteté du visage (mesurée dans la boîte du visage, jamais sur toute l'image).
- Note d'une photo : 0.70 F + 0.15 technique + 0.15 cadrage, avec F = 0.6 x pire visage + 0.4 x moyenne des visages.
- Veto : yeux fermés, visage coupé. Éligible si note >= 0.45. Photos sans visage (paysages) : note = technique + cadrage (netteté globale, exposition, horizon), avec les mêmes règles de groupe, de plafond et de minimum.
- Par groupe de pose de n photos : budget maximal max(1, ceil(0.20 n)), photos choisies avec diversité (MMR), à 0.10 maximum de la meilleure du groupe.
- Plafond par paquet de N photos : ceil(0.25 N). Le quota est un plafond, jamais un objectif.
- Règle du minimum : si aucune photo n'est éligible, garder les ceil(0.15 N) meilleures, entre 1 et 3.
- Chaque décision porte ses raisons lisibles (ex. "yeux fermés", "moins nette que la n°7").

TA TÂCHE POUR CETTE SESSION
0. Audit du plan (voir STATUT) et mise à jour du plan si nécessaire.
1. Crée le dépôt avec l'arborescence retenue et un CLAUDE.md qui reprend les contraintes et les décisions.
2. Jalon 0 : un écran de diagnostic. Je choisis des photos ; il affiche pour chacune la date de prise de vue, le nom de fichier, le type (HEIC, JPEG, DNG), la taille, l'orientation, le temps de décodage et l'usage mémoire, et signale si la date est absente.
3. Jalon 1 : ingestion, découpage en paquets par écart de temps (seuil dans config.ts), netteté globale, écran Paquets minimal. Tests unitaires du découpage avec des données synthétiques.
4. Déploiement automatique sur GitHub Pages (GitHub Actions) et manifest PWA, pour que je teste sur mon iPhone via l'URL.

CRITÈRES D'ACCEPTATION
- npm test et npm run build passent.
- docs/decisions.md existe et explique chaque écart par rapport au plan joint.
- Les contraintes non négociables sont respectées et vérifiables (par exemple une règle ESLint ou un test pour l'absence d'appels réseau).
- L'écran de diagnostic fonctionne sur iPhone et je peux te renvoyer sa sortie. Tu ne peux pas tester sur iPhone : dis-moi exactement quoi vérifier.

MÉTHODE
Audit d'abord, code ensuite. Je suis novice : chaque fois que tu me demandes de faire quelque chose (sur GitHub, sur mon iPhone, etc.), donne-moi des instructions détaillées, étape par étape, en français, sans jargon, en disant exactement où toucher ou cliquer, et explique chaque terme technique en une phrase. Commits petits et clairs. Ne fais pas les jalons suivants sans mon accord.
```

## Points à trancher

- [ ] Plancher de la règle du minimum : 1 photo par paquet, ou jusqu'à 3 quand tout le paquet est flou (valeur proposée ci-dessus).
- [ ] Seuil d'écart entre deux paquets : 5 minutes en valeur de départ, à ajuster après le jalon 1.
- [ ] Cadrage avancé (mains ou pieds coupés) : reporté après le jalon 3, car il demande un modèle de pose du corps en plus.
- [ ] Compte Apple Developer : seulement si vous passez à une app Expo plus tard, pas nécessaire pour la PWA.
