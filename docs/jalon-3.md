# Jalon 3 : choisir les photos à garder

Plan préparé avant le code, à partir des retours de l'utilisateur sur le paquet de selfies du 16/11
(réglage 3) et du plan d'origine. Ce qui suit est la référence ; les écarts en cours de route vont dans
`decisions.md`.

## Ce que l'utilisateur doit obtenir

1. Pour chaque paquet, l'app dit **quelles photos garder** et **lesquelles supprimer**, avec la raison.
2. Il peut **feuilleter les photos en grand** en glissant le doigt à gauche ou à droite.
3. Il peut **changer la décision** d'un geste (« garder » / « supprimer ») ; ses choix servent à **apprendre ses
   goûts**, sur l'iPhone seulement.
4. L'app **comprend le type de photo** (selfie, portrait, groupe, paysage, coucher de soleil) et dit ce qu'elle
   cherche pour ce type.

Hors de ce jalon : l'écran « À supprimer » détaillé et l'aide à la suppression dans Photos (jalon 4).

## Retours de l'utilisateur à corriger d'abord (paquet 1 : il garde les n° 1, 3 et 7)

| Retour | Cause trouvée dans le rapport | Correction |
| --- | --- | --- |
| La moue avec le geste de la main est une **pose voulue** | La moue retirait des points à l'expression | Une moue, yeux ouverts, n'est plus un défaut ; seule la parole (bouche ouverte sans sourire) en reste un. Une expression neutre et calme vaut presque autant qu'un sourire. |
| Photo 7 : « aucun visage n'est caché » | Le détecteur n'a pas trouvé le visage (tête inclinée) | Deuxième recherche de visage sur un recadrage de chaque personne détectée sans visage. Si elle échoue encore mais qu'une personne est bien là, raison « visage non analysé », pénalité légère. |
| Photo 7 : l'arrière-plan n'est pas plus gênant | La personne sans visage passait pour un passant | Déjà corrigé au réglage 4 (sujet reconnu à sa place sur les autres photos). |
| Photo 1 : il aime la casquette sur la tête | L'ombre de la visière comptait un peu comme un masquage | Pour le haut du visage, seule la couleur compte, plus la luminosité (ombre d'un chapeau, d'une casquette). |

## Comprendre le type de photo

Type décidé **par paquet** (la majorité des photos), affiché en tête du paquet avec ce qui est recherché :

| Type | Reconnu par | Ce que l'app cherche |
| --- | --- | --- |
| Selfie | visages proches, caméra avant (focale ≤ 23 mm) | expressions, personne qui ne parle pas, rien devant les visages |
| Portrait | un visage principal | expression, visage net, rien qui gêne |
| Groupe | 3 visages ou plus | le visage le plus raté décide ; tout le monde visible |
| Coucher de soleil | pas de visage, beaucoup de pixels orange ou jaune saturés | couleurs chaudes les plus intenses, contraste, exposition équilibrée |
| Paysage | pas de visage | contraste, couleurs vives, exposition équilibrée, netteté, horizon droit |

Mesures ajoutées (calculées en arrière-plan, sur l'image réduite) :
- **Couleurs** : saturation moyenne, « colorfulness » (mesure classique de la vivacité des couleurs),
  part et intensité des pixels chauds (orange, jaune).
- **Contraste** : écart type de la luminosité.
- **Équilibre de l'exposition** : écart de la luminosité moyenne avec un niveau moyen, et pixels brûlés ou bouchés.

Toutes sont comparées aux autres photos du paquet (jugement relatif), jamais à une valeur absolue.

## Groupes de pose

Dans un paquet, les photos se ressemblent par groupes (même cadrage, même attitude).
- Chaque photo reçoit une **empreinte** : une vignette de 8 × 8 pixels en couleur (192 nombres).
- On parcourt le paquet dans l'ordre chronologique ; une photo rejoint le groupe courant si elle ressemble assez à
  la photo précédente **et** au premier de ce groupe, et si le nombre et la place des visages n'ont pas changé.
  Sinon elle ouvre un nouveau groupe.
- Seuil dans `config.ts`. Les groupes sont visibles dans l'écran (lettres A, B, C…).

Écarté : un modèle d'IA de plus pour comparer les images (lourd, pour un gain incertain à ce stade).

## Sélection

Reprise du plan d'origine, l'esprit est fixe (quota = plafond, au moins une photo par paquet) :
1. Les photos sous veto (yeux fermés, visage coupé) sont écartées, sauf si tout le paquet est concerné.
2. Dans chaque groupe de pose de n photos : on garde au plus `max(1, ceil(0,20 n))` photos, choisies une par une
   en favorisant la variété (une photo trop semblable à une photo déjà gardée passe après), et seulement si leur
   note reste à moins de 0,10 de la meilleure du groupe.
3. Plafond du paquet de N photos : `ceil(0,25 N)`. Au-delà, on retire les moins bien notées.
4. Au moins une photo gardée par paquet, toujours.
5. Chaque décision porte sa raison : « meilleure du groupe », « trop proche de la n° 4 », « note trop basse que la
   n° 3 », « au-delà du plafond du paquet »…

Écarté : le seuil absolu de 0,45 du plan. Les notes sont relatives au paquet ; un seuil absolu n'a pas de sens.

## Choix de l'utilisateur et apprentissage

- Dans la visionneuse, deux boutons : **Garder** / **Supprimer**. Le choix remplace la décision de l'app.
- Les choix sont enregistrés **sur l'iPhone** (stockage local du navigateur, IndexedDB), avec les mesures de la
  photo, jamais l'image. Rien ne part sur Internet ; Claude ne les voit que si l'utilisateur colle le rapport.
- **Apprentissage** : chaque choix dans un paquet donne des paires « préférée à » (gardée par l'utilisateur contre
  supprimée). L'app ajuste un petit bonus par critère (expression, sourire, regard, netteté, couleurs, exposition…)
  pour que ses préférences rejoignent les siennes. Ajustement plafonné et réversible (bouton « Oublier mes choix »).
- Le rapport de diagnostic contient les choix et les ajustements appris, pour calibrer les réglages de base.

Limite à dire à l'utilisateur : il faut des dizaines de choix avant que l'apprentissage change vraiment les
résultats ; et si l'app reste dans un onglet Safari sans être installée sur l'écran d'accueil, iOS peut effacer
ce stockage après quelques semaines sans utilisation.

## Visionneuse

- Plein écran, photo en 1080 px (une seconde image réduite, produite pendant l'analyse ; la grille garde des
  vignettes légères de 320 px).
- Glisser à gauche ou à droite : photo suivante ou précédente, dans l'ordre de la journée.
- En bas : numéro, heure, décision, raisons, boutons Garder / Supprimer.

## Ordre de travail et vérifications

1. Moteur (TypeScript pur, testé sans iPhone) : mesures de couleur, type de paquet, corrections de notation,
   groupes de pose, sélection, apprentissage.
2. Côté iPhone : mesures dans le Worker, seconde recherche de visage, stockage des choix.
3. Écrans : décisions dans la grille, visionneuse à glisser, bilan de la journée.
4. Vérifications : tests unitaires de chaque règle (dont le paquet de selfies reconstitué à partir du rapport),
   test en navigateur, contrôle d'absence de réseau.

Critère de passage (avec l'utilisateur) : sur ses paquets réels, les photos qu'il garderait sont gardées ou à une
pression de l'être, et rien d'important n'est marqué « à supprimer » sans raison compréhensible.
