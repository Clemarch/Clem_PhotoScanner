// Pont vers l'app Raccourcis d'Apple : la seule façon, pour une app web, de faire supprimer des photos de la
// photothèque (une app web n'a aucun accès à Photos). L'app ouvre le raccourci « Photo Triage » avec une ligne par
// photo ; pour chaque ligne, le raccourci fait UNE recherche dans Photos, avec deux filtres à la fois :
//   - Nom est IMG_0696 (les noms ne sont pas uniques : le compteur de l'iPhone repart à zéro, photos reçues…) ;
//   - Date de création entre 22:29:51 et 22:29:55 (fenêtre de ±2 s autour de la prise de vue).
// Les deux ensemble désignent une seule photo. La recherche par date est rapide (pas de parcours de la photothèque),
// et rien n'est comparé en texte dans le raccourci : plus de piège de format (« s » au lieu de « ss »).
// Le raccourci montre ensuite les photos trouvées (aperçu) avant que l'iPhone demande la confirmation.

export const SHORTCUT_NAME = 'Photo Triage';
/** Copie de « Photo Triage » qui range les photos reçues dans l'album « Triées » au lieu de les supprimer (24/11). */
export const KEEP_SHORTCUT_NAME = 'Photo Triage Garder';
/**
 * Raccourci qui remplit l'album « À trier » (point 71, accord de l'utilisateur, 27/11) : il reçoit une période
 * « début|fin » (la plus récente que les séances n'ont pas couverte), copie les photos de cette période dans
 * « À trier » (le bloc « Créer un album photo » copie toujours), puis supprime les originales, avec la confirmation
 * d'iOS : chaque photo reste en un seul exemplaire, dans « À trier ».
 */
export const PREP_SHORTCUT_NAME = 'Préparer le tri';
/** Photos mises dans « À trier » à chaque préparation : iOS refuse qu'un raccourci en supprime 50 ou plus. */
export const PREP_LIMIT = 40;
/** Album des photos déjà triées et gardées, et album des photos à trier (créés par l'utilisateur dans Photos). */
export const KEPT_ALBUM = 'Triées';
export const TODO_ALBUM = 'À trier';

/** iOS bloque la suppression de 50 photos ou plus par un raccourci (réglage de protection) : lots de 49 au plus. */
export const SHORTCUT_BATCH = 49;
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

const lines = (photos: readonly ShortcutPhoto[]): string[] => {
  const w = SHORTCUT_WINDOW_SECONDS * 1000;
  return photos
    .filter((p) => p.at !== null)
    .map((p) => {
      const second = Math.floor(p.at! / 1000) * 1000;
      return `${photoName(p.fileName)}|${shortcutDate(second - w)}|${shortcutDate(second + w)}`;
    });
};

/**
 * Une ligne par photo : « IMG_0696|2026-11-18 22:29:51|2026-11-18 22:29:55 » (nom, début et fin de la fenêtre).
 * Une photo sans heure de prise de vue n'est pas envoyée : on ne pourrait pas la désigner sans ambiguïté.
 * Même format pour « Photo Triage Garder » (photos gardées, rangées dans l'album « Triées »).
 */
export function shortcutText(photos: readonly ShortcutPhoto[]): string {
  return lines(photos).join('\n');
}

/** Nombre de photos réellement envoyées (avec une heure connue). */
export function shortcutCount(photos: readonly ShortcutPhoto[]): number {
  return photos.filter((p) => p.at !== null).length;
}

/** Lien qui ouvre le raccourci. Ce n'est pas un appel réseau : iOS ouvre l'app Raccourcis. */
export function shortcutUrl(photos: readonly ShortcutPhoto[], name: string = SHORTCUT_NAME): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(shortcutText(photos))}`;
}

export function runShortcut(photos: readonly ShortcutPhoto[]): void {
  window.location.href = shortcutUrl(photos);
}

/** Range des photos gardées dans l'album « Triées » (raccourci « Photo Triage Garder »). Rien n'est supprimé. */
export function runKeepShortcut(photos: readonly ShortcutPhoto[]): void {
  window.location.href = shortcutUrl(photos, KEEP_SHORTCUT_NAME);
}



/** Avant la première photo connue : une date assez ancienne pour tout couvrir. */
const EARLIEST = new Date(2000, 0, 1).getTime();

/** Période envoyée à « Préparer le tri » : « 2026-11-26 18:30:00|2026-11-27 22:10:00 » (bornes comprises). */
export function prepText(span: { start: number; end: number }): string {
  const start = Number.isFinite(span.start) ? span.start : EARLIEST;
  return `${shortcutDate(start)}|${shortcutDate(span.end)}`;
}

/** Ouvre « Préparer le tri » avec la période à trier (pas un appel réseau : iOS ouvre l'app Raccourcis). */
export const prepShortcutUrl = (span: { start: number; end: number }): string =>
  `shortcuts://run-shortcut?name=${encodeURIComponent(PREP_SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(prepText(span))}`;
export function runPrepShortcut(span: { start: number; end: number }): void {
  window.location.href = prepShortcutUrl(span);
}

/** Photos gardées envoyées par lots (adresse de taille raisonnable). */
export const KEPT_BATCH = 300;

const ALBUMS_KEY = 'photo-triage.albums';
/**
 * Albums « Triées » / « À trier » : retirés le 27/11 (point 70). Le bloc « Créer un album photo » de l'app Raccourcis
 * enregistre une copie de chaque photo (sa sortie s'appelle « Fichier multimédia photo enregistré ») : chaque photo
 * triée par les albums existait en 3 exemplaires. Aucun bloc de Raccourcis ne range une photo dans un album sans la
 * copier : l'app ne s'en sert plus. Gardé pour les anciens écrans ; toujours faux.
 */
export function albumsEnabled(): boolean {
  void ALBUMS_KEY;
  return false;
}
export function setAlbumsEnabled(on: boolean): void {
  try {
    localStorage.setItem(ALBUMS_KEY, on ? '1' : '0');
  } catch {
    // Mémoire seulement.
  }
}
