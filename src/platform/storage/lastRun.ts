// Dernière séance triée (première et dernière heure de prise de vue), pour savoir où reprendre la fois suivante.
// Sur l'iPhone seulement (stockage local du navigateur).

export interface LastRun {
  firstAt: number;
  lastAt: number;
  photos: number;
  /** Quand l'analyse a eu lieu. */
  doneAt: number;
}

const KEY = 'photo-triage.derniere-seance';

export function loadLastRun(): LastRun | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LastRun> | null;
    if (value && typeof value.firstAt === 'number' && typeof value.lastAt === 'number' && typeof value.photos === 'number')
      return { firstAt: value.firstAt, lastAt: value.lastAt, photos: value.photos, doneAt: value.doneAt ?? 0 };
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
