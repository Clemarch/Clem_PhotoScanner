import { config, type AsideKind, type Decision, type DifferenceKind, type FeatureName, type Reason, type SceneType } from '../engine';

/** Texte affiché pour chaque raison. `numberOf` donne le numéro d'une photo dans la journée. */
export function reasonText(reason: Reason, numberOf: (id: string) => number | null): string {
  switch (reason.code) {
    case 'yeux-fermes':
      return 'Yeux fermés';
    case 'visage-coupe':
      return 'Visage coupé par le bord';
    case 'visage-cache':
      return `Un visage caché ou absent (${reason.count} visible${(reason.count ?? 0) > 1 ? 's' : ''} sur ${reason.expected})`;
    case 'aucun-visage':
      return 'Aucun visage visible';
    case 'visage-masque':
      return 'Visage en partie masqué (objet, main…)';
    case 'devant':
      return 'Quelque chose devant la personne (objet tenu, bras…)';
    case 'visage-sombre':
      return 'Visage plus sombre que sur les autres photos';
    case 'surexposee':
      return 'Zones trop claires (détails perdus)';
    case 'sous-exposee':
      return 'Zones trop sombres (détails perdus)';
    case 'membre-coupe':
      return 'Main, bras ou jambe coupé par le bord (plus que sur les autres photos)';
    case 'bords-masques':
      return 'Bords masqués (hublot, doigt, ombre…)';
    case 'tres-floue':
      return 'Très floue';
    case 'parle':
      return 'Bouche ouverte, en train de parler';
    case 'pose':
      return 'Pose voulue (moue, bisou…)';
    case 'geste':
      return 'Geste voulu (V, pouce levé…)';
    case 'regard-ailleurs':
      return 'Photo de groupe : quelqu’un ne regarde pas l’objectif';
    case 'erreur-probable':
      return 'Prise par erreur ? (aucune personne, floue et très penchée)';
    case 'visage-non-analyse':
      return 'Un visage n’a pas pu être analysé (tête tournée ?)';
    case 'couleurs-vives':
      return 'Les plus belles couleurs du paquet';
    case 'couleurs-ternes':
      return 'Couleurs plus ternes ou exposition moins équilibrée';
    case 'equilibree':
      return 'Exposition équilibrée';
    case 'arriere-plan':
      return 'Personnes gênantes en arrière-plan';
    case 'objet': {
      const names = (reason.labels ?? []).map((label) => config.content.distractingLabels[label] ?? label);
      return names.length ? `Objet qui gêne : ${names.join(', ')}` : 'Objet qui gêne';
    }
    case 'horizon':
      return `Photo penchée (${(reason.degrees ?? 0).toFixed(1).replace('.', ',')}°)`;
    case 'visage-flou':
      return 'Visage moins net que sur les autres photos';
    case 'moins-nette': {
      const n = reason.refId ? numberOf(reason.refId) : null;
      return n === null ? 'Moins nette que la meilleure du paquet' : `Moins nette que la n° ${n}`;
    }
    case 'sourire':
      return 'Beau sourire';
    case 'plus-nette':
      return 'La plus nette du paquet';
  }
}

const note = (score: number | undefined): string => (score === undefined ? '?' : String(Math.min(100, Math.max(0, Math.round(score * 100)))));

/** Liste lisible : « la n° 9 », « les n° 9 et 11 ». */
function photoList(ids: readonly string[], numberOf: (id: string) => number | null): string {
  const numbers = ids.map(numberOf).filter((n): n is number => n !== null);
  if (numbers.length === 0) return 'd’autres photos';
  if (numbers.length === 1) return `la n° ${numbers[0]}`;
  return `les n° ${numbers.slice(0, -1).join(', ')} et ${numbers[numbers.length - 1]}`;
}

/** Raison de la décision « garder » / « supprimer » de l'app, avec la comparaison qui la justifie. */
const DIFFERENCE_LABEL: Record<DifferenceKind, string> = {
  tete: 'position de la tête',
  expression: 'expression',
  regard: 'regard',
  geste: 'geste',
  personnes: 'personnes qui bougent',
  cadrage: 'cadrage',
};

export function differenceText(kinds: readonly DifferenceKind[] | undefined): string {
  return (kinds ?? []).map((k) => DIFFERENCE_LABEL[k]).join(', ') || 'détails';
}

