// Dernière séance triée (première et dernière heure de prise de vue), pour savoir où reprendre la fois suivante.
// Sur l'iPhone seulement (stockage local du navigateur).

export interface LastRun {
  firstAt: number;
  lastAt: number;
  photos: number;
  /** Quand l'analyse a eu lieu. */
  doneAt: number;
  /** Empreinte de l'ensemble des photos (noms et dates) : la même sélection analysée deux fois n'est pas une
   *  nouvelle séance. */
  signature: string;
}

/** Empreinte courte d'une liste de clés de photos (ordre indifférent). */
export function runSignature(keys: readonly string[]): string {
  let h = 5381;
  for (const k of [...keys].sort()) for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0;
  return `${keys.length}-${(h >>> 0).toString(16)}`;
}

const KEY = 'photo-triage.derniere-seance';

export function loadLastRun(): LastRun | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LastRun> | null;
    if (value && typeof value.firstAt === 'number' && typeof value.lastAt === 'number' && typeof value.photos === 'number')
      return { firstAt: value.firstAt, lastAt: value.lastAt, photos: value.photos, doneAt: value.doneAt ?? 0, signature: value.signature ?? '' };
  } catch {
    // Rien d'enregistré.
  }
  return null;
}

export function saveLastRun(run: LastRun): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // Mémoire seulement.
  }
}
