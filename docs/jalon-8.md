# Jalon 8 — L'app découvre vos règles

Accord de l'utilisateur (26/11) : « viser l'objectif du réseau de neurones », vocabulaire de contexte « le plus riche
possible », progrès à chaque séance, quitte à valider 2 000 photos. Avancer par étapes avec des points d'étape.

## Principe

- Données brutes gardées (mesures, empreinte du nouvel œil sur 8 bits) ; tout le reste est recalculé. Chaque
  amélioration (nouvelles idées, nouveau modèle) s'applique à tout l'historique.
- Tout candidat est jugé dans le Labo, honnêtement (séance testée jamais apprise). La formule décide tant qu'aucun
  candidat ne la bat de 3 points sur 300 paires ; le passage de relais se propose à l'utilisateur.

## Étapes et points d'arrêt

1. Vocabulaire de contexte (point 62) — fait. Point d'arrêt 1 (+2 points dès maintenant) non atteint : il manque
   des exemples pour 118 poids. Le candidat reste dans le Labo pour suivre sa courbe séance après séance.
2. Le nouvel œil sur les visages (point 63) — fait : SigLIP 2 sur chaque visage principal recadré, 35 idées lues sur
   le visage, candidat « Formule + visages ». À juger dans le Labo une fois les séances gardées revues par l'œil.
   La place dans la rafale est retirée des candidats (corrélation, pas causalité).
3. Moins de poids à apprendre : sens connu d'avance pour chaque idée (bonne ou mauvaise), résumé de l'image en
   quelques nombres appris sur toutes les photos vues, même non triées.
4. Arbres de décision et « Règles découvertes » ; galerie « Les erreurs de l'app » avec « pourquoi » ; bouton
   « Les deux se valent » dans le tri éclair.
5. Réseau de neurones (cinq petits réseaux, partant de la formule), réentraîné après chaque séance ; tri éclair qui
   montre d'abord les poses où les réseaux ne sont pas d'accord. Point d'arrêt vers 1 000 paires.
6. Passage de relais, avec l'accord de l'utilisateur, vers 2 000 paires.

## Mesures de départ (26/11, 473 paires)

| Candidat | Paires bien classées |
|---|---|
| Formule actuelle | 63,2 % |
| Formule + vos goûts | 63,4 % |
| Formule + contexte | 63,8 % |
| Nouvel œil seul | 55,4 % |

Flou des mesures : ±4 points à 473 paires, ±2 points à 2 000.
