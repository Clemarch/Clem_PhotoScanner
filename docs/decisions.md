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
| Écart entre paquets | 5 minutes au départ | Valeur du plan. Un curseur dans l'écran Paquets permet de trouver la bonne valeur sur de vraies photos. |

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

## Points ouverts pour les jalons suivants (rien n'est codé)

Ces remarques sur le plan seront tranchées avec l'utilisateur le moment venu.

1. **Tester la suppression plus tôt.** Le plus gros risque d'usage n'est pas l'analyse mais la fin : retrouver à la
   main 80 photos sur 100 dans l'app Photos. Proposition : dès le jalon 3, un écran final minimal, et envisager la
   logique inverse — marquer en favori les 20 % à garder (4 fois moins de gestes), puis supprimer le reste de la
   journée d'un coup. Le pont Raccourcis mérite d'être testé avant le jalon 4, car il conditionne cet écran.
2. **« Pire visage » sur les visages principaux seulement.** Un passant flou à l'arrière-plan ne doit pas couler la
   photo : ne compter que les visages assez grands par rapport au plus grand.
3. **Veto yeux fermés relatif.** Un grand sourire plisse les yeux et ressemble à un clignement. Le veto doit comparer
   la photo aux autres du même groupe plutôt qu'utiliser un seuil fixe.
4. **Groupes de pose sans modèle supplémentaire d'abord.** Essayer temps + position du visage + empreinte visuelle
   simple avant d'embarquer un modèle d'embedding (lourd à télécharger et à faire tourner).
5. **Poids de la formule** : à calibrer sur les paquets annotés, pas avant.
6. **Seuil de 0,45 absolu** : en tension avec le jugement relatif ; la règle du minimum le compense, à vérifier sur
   des cas réels.

## Hébergement

GitHub Pages n'est gratuit que pour un dépôt public. Le dépôt est privé au départ : il faut soit le rendre public
(le code est visible, jamais les photos, qui n'y sont pas), soit un abonnement GitHub payant. Décision à l'utilisateur.
