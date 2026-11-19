// Pont vers l'app Raccourcis d'Apple : la seule façon, pour une app web, de faire supprimer des photos de la
// photothèque (une app web n'a aucun accès à Photos). L'app ouvre le raccourci « Photo Triage » avec une ligne par
// photo ; pour chaque ligne, le raccourci fait UNE recherche dans Photos, avec deux filtres à la fois :
//   - Nom est IMG_0696 (les noms ne sont pas uniques : le compteur de l'iPhone repart à zéro, photos reçues…) ;
//   - Date de création entre 22:29:51 et 22:29:55 (fenêtre de ±2 s autour de la prise de vue).
// Les deux ensemble désignent une seule photo. La recherche par date est rapide (pas de parcours de la photothèque),
// et rien n'est comparé en texte dans le raccourci : plus de piège de format (« s » au lieu de « ss »).
// Le raccourci montre ensuite les photos trouvées (aperçu) avant que l'iPhone demande la confirmation.

export const SHORTCUT_NAME = 'Photo Triage';
/** Demi-largeur de la fenêtre de temps autour de la prise de vue, en secondes. */
export const SHORTCUT_WINDOW_SECONDS = 2;

/** Nom de la photo dans Photos : le nom du fichier sans son extension (IMG_0654.jpeg → IMG_0654). */
export function photoName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Date lisible par l'app Raccourcis (année en premier, sans ambiguïté), dans le fuseau actuel de l'iPhone. */
export function shortcutDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface ShortcutPhoto {
  fileName: string;
  /** Instant de prise de vue (ms), ou null si inconnu. */
  at: number | null;
}

/**
 * Une ligne par photo : « IMG_0696|2026-11-18 22:29:51|2026-11-18 22:29:55 » (nom, début et fin de la fenêtre).
 * Une photo sans heure de prise de vue n'est pas envoyée : on ne pourrait pas la désigner sans ambiguïté.
 */
export function shortcutText(photos: readonly ShortcutPhoto[]): string {
  const w = SHORTCUT_WINDOW_SECONDS * 1000;
  return photos
    .filter((p) => p.at !== null)
    .map((p) => {
      const second = Math.floor(p.at! / 1000) * 1000;
      return `${photoName(p.fileName)}|${shortcutDate(second - w)}|${shortcutDate(second + w)}`;
    })
    .join('\n');
}

/** Nombre de photos réellement envoyées (avec une heure connue). */
export function shortcutCount(photos: readonly ShortcutPhoto[]): number {
  return photos.filter((p) => p.at !== null).length;
}

/** Lien qui ouvre le raccourci. Ce n'est pas un appel réseau : iOS ouvre l'app Raccourcis. */
export function shortcutUrl(photos: readonly ShortcutPhoto[]): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(shortcutText(photos))}`;
}

export function runShortcut(photos: readonly ShortcutPhoto[]): void {
  window.location.href = shortcutUrl(photos);
}
