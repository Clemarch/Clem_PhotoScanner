# Protocole de test sur iPhone

À suivre après chaque mise à jour. Il dit quoi faire et quoi renvoyer à Claude pour avancer.
Claude complète la partie « Ce test-ci » à chaque mise à jour.

## Toujours

1. Fusionner la pull request indiquée par Claude, attendre 3 minutes.
2. En Wi-Fi, ouvrir l'app et la laisser ouverte 2 à 3 minutes (la mise à jour télécharge les modèles, environ 50 Mo
   en tout ; une connexion faible peut la faire échouer, l'ancienne version reste alors en place). Puis la fermer
   complètement, la rouvrir deux fois, et vérifier la version écrite en bas de l'écran d'accueil.
3. Choisir les photos d'une journée et lancer l'analyse.
4. Onglet **Trier** : pour chaque paquet, ouvrir les photos et les feuilleter (glisser le doigt, ou toucher les
   miniatures du paquet en bas de l'écran).
   - Quand l'app se trompe, toucher **Garder** ou **Supprimer** (ces boutons marquent la photo, ils ne suppriment rien).
     Ce qu'on ne touche pas compte comme un accord avec l'app, au moment de l'envoi au raccourci.
   - Les photos avec une pastille bleue **?** sont à départager dans leur paquet.
   - Faire au moins **un « À garder » et un « À supprimer » dans un même paquet** : c'est cette paire qui permet à
     l'app d'apprendre.
   - Après un choix, écrire en quelques mots **pourquoi** dans la zone « Pourquoi ? » : le commentaire arrive dans
     le rapport.
5. Onglet **Supprimer** : toucher le grand bouton rouge (lots de 49 au plus), vérifier l'aperçu du raccourci, confirmer.
6. Onglet **Réglages** → « Rapport de cette séance » → **Partager**, puis choisir l'app Claude (ou **Copier** et
   coller). Les 10 derniers rapports restent sur l'iPhone (Réglages › « Rapports enregistrés ») : on peut les envoyer
   tous d'un coup.
7. Réglages › « Mes goûts » → **Sauvegarder** quand l'app le propose (bouton jaune).

## Ce qu'il faut écrire à Claude avec le rapport

Quelques lignes suffisent, avec les numéros affichés sur les photos :

- **Paquets mal découpés** : « les n° 12 à 15 devraient être un paquet à part », ou « bien découpés ».
  Pour réunir deux paquets d'une même scène, utilisez le lien « réunir » sous le paquet.
- **Erreurs graves** : une photo que vous gardez absolument et que l'app voulait supprimer (numéro, et pourquoi
  vous la gardez en quelques mots).
- **Raisons fausses** : une raison affichée qui ne correspond pas à la photo (numéro + raison).
- **Ce que l'app ne voit pas** : un critère qui a compté pour vous et qu'aucune raison ne mentionne.
- **Lenteurs, bugs, écrans peu clairs.**

Inutile de commenter les photos où l'app a raison.

## Ce test-ci

Voir le dernier message de Claude : il précise ce qui vient de changer et ce qu'il faut regarder en particulier.
