# Protocole de test sur iPhone

À suivre après chaque mise à jour. Il dit quoi faire et quoi renvoyer à Claude pour avancer.
Claude complète la partie « Ce test-ci » à chaque mise à jour.

## Toujours

1. Fusionner la pull request indiquée par Claude, attendre 3 minutes.
2. **Ne jamais supprimer l'app de l'écran d'accueil pour la mettre à jour** (cela efface ses goûts et ses séances), et
   ne pas passer par Safari (sa mémoire est séparée de celle de l'app). En Wi-Fi, ouvrir l'app depuis son icône :
   depuis le réglage 15 ter, elle cherche la mise à jour à chaque retour au premier plan, et l'encadré « Nouvelle
   version prête » (en haut de n'importe quel écran) propose « Installer maintenant » ; séance et choix sont gardés.
   À défaut : Réglages › « Rechercher une mise à jour ». Vérifier la version écrite en bas de l'accueil, et attendre « Modèles d'analyse prêts ✓ » (la première
   fois, l'app télécharge les modèles du nouvel œil, 111 Mo, avec une barre de progression).
3. Choisir les photos d'une journée et lancer l'analyse.
4. **Tri éclair** (s'ouvre tout seul après l'analyse, sinon carte « ⚡ Tri éclair » en haut de l'onglet Trier) :
   pour chaque pose, toucher les photos mal jugées, puis « Valider ». Prendre le temps de regarder : une pose validée
   en moins d'une seconde sans rien changer ne sert pas à l'apprentissage.
5. Ensuite, si besoin, onglet **Trier** : pour chaque paquet, ouvrir les photos et les feuilleter (glisser le doigt, ou toucher les
   miniatures du paquet en bas de l'écran).
   - Quand l'app se trompe, toucher **Garder** ou **Supprimer** (ces boutons marquent la photo, ils ne suppriment rien).
     Ce qu'on ne touche pas compte comme un accord avec l'app, au moment de l'envoi au raccourci.
   - Les photos avec une pastille bleue **?** sont à départager dans leur paquet.
   - Faire au moins **un « À garder » et un « À supprimer » dans un même paquet** : c'est cette paire qui permet à
     l'app d'apprendre.
   - Après un choix, écrire en quelques mots **pourquoi** dans la zone « Pourquoi ? » : le commentaire arrive dans
     le rapport.
6. Onglet **Supprimer** : toucher le grand bouton rouge (lots de 49 au plus), vérifier l'aperçu du raccourci, confirmer.
7. Onglet **Réglages** → « Envoyer à Claude » → **Partager**, puis choisir l'app Claude (ou **Copier** et
   coller). Les 10 derniers rapports restent sur l'iPhone (Réglages › « Envoyer à Claude », juste en dessous, ligne
   « Les … dernières analyses ») : on peut les envoyer tous
   d'un coup.
8. Réglages › « Mes goûts » → **Sauvegarder** quand l'app le propose (bouton jaune).

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
