// Lecture d'une photo : métadonnées, décodage réduit, netteté, miniature.
// Fonctionne aussi bien dans un Web Worker que dans la page.

import exifr from 'exifr';
import { config, detectFormat, imageSignature, measureColor, measureExposure, measureObstruction, measureTilt, rgbaToGray, sharpnessFromGray, type MediaItem } from '../../engine';
import type { AnalysisFrame, AnalyzeResult, FileDiagnostic } from './types';

interface ExifData {
  capturedAt: number | null;
  orientation: number | null;
  width: number | null;
  height: number | null;
  focal35: number | null;
  /** Marque de l'appareil ou focale présente : photo prise par un appareil photo. */
  camera: boolean | null;
  found: boolean;
}

const EXIF_TAGS = [
  'DateTimeOriginal',
  'CreateDate',
  'SubSecTimeOriginal',
  'Orientation',
  'ExifImageWidth',
  'ExifImageHeight',
  'ImageWidth',
  'ImageHeight',
  'FocalLengthIn35mmFormat',
  'FocalLength',
  'Make',
  'Model',
  'UserComment',
];

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** iOS écrit « Screenshot » dans le commentaire des captures d'écran. */
function isScreenshotComment(value: unknown): boolean {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (value instanceof Uint8Array) text = String.fromCharCode(...value.slice(0, 64));
  return /screenshot/i.test(text);
}

async function readExif(file: Blob): Promise<ExifData> {
  const empty: ExifData = { capturedAt: null, orientation: null, width: null, height: null, focal35: null, camera: false, found: false };
  try {
    const tags = (await exifr.parse(file, { pick: EXIF_TAGS, translateValues: false })) as
      | Record<string, unknown>
      | undefined;
    if (!tags) return empty;
    const date = tags.DateTimeOriginal ?? tags.CreateDate;
    let capturedAt: number | null = null;
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      capturedAt = date.getTime();
      // Fractions de seconde : indispensables pour ordonner une rafale.
      const subSec = String(tags.SubSecTimeOriginal ?? '').trim();
      if (/^\d+$/.test(subSec)) capturedAt += Math.round(Number(`0.${subSec}`) * 1000);
    }
    return {
      capturedAt,
      orientation: asNumber(tags.Orientation),
      width: asNumber(tags.ExifImageWidth) ?? asNumber(tags.ImageWidth),
      height: asNumber(tags.ExifImageHeight) ?? asNumber(tags.ImageHeight),
      focal35: asNumber(tags.FocalLengthIn35mmFormat) || null,
      camera:
        !isScreenshotComment(tags.UserComment) &&
        ((typeof tags.Make === 'string' && tags.Make.trim() !== '') ||
        (typeof tags.Model === 'string' && tags.Model.trim() !== '') ||
        asNumber(tags.FocalLength) !== null ||
        asNumber(tags.FocalLengthIn35mmFormat) !== null),
      found: true,
    };
  } catch {
    // Métadonnées illisibles : on ne présume pas que ce soit une capture d'écran.
    return { ...empty, camera: null };
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: AnyContext } {
  let canvas: AnyCanvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
  else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  } else throw new Error('Aucun canvas disponible');
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as AnyContext | null;
  if (!ctx) throw new Error('Contexte 2D indisponible');
  return { canvas, ctx };
}

function releaseCanvas(canvas: AnyCanvas): void {
  // Sur iOS, remettre la taille à zéro libère tout de suite la mémoire du canvas.
  canvas.width = 0;
  canvas.height = 0;
}

async function canvasToJpeg(canvas: AnyCanvas, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

interface Decoded {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  method: string;
  release: () => void;
}

/** Décode une photo en essayant la méthode la plus économe en mémoire d'abord. */
async function decode(file: Blob, maxSide: number): Promise<Decoded> {
  const errors: string[] = [];
  const fromBitmap = (bitmap: ImageBitmap, method: string): Decoded => ({
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    method,
    release: () => bitmap.close(),
  });

  if (typeof createImageBitmap === 'function') {
    try {
      return fromBitmap(
        await createImageBitmap(file, { resizeWidth: maxSide, resizeQuality: 'medium' }),
        'bitmap réduit',
      );
    } catch (e) {
      errors.push(`bitmap réduit : ${String(e)}`);
    }
    try {
      return fromBitmap(await createImageBitmap(file), 'bitmap pleine taille');
    } catch (e) {
      errors.push(`bitmap pleine taille : ${String(e)}`);
    }
  }

  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        method: 'balise image',
        release: () => {
          URL.revokeObjectURL(url);
          img.src = '';
        },
      };
    } catch (e) {
      URL.revokeObjectURL(url);
      errors.push(`balise image : ${String(e)}`);
    }
  }
  throw new Error(errors.join(' | ') || 'Décodage impossible');
}

