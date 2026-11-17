import type { Reason } from '../engine';

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
    case 'regard-ailleurs':
      return 'Ne regarde pas l’objectif';
    case 'expression':
      return 'Expression ratée (bouche ouverte ou moue)';
    case 'visage-flou':
      return 'Visage moins net que sur les autres photos';
    case 'moins-nette': {
      const n = reason.refId ? numberOf(reason.refId) : null;
      return n === null ? 'Moins nette que la meilleure du paquet' : `Moins nette que la n° ${n}`;
    }
    case 'regarde-objectif':
      return 'Regarde l’objectif';
    case 'sourire':
      return 'Sourire';
    case 'visage-net':
      return 'Visage net';
    case 'plus-nette':
      return 'La plus nette du paquet';
  }
}
