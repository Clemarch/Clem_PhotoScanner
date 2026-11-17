# Protocole de test sur iPhone

À suivre après chaque mise à jour. Il dit quoi faire et quoi renvoyer à Claude pour avancer.
Claude complète la partie « Ce test-ci » à chaque mise à jour.

## Toujours

1. Fusionner la pull request indiquée par Claude, attendre 3 minutes.
2. Fermer complètement l'app, la rouvrir deux fois, vérifier la version écrite en bas de l'écran d'accueil.
3. Choisir les photos d'une journée et lancer l'analyse.
4. Pour chaque paquet, ouvrir les photos et les feuilleter en glissant le doigt.
   - Quand l'app se trompe, toucher **✓ À garder** ou **✕ À supprimer** (ces boutons marquent la photo, ils ne suppriment rien).
   - Faire au moins **un « À garder » et un « À supprimer » dans un même paquet** : c'est cette paire qui permet à
     l'app d'apprendre.
5. Onglet **2. Dans Photos** : reproduire la suppression dans Photos pour au moins un paquet, et dire si c'était simple.
6. Onglet **Diagnostic** → **Copier le rapport** (après les choix, pour qu'il les contienne), et le coller à Claude.

## Ce qu'il faut écrire à Claude avec le rapport

Quelques lignes suffisent, avec les numéros affichés sur les photos :

- **Paquets mal découpés** : « les n° 12 à 15 devraient être un paquet à part », ou « bien découpés ».
  Pour réunir deux paquets d'une même série, utilisez le lien « les réunir » sous le titre du paquet.
- **Erreurs graves** : une photo que vous gardez absolument et que l'app voulait supprimer (numéro, et pourquoi
  vous la gardez en quelques mots).
- **Raisons fausses** : une raison affichée qui ne correspond pas à la photo (numéro + raison).
- **Ce que l'app ne voit pas** : un critère qui a compté pour vous et qu'aucune raison ne mentionne.
- **Lenteurs, bugs, écrans peu clairs.**

Inutile de commenter les photos où l'app a raison.

## Ce test-ci

Voir le dernier message de Claude : il précise ce qui vient de changer et ce qu'il faut regarder en particulier.