export function decisionText(
  decision: Decision,
  numberOf: (id: string) => number | null,
  scoreOf: (id: string) => number | undefined = () => undefined,
  self?: string,
): string {
  const ref = decision.refId ? numberOf(decision.refId) : null;
  const n = ref === null ? 'la meilleure' : `la n° ${ref}`;
  const mine = self ? note(scoreOf(self)) : '?';
  const kept = decision.keptIds ?? [];
  const keptNotes = kept.map((id) => note(scoreOf(id))).join(' et ');
  switch (decision.code) {
    case 'meilleure':
      return 'La meilleure de sa pose';
    case 'aussi-bonne':
      return `Aussi bien notée que ${n}, la meilleure de sa pose (${mine} contre ${note(decision.refId ? scoreOf(decision.refId) : undefined)} sur 100)`;
    case 'differente':
      return `Bonne aussi, et différente de ${n} (${differenceText(decision.differences)}) : gardée en plus`;
    case 'a-verifier':
      if (!decision.refId) return 'Peut-être prise par erreur : à vous de trancher. Sans choix de votre part, elle est gardée';
      if (decision.differences?.length)
        return `Un peu différente de ${n} (${differenceText(decision.differences)}) : à vous de trancher. Sans choix de votre part, elle est gardée`;
      return `Presque aussi bien notée que ${n}, la meilleure de sa pose (${mine} contre ${note(decision.refId ? scoreOf(decision.refId) : undefined)} sur 100) : à vous de trancher. Sans choix de votre part, elle est gardée`;
    case 'seule':
      return 'Seule photo de son paquet';
    case 'minimum':
      return 'Gardée pour qu’il reste au moins une photo du paquet';
    case 'trop-proche':
      return `Presque identique à ${n}, gardée à sa place`;
    case 'moins-bonne':
      return `Moins bien notée que ${n}, la meilleure de sa pose (${mine} contre ${note(decision.refId ? scoreOf(decision.refId) : undefined)} sur 100)`;
    case 'plafond':
      return `Le paquet garde au plus 25 % de ses photos : ${photoList(kept, numberOf)} ${kept.length > 1 ? 'sont mieux notées' : 'est mieux notée'} (${keptNotes} contre ${mine} sur 100)`;
    case 'veto':
      return 'Écartée : défaut rédhibitoire';
    case 'ratee':
      return 'Toutes les photos de ce paquet sont ratées : il peut être entièrement supprimé';
  }
}

export const sceneLabel: Record<SceneType, string> = {
  selfie: 'Selfie',
  portrait: 'Portrait',
  groupe: 'Groupe',
  coucher: 'Coucher de soleil',
  paysage: 'Paysage',
  nourriture: 'Nourriture',
  animal: 'Animal',
  document: 'Document ou capture',
};

/** Ce que l'app cherche pour chaque type de photo. */
export const sceneGoal: Record<SceneType, string> = {
  selfie: 'les expressions, personne qui parle, rien devant les visages',
  portrait: 'l’expression, un visage net, rien qui gêne',
  groupe: 'tout le monde visible et réussi : le visage le plus raté décide',
  coucher: 'les couleurs chaudes les plus intenses, du contraste, une exposition équilibrée',
  paysage: 'du contraste, des couleurs vives, une exposition équilibrée, un horizon droit',
  nourriture: 'des couleurs vives et appétissantes, une photo nette et bien exposée',
  animal: 'une photo nette, bien exposée, avec du contraste',
  document: 'la plus nette et la plus lisible',
};

export const featureLabel: Record<FeatureName, string> = {
  expression: 'expression',
  sourire: 'sourire',
  pose: 'pose (moue, bisou)',
  regard: 'regard vers l’objectif',
  netteteVisage: 'netteté des visages',
  masquage: 'visage masqué',
  devant: 'objet devant la personne',
  arrierePlan: 'personnes en arrière-plan',
  objets: 'objets gênants',
  penchee: 'photo penchée',
  membres: 'mains, bras ou jambes coupés',
  bords: 'bords masqués',
  couleurs: 'couleurs vives',
  chaud: 'couleurs chaudes',
  contraste: 'contraste',
  equilibre: 'exposition équilibrée',
  nettete: 'netteté de l’image',
  geste: 'geste voulu (V, pouce levé)',
};

/** Pourquoi un fichier est mis de côté (toujours gardé, jamais proposé à la suppression). */
export const asideLabel: Record<AsideKind, string> = {
  raw: 'RAW (traité dans Lightroom)',
  video: 'vidéo (pas encore analysée)',
  capture: 'capture d’écran ou image enregistrée',
  document: 'photo d’un document ou d’un écran',
};
