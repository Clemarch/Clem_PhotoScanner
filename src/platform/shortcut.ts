// Pont vers l'app Raccourcis d'Apple : la seule façon, pour une app web, de faire supprimer des photos de la
// photothèque. L'app ouvre le raccourci « Photo Triage » avec la liste des noms ; le raccourci parcourt les photos
// récentes, garde celles dont le nom est exactement dans la liste, et iOS demande une confirmation avant de les
// supprimer (elles restent 30 jours dans « Supprimés récemment »).
//
// Les noms ne sont pas uniques dans la photothèque (six photos « IMG_0696 » le 18/11) : le raccourci compare le nom
// et l'heure de prise de vue à la seconde.

export const SHORTCUT_NAME = 'Photo Triage';
/** Le raccourci ne parcourt que les photos de ces derniers jours (plus, ce serait lent). */
export const SHORTCUT_DAYS = 14;

/** Nom de la photo dans Photos : le nom du fichier sans son extension (IMG_0654.jpeg → IMG_0654). */
export function photoName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Heure de prise de vue au format du raccourci (« Formater la date », format personnalisé yyyy-MM-dd HH:mm:ss),
 *  dans le fuseau actuel de l'iPhone, comme l'affiche l'app Raccourcis. */
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
 * Une ligne par photo : « <IMG_0654|2026-11-18 22:45:12> ». Le nom seul ne suffit pas (essai du 18/11 : six photos
 * s'appellent IMG_0696 dans la photothèque, le compteur de l'iPhone repart à zéro). Le raccourci cherche « <nom|date> »
 * en entier : correspondance exacte, au nom et à la seconde près.
 */
export function shortcutText(photos: readonly ShortcutPhoto[]): string {
  return photos
    .filter((p) => p.at !== null)
    .map((p) => `<${photoName(p.fileName)}|${shortcutDate(p.at!)}>`)
    .join('\n');
}

/** Lien qui ouvre le raccourci. Ce n'est pas un appel réseau : iOS ouvre l'app Raccourcis. */
export function shortcutUrl(photos: readonly ShortcutPhoto[]): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(shortcutText(photos))}`;
}

export function runShortcut(photos: readonly ShortcutPhoto[]): void {
  window.location.href = shortcutUrl(photos);
}
