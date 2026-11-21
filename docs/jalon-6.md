# Jalon 6 : tri éclair et meilleur « œil » — plan (21/11)

Demande de l'utilisateur : passer à un niveau d'efficacité supérieur (« décupler »), viser au moins 80 % de bons
choix. Réflexion et mesures faites avant de coder.

## 1. Diagnostic mesuré sur les sauvegardes de l'utilisateur (182 + 76 choix)

Paires « photo gardée / photo supprimée » d'un même paquet, chaque paquet testé sans servir à l'apprentissage :

| Méthode | Bonne photo devinée |
|---|---|
| Formule actuelle | 59 % et 63 % |
| Apprentissage sur les mesures | 44 % et 57 % |
| Apprentissage sur l'empreinte d'image actuelle | 57 % |
| Mesures + empreinte | 65 % |

Selon l'écart de note entre les deux photos : < 0,03 → 47-49 % (pile ou face) ; 0,03-0,08 → 55 % ; 0,08-0,15 → 65-76 % ;
≥ 0,15 → 70-84 %.

Conclusions :
- Les signaux actuels ne contiennent pas ce qui fait choisir l'utilisateur entre photos presque identiques (moue,
  attitude, cadrage). Plus d'apprentissage sur ces signaux plafonne vers 60-65 % : le « mode duel » est abandonné.
- L'écart de note est un indice de confiance utile, mais insuffisant pour décider seul.
- Les choix enregistrés sont surtout des corrections : jeu de données biaisé, mesure de l'accord biaisée.

## 2. Nouvelle approche (validée par l'utilisateur le 21/11)

**L'app automatise ce qui est fiable, et rend le choix subjectif ultra rapide ; elle apprend des vraies décisions.**

### Phase A — réglage 12 : tri éclair (aucun nouveau modèle)

1. **File des poses à trancher** (`src/engine/triage/queue.ts`, moteur pur) : une tâche par pose qui demande un choix —
   pose de 2 photos ou plus, ou photo seule proposée à la suppression ou « à vérifier ». Ordre chronologique.
   Proposition de l'app pré-cochée (décision actuelle, choix de l'utilisateur s'il en a déjà fait).
2. **Confiance calibrée** (`src/engine/triage/calibration.ts`) : à partir des poses déjà validées, justesse de l'app
   par tranche d'écart de note. Une pose n'est « sûre » (sautée, gardée pour la fin) que si sa tranche a au moins
   30 poses validées et 90 % de justesse. Au début, aucune : tout est montré. L'app gagne sa confiance.
3. **Écran « Tri éclair »** (`src/ui/screens/TriEclair.tsx`), plein écran, à une main :
   - en haut : progression (pose 3 sur 12), paquet, fermer ;
   - au milieu : les photos de la pose, grandes (2 colonnes), proposition de l'app cochée en vert, les autres
     grisées ; un toucher bascule garder ↔ supprimer ; une loupe ouvre la photo en grand (zoom) ;
   - en bas, sous le pouce : « Valider » (résumé : garder 1 · supprimer 3), « Précédente » ;
   - à la fin : bilan (poses vues, temps, justesse de l'app sur ces poses), bouton vers la suppression.
4. **Données propres** : chaque pose validée enregistre un choix pour chacune de ses photos, marqué « validé »
   (`ChoiceRecord.via = 'pose'`) avec la proposition de l'app à ce moment (`ChoiceRecord.app`). Un journal des
   validations (`validations`, base IndexedDB version 4) garde par pose : écart de note, proposition, choix final,
   durée. Repris dans la sauvegarde des goûts.
5. **Mesure honnête** : justesse de l'app = part des photos (et des poses) validées où la proposition était juste,
   par séance ; affichée dans Réglages et dans le rapport. C'est le chiffre qui doit monter vers 80 %.

### Phase B — réglage 13 : meilleur « œil », d'abord en coulisse (nouveaux modèles, à approuver)

Recherche (21/11) des modèles utilisables sur l'iPhone, hors ligne, sans télémétrie :

| Rôle | Modèle | Taille | Licence | Avis |
|---|---|---|---|---|
| Expression du visage (le critère n° 1 de l'utilisateur) | HSEmotion EfficientNet-B0 (8 émotions + valence + éveil) | ~16 Mo | Apache-2.0 | **Retenu** : mesure ce que les points du visage captent mal (moue, sourire forcé) |
| Compréhension de l'image (attitude, ambiance, cadrage) | SigLIP base (int8) | ~100 Mo | Apache-2.0 | Retenu si la vitesse sur iPhone est bonne ; sinon CLIP ViT-B/32 (MIT) |
| Idem, très léger | TinyCLIP ViT-8M | ~10-30 Mo | MIT | Repli si SigLIP est trop lent |
| Idem | MobileCLIP / MobileCLIP2 (Apple) | 11-140 Mo | Recherche seulement (AMLR) | Écarté : licence |
| Esthétique générale | Aesthetic Predictor v2.5 (SigLIP so400m) | ~800 Mo | AGPL | Écarté : trop lourd, licence |
| IA qui décrit l'image | petits modèles vision-langage | 0,5-2 Go | — | Écarté : mémoire, lenteur |

Moteur d'exécution : `onnxruntime-web` (Microsoft, MIT), fichiers servis par l'app elle-même, en WebAssembly un seul
fil (pas d'en-têtes spéciaux, compatible avec la politique de sécurité actuelle `wasm-unsafe-eval`). À vérifier à
l'intégration : aucune requête externe (test + `tools/check-dist.mjs`), vitesse sur iPhone.

Fonctionnement : les nouveaux modèles tournent pendant l'analyse ; un classement personnel (régression sur les
différences entre photos d'une même pose) apprend des poses validées. Il ne décide rien : le rapport compare, sur les
poses validées, sa justesse à celle de la formule (en écartant la séance testée). Adopté seulement s'il fait
nettement mieux.

Prérequis : le réseau de l'environnement de développement bloque Hugging Face (où sont publiés ces modèles) ;
l'utilisateur doit approuver l'accès, et les modèles (taille, licence), avant l'intégration.

## 3. Risques et parades

- Poses mal découpées → l'écran du tri éclair montre un mauvais groupe : bouton « Séparer / réunir » à prévoir si
  les rapports le montrent ; en attendant, la vue par paquets reste disponible.
- Valider trop vite (« tout accepter ») fausserait l'apprentissage : la durée par pose est enregistrée ; une pose
  validée en moins de 0,7 s n'est pas comptée pour l'apprentissage ni la justesse.
- Volume de stockage : un journal de validation pèse ~200 octets par pose ; négligeable.