function fit(width: number, height: number, maxSide: number): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export async function analyzeFile(
  id: string,
  file: File,
  thread: FileDiagnostic['thread'],
): Promise<AnalyzeResult> {
  const info = detectFormat(file.name, file.type);

  const t0 = performance.now();
  const exif = await readExif(file);
  const exifMs = performance.now() - t0;

  const fileModifiedAt = Number.isFinite(file.lastModified) && file.lastModified > 0 ? file.lastModified : null;

  const item: MediaItem = {
    id,
    kind: info.kind,
    fileName: file.name,
    format: info.format,
    isRaw: info.isRaw,
    sizeBytes: file.size,
    // Seule la date des métadonnées est fiable. La date du fichier n'est jamais utilisée pour grouper.
    capturedAt: exif.capturedAt,
    dateSource: exif.capturedAt !== null ? 'exif' : 'absente',
    width: exif.width,
    height: exif.height,
    orientation: exif.orientation,
    focal35: exif.focal35,
    sharpness: null,
    faces: null,
    objects: null,
    tiltDeg: null,
    tiltStrength: null,
    exposure: null,
    color: null,
    signature: null,
    segmentation: null,
    embedding: null,
    labels: null,
    obstruction: null,
    // Une capture d'écran ou une image enregistrée n'a ni marque d'appareil ni focale.
    camera: info.kind === 'photo' && !info.isRaw ? exif.camera : null,
    hands: null,
  };

  const diagnostic: FileDiagnostic = {
    id,
    mimeType: file.type || '(vide)',
    fileModifiedAt,
    exifFound: exif.found,
    exifMs,
    decodeMs: null,
    analysisMs: null,
    decodeMethod: null,
    analyzedWidth: null,
    analyzedHeight: null,
    estimatedDecodedMB: exif.width && exif.height ? (exif.width * exif.height * 4) / 1_048_576 : null,
    thread,
    error: null,
    faceMs: null,
    faceCount: null,
    faceRetry: 0,
    objectMs: null,
    modelsMs: null,
  };

  // RAW et vidéos : repérés, mis de côté, jamais décodés.
  if (info.isRaw || info.kind !== 'photo') return { item, thumbnail: null, preview: null, diagnostic, frame: null };

  let thumbnail: Blob | null = null;
  let preview: Blob | null = null;
  let frame: AnalysisFrame | null = null;
  try {
    const t1 = performance.now();
    const decoded = await decode(file, config.image.analysisMaxSide);
    try {
      const size = fit(decoded.width, decoded.height, config.image.analysisMaxSide);
      const work = makeCanvas(size.w, size.h);
      work.ctx.drawImage(decoded.source, 0, 0, size.w, size.h);
      const pixels = work.ctx.getImageData(0, 0, size.w, size.h);
      diagnostic.decodeMs = performance.now() - t1;
      diagnostic.decodeMethod = decoded.method;
      diagnostic.analyzedWidth = size.w;
      diagnostic.analyzedHeight = size.h;

      const t2 = performance.now();
      const gray = rgbaToGray(pixels.data, size.w, size.h);
      item.sharpness = sharpnessFromGray(
        gray,
        size.w,
        size.h,
        config.sharpness.gridSize,
        config.sharpness.topFraction,
      );
      const tilt = measureTilt(gray, size.w, size.h);
      item.tiltDeg = tilt.degrees;
      item.tiltStrength = tilt.strength;
      item.exposure = measureExposure(gray);
      item.color = measureColor(pixels.data, size.w, size.h);
      item.signature = imageSignature(pixels.data, size.w, size.h);
      item.obstruction = measureObstruction(gray, size.w, size.h);
      diagnostic.analysisMs = performance.now() - t2;

      // Deux images légères : une vignette pour la grille, une image moyenne pour la visionneuse.
      const encode = async (maxSide: number, quality: number) => {
        const target = fit(size.w, size.h, maxSide);
        const c = makeCanvas(target.w, target.h);
        c.ctx.drawImage(work.canvas, 0, 0, target.w, target.h);
        const blob = await canvasToJpeg(c.canvas, quality);
        releaseCanvas(c.canvas);
        return blob;
      };
      thumbnail = await encode(config.image.thumbnailMaxSide, config.image.thumbnailQuality);
      preview = await encode(config.image.previewMaxSide, config.image.previewQuality);

      // L'image réduite part vers la recherche de visages, puis sera libérée.
      const bitmap =
        'transferToImageBitmap' in work.canvas ? work.canvas.transferToImageBitmap() : await createImageBitmap(work.canvas);
      frame = { bitmap, gray, rgba: pixels.data, width: size.w, height: size.h };
      releaseCanvas(work.canvas);
    } finally {
      decoded.release();
    }
  } catch (e) {
    diagnostic.error = e instanceof Error ? e.message : String(e);
  }

  return { item, thumbnail, preview, diagnostic, frame };
}
