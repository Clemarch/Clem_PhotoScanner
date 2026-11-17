import { config, type Reason } from '../engine';

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
    case 'parle':
      return 'Bouche ouverte, en train de parler';
    case 'moue':
      return 'Moue';
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
