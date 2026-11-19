# Réglage 8 : sauvegarde des goûts, séances, comparaison, premiers pas de l'apprentissage par l'image

Décisions de l'utilisateur (19/11) : sauvegarde dans iCloud Drive mais sans manipulations ; « séance » au lieu de
« journée » (une après-midi ou trois jours) ; vidéos plus tard ; apprentissage des goûts d'abord en test ; bouton
« Comparer » ; mesure d'accord honnête (le 83 % était gonflé : l'app connaissait déjà ces choix).

## Audit des risques, avant le code

| Risque | Parade |
| --- | --- |
| Une app web ne peut pas écrire seule dans iCloud | Un bouton « Sauvegarder » ouvre la feuille de partage avec le fichier ; iOS retient le dernier dossier choisi : 2 touchers ensuite (« Enregistrer dans Fichiers », « Enregistrer »). Rappel discret à l'accueil (20 nouveaux choix ou 14 jours). Repli si le partage de fichier est refusé : téléchargement direct. |
| Fichier abîmé ou d'un autre format restauré | Vérification de l'en-tête (`format`, `version`) ; lignes invalides ignorées une à une ; on ne supprime jamais rien à la restauration : fusion, le choix le plus récent l'emporte. |
| Compression indisponible | Détection de `CompressionStream` ; sinon JSON simple. La restauration reconnaît les deux (octets 1F 8B). |
| Sélecteur iOS qui grise le fichier .gz | Pas de filtre de type sur le champ de restauration ; on vérifie le contenu. |
| Base IndexedDB : nouveau champ dans les choix | Champ facultatif (`embedding`) : les anciens choix restent valides. Pas de changement de version de base. |
| Place prise par les empreintes | environ 1,4 Ko par choix (1 024 valeurs sur 8 bits, en base64) : 1 000 choix ≈ 1,4 Mo, moins une fois compressés. |
| Mesure d'accord gonflée | « Accord honnête » : pour chaque paquet, goûts appris SANS les choix de ce paquet, puis décision comparée aux choix de l'utilisateur. Affiché dans le rapport à côté de l'accord brut. |
| Goûts par l'image qui apprennent le lieu plutôt que la façon de choisir | Voisins cherchés dans les autres paquets seulement, et vote comparé à l'intérieur d'une même pose (le sujet commun s'annule). Mode test : aucune influence sur les décisions, seulement des chiffres dans le rapport. |
| Comparaison de deux photos mal alignées (cadrage différent) | Alignement par translation (± 6 %) avant la carte des différences ; si l'écart reste grand, on l'annonce (« cadrage différent ») au lieu d'entourer toute l'image. Photos de la même pose seulement. |
| Mémoire pendant la comparaison | Images réduites à 256 px de large pour la carte ; les aperçus 1080 px existent déjà. |
| Séance sur plusieurs jours | Date affichée au-dessus de chaque nouveau jour. Paquets inchangés (ils dépendent de l'écart de temps, pas du jour). |
| Rafale coupée entre deux séances | La dernière heure triée est mémorisée ; un paquet qui commence moins d'une minute après est signalé. |

## Ce qui n'est pas fait ici

Vidéos (attendre) ; influence réelle des goûts par l'image (après le test, avec l'accord de l'utilisateur).
