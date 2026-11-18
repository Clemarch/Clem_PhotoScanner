// Pont vers l'app Raccourcis d'Apple : la seule façon, pour une app web, de faire supprimer des photos de la
// photothèque. L'app ouvre le raccourci « Photo Triage » avec la liste des noms ; le raccourci parcourt les photos
// récentes, garde celles dont le nom est exactement dans la liste, et iOS demande une confirmation avant de les
// supprimer (elles restent 30 jours dans « Supprimés récemment »).
//
// Le filtre « Nom » de l'action « Rechercher des photos » ne trouve rien (essai du 18/11), alors que « Obtenir le nom »
// renvoie bien « IMG_0701 » : le raccourci compare donc lui-même les noms.

export const SHORTCUT_NAME = 'Photo Triage';
/** Le raccourci ne parcourt que les photos de ces derniers jours (plus, ce serait lent). */
export const SHORTCUT_DAYS = 14;

/** Nom de la photo dans Photos : le nom du fichier sans son extension (IMG_0654.jpeg → IMG_0654). */
export function photoName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** Chaque nom est entouré de chevrons (<IMG_0654>) : le raccourci cherche « <nom> », donc une correspondance exacte. */
export function shortcutText(fileNames: readonly string[]): string {
  return fileNames.map((name) => `<${photoName(name)}>`).join('\n');
}

/** Lien qui ouvre le raccourci. Ce n'est pas un appel réseau : iOS ouvre l'app Raccourcis. */
export function shortcutUrl(fileNames: readonly string[]): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(shortcutText(fileNames))}`;
}

export function runShortcut(fileNames: readonly string[]): void {
  window.location.href = shortcutUrl(fileNames);
}
