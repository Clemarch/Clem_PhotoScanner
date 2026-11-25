// Séances hors statistiques (utilisateur, 25/11) : par exemple une séance de photos déjà triées avec une version
// précédente de l'app. Ses choix restent (ce sont vos goûts) ; ses poses validées ne comptent plus dans la justesse,
// la confiance du tri éclair ni la comparaison du nouvel œil.

const KEY = 'photo-triage.seances-hors-stats';

export function loadExcludedSessions(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function saveExcludedSessions(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Mémoire seulement.
  }
}
