// Pont vers l'app Raccourcis d'Apple : la seule façon, pour une app web, de faire supprimer des photos de la
// photothèque. L'app ouvre le raccourci « Photo Triage » avec la liste des noms ; le raccourci parcourt les photos
// récentes, garde celles dont le nom est exactement dans la liste, et iOS demande une confirmation avant de les
// supprimer (elles restent 30 jours dans « Supprimés récemment »).
//
// Les noms ne sont pas uniques dans la photothèque (six photos « IMG_0696 » le 18/11) : le raccourci compare le nom
// et l'heure de prise de vue à la seconde.

export const SHORTCUT_NAME = 'Photo Triage';
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
 * Texte envoyé au raccourci :
 * - d'abord un nom par ligne (« IMG_0654 »), sans doublon : le raccourci cherche chaque nom dans Photos, ce qui ne
 *   donne que quelques photos à examiner (rapide, quelle que soit la date) ;
 * - puis, sur la dernière ligne, les clés exactes « <IMG_0654|2026-11-18 22:45:12> » : nom et heure à la seconde.
 *   Le raccourci ne garde une photo trouvée que si sa clé y figure, car les noms ne sont pas uniques (six photos
 *   « IMG_0696 » le 18/11). Cette ligne, cherchée comme un nom, ne trouve rien.
 */
export function shortcutText(photos: readonly ShortcutPhoto[]): string {
  const dated = photos.filter((p) => p.at !== null);
  const names = [...new Set(dated.map((p) => photoName(p.fileName)))];
  const keys = dated.map((p) => `<${photoName(p.fileName)}|${shortcutDate(p.at!)}>`).join('');
  return [...names, keys].join('\n');
}

/** Lien qui ouvre le raccourci. Ce n'est pas un appel réseau : iOS ouvre l'app Raccourcis. */
export function shortcutUrl(photos: readonly ShortcutPhoto[]): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(shortcutText(photos))}`;
}

export function runShortcut(photos: readonly ShortcutPhoto[]): void {
  window.location.href = shortcutUrl(photos);
}
