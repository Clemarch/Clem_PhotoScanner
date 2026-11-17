import type { MediaFormat, MediaKind } from './types';

const RAW_EXTENSIONS = new Set(['cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw', 'raw']);
const VIDEO_EXTENSIONS = new Set(['mov', 'mp4', 'm4v', 'avi', 'hevc']);

export interface FormatInfo {
  format: MediaFormat;
  kind: MediaKind;
  isRaw: boolean;
}

/** Reconnaît le type d'un fichier d'après son nom et son type déclaré. */
export function detectFormat(fileName: string, mimeType: string): FormatInfo {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  const mime = mimeType.toLowerCase();

  if (ext === 'dng' || mime.includes('dng')) return { format: 'DNG', kind: 'photo', isRaw: true };
  if (RAW_EXTENSIONS.has(ext) || mime.includes('raw')) return { format: 'RAW', kind: 'photo', isRaw: true };
  if (VIDEO_EXTENSIONS.has(ext) || mime.startsWith('video/')) return { format: 'VIDEO', kind: 'video', isRaw: false };
  if (ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif'))
    return { format: 'HEIC', kind: 'photo', isRaw: false };
  if (ext === 'jpg' || ext === 'jpeg' || mime === 'image/jpeg') return { format: 'JPEG', kind: 'photo', isRaw: false };
  if (ext === 'png' || mime === 'image/png') return { format: 'PNG', kind: 'photo', isRaw: false };
  return { format: 'AUTRE', kind: 'photo', isRaw: false };
}
