// Pont vers l'app Raccourcis d'Apple : la seule façon, pour une app web, de faire supprimer des photos de la
// photothèque. L'app ouvre le raccourci « Photo Triage » avec la liste des noms ; le raccourci retrouve les photos
// et iOS demande une confirmation avant de les supprimer (elles restent 30 jours dans « Supprimés récemment »).

export const SHORTCUT_NAME = 'Photo Triage';

/** Nom de la photo dans Photos : le nom du fichier sans son extension (IMG_0654.jpeg → IMG_0654). */
export function photoName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** Lien qui ouvre le raccourci avec une photo par ligne. Ce n'est pas un appel réseau : iOS ouvre l'app Raccourcis. */
export function shortcutUrl(fileNames: readonly string[]): string {
  const text = fileNames.map(photoName).join('\n');
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`;
}

export function runShortcut(fileNames: readonly string[]): void {
  window.location.href = shortcutUrl(fileNames);
}
