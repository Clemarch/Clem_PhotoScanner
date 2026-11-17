const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortTimeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatTime = (ms: number | null): string => (ms === null ? '—' : timeFormat.format(ms));
export const formatShortTime = (ms: number | null): string => (ms === null ? '—' : shortTimeFormat.format(ms));
export const formatDate = (ms: number | null): string => (ms === null ? '—' : dateFormat.format(ms));
export const formatDateTime = (ms: number | null): string =>
  ms === null ? '—' : `${dateFormat.format(ms)} ${timeFormat.format(ms)}`;

export function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} ko`;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${Math.round(ms)} ms`;
}

export function formatGap(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const ORIENTATIONS: Record<number, string> = {
  1: 'normale',
  2: 'miroir',
  3: 'tête en bas',
  4: 'miroir, tête en bas',
  5: 'miroir, tournée',
  6: 'tournée à droite',
  7: 'miroir, tournée',
  8: 'tournée à gauche',
};

export const formatOrientation = (value: number | null): string =>
  value === null ? '—' : `${value} (${ORIENTATIONS[value] ?? 'inconnue'})`;

export const plural = (n: number, singular: string, pluralForm = `${singular}s`): string =>
  `${n} ${n > 1 ? pluralForm : singular}`;
