# Photo Triage — règles du projet

PWA 100 % locale pour iPhone (Safari, iPhone 14 Pro) : l'utilisateur sélectionne les photos d'une journée,
l'app les groupe en paquets puis en poses, propose les meilleures et montre lesquelles supprimer à la main.

Plan d'origine : `docs/plan-initial.md` (proposition, pas une spécification).
Décisions prises et écarts : `docs/decisions.md` — à mettre à jour à chaque nouveau choix.

## Contraintes non négociables

- Tout reste sur l'iPhone : aucun appel réseau après l'installation, aucune télémétrie, modèles d'IA embarqués.
- Pas d'ordinateur côté utilisateur : tout se teste sur iPhone via l'URL GitHub Pages.
- Aucune suppression automatique. L'écran final rend la suppression manuelle la plus simple possible.
- Jamais de photos dans le dépôt (`tests/fixtures/` est ignoré par git).
- Interface en français, fluide, soignée, utilisable d'une main.
- RAW repérés et mis de côté. Vidéos plus tard (`MediaItem.kind`). Live Photos non ciblées.
- Esprit de la sélection : jugement relatif par paquet, quota = plafond jamais objectif, au moins 1 photo par paquet.

## Utilisateur

Novice, sans ordinateur. Toute consigne qui lui est adressée : en français, numérotée, sans jargon,
avec l'endroit exact où toucher, et chaque terme technique expliqué en une phrase.
Ne pas entamer un nouveau jalon sans son accord.

## Architecture

- `src/engine` : TypeScript pur. N'importe ni `platform`, ni `ui`, ni bibliothèque externe ; ne touche pas au navigateur.
  Tous les seuils et poids dans `src/engine/config.ts`.
- `src/platform` : tout ce qui dépend de Safari (décodage, Worker, appareil). Importe `engine`.
- `src/ui` : React. Importe `engine` et `platform`.
- Mémoire iOS : une photo décodée à la fois, réduite à 1024 px, `close()` et canvas remis à zéro après usage.

## Commandes

- `npm test` : tests unitaires + garde-fous (pas de réseau, moteur pur).
- `npm run lint` : ESLint (mêmes garde-fous).
- `npm run build` : vérification des types, construction, puis contrôle de `dist/` (CSP, aucune ressource externe).
- `npm run dev` : serveur local.

## Déploiement

GitHub Actions (`.github/workflows/deploy.yml`) publie sur GitHub Pages à chaque envoi sur `main`.

## État

Jalons 0 (diagnostic) et 1 (paquets par temps + netteté globale) faits. Suite : voir `docs/decisions.md`.
