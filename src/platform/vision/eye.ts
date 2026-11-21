// « Nouvel œil » (jalon 6, réglage 13), en coulisse : deux modèles embarqués, exécutés par onnxruntime-web
// (WebAssembly, un seul fil, aucun appel réseau : les fichiers sont servis par l'app elle-même).
// - CLIP ViT-B/32 (OpenAI, licence MIT), partie image, quantifiée en 8 bits : une empreinte de 512 nombres qui décrit
//   le contenu de la photo (attitude, ambiance, cadrage).
// - HSEmotion EfficientNet-B0 (licence Apache-2.0) sur chaque visage principal : 8 émotions, valence (positif /
//   négatif) et éveil.
// Rien de tout cela ne décide encore : les mesures servent à comparer honnêtement, sur les poses validées, ce nouvel
// œil à la formule actuelle (`src/engine/learning/ranker.ts`).

import type { Box, FaceEmotion } from '../../engine';

type Ort = typeof import('onnxruntime-web/wasm');
type Session = import('onnxruntime-web/wasm').InferenceSession;

const BASE = './models/onnx/';
const CLIP_SIZE = 224;
const CLIP_MEAN = [0.4815, 0.4578, 0.4082];
const CLIP_STD = [0.2686, 0.2613, 0.2758];
const FACE_SIZE = 224;
const FACE_MEAN = [0.485, 0.456, 0.406];
const FACE_STD = [0.229, 0.224, 0.225];
/** Marge autour de la boîte du visage (le modèle a appris sur des visages un peu plus larges que les points). */
const FACE_MARGIN = 0.12;
/** Au plus N visages par photo (les plus grands), pour garder l'analyse rapide. */
const MAX_FACES = 4;

export interface Eye {
  /** Empreinte CLIP normalisée (512 nombres), ou null si le calcul échoue. */
  clip(bitmap: ImageBitmap): Promise<number[] | null>;
  /** Émotions de chaque visage (boîtes en proportions de l'image), dans le même ordre ; null si non calculées. */
  emotions(bitmap: ImageBitmap, boxes: readonly Box[]): Promise<(FaceEmotion | null)[]>;
  close(): void;
}

/** Image (ou une partie, en proportions) ramenée à size × size, normalisée, au format attendu par les modèles. */
function tensorData(bitmap: ImageBitmap, size: number, mean: number[], std: number[], crop?: Box, cover = false): Float32Array {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (crop) {
    const sx = crop.x * bitmap.width;
    const sy = crop.y * bitmap.height;
    ctx.drawImage(bitmap, sx, sy, crop.width * bitmap.width, crop.height * bitmap.height, 0, 0, size, size);
  } else if (cover) {
    // CLIP : petit côté à la taille voulue, puis recadrage au centre.
    const k = size / Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (size - bitmap.width * k) / 2, (size - bitmap.height * k) / 2, bitmap.width * k, bitmap.height * k);
  }
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++)
    for (let c = 0; c < 3; c++) out[c * plane + i] = (pixels[i * 4 + c]! / 255 - mean[c]!) / std[c]!;
  // Mémoire iOS : le canevas est vidé tout de suite.
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

const softmax = (x: readonly number[]): number[] => {
  const m = Math.max(...x);
  const e = x.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};

/** Charge les deux modèles. Lève une erreur si le moteur ou un modèle manque (l'analyse continue alors sans). */
export async function createEye(): Promise<Eye> {
  const ort: Ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' as const };
  const clipSession: Session = await ort.InferenceSession.create(`${BASE}clip_vit_b32_int8.onnx`, options);
  let faceSession: Session;
  try {
    faceSession = await ort.InferenceSession.create(`${BASE}hsemotion_b0_va.onnx`, options);
  } catch (e) {
    // Mémoire iOS : le premier modèle (89 Mo) n'est pas laissé chargé si le second manque.
    void clipSession.release();
    throw e;
  }

  return {
    async clip(bitmap) {
      try {
        const input = new ort.Tensor('float32', tensorData(bitmap, CLIP_SIZE, CLIP_MEAN, CLIP_STD, undefined, true), [1, 3, CLIP_SIZE, CLIP_SIZE]);
        const result = await clipSession.run({ [clipSession.inputNames[0]!]: input });
        const data = result[clipSession.outputNames[0]!]!.data as Float32Array;
        const norm = Math.hypot(...data) || 1;
        return Array.from(data, (v) => v / norm);
      } catch {
        return null;
      }
    },
    async emotions(bitmap, boxes) {
      const order = boxes
        .map((b, i) => ({ i, area: b.width * b.height }))
        .sort((a, b) => b.area - a.area)
        .slice(0, MAX_FACES)
        .map((x) => x.i);
      const out: (FaceEmotion | null)[] = boxes.map(() => null);
      for (const i of order) {
        const b = boxes[i]!;
        // Carré (sinon le visage serait déformé), décalé pour rester dans l'image, y compris à droite et en bas.
        const side = Math.min(Math.max(b.width * bitmap.width, b.height * bitmap.height) * (1 + 2 * FACE_MARGIN), bitmap.width, bitmap.height);
        const cx = (b.x + b.width / 2) * bitmap.width;
        const cy = (b.y + b.height / 2) * bitmap.height;
        const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
        const crop: Box = {
          x: clamp(cx - side / 2, bitmap.width - side) / bitmap.width,
          y: clamp(cy - side / 2, bitmap.height - side) / bitmap.height,
          width: side / bitmap.width,
          height: side / bitmap.height,
        };
        try {
          const input = new ort.Tensor('float32', tensorData(bitmap, FACE_SIZE, FACE_MEAN, FACE_STD, crop), [1, 3, FACE_SIZE, FACE_SIZE]);
          const result = await faceSession.run({ [faceSession.inputNames[0]!]: input });
          const scores = Array.from(result[faceSession.outputNames[0]!]!.data as Float32Array);
          // Sorties : 8 émotions (Colère, Mépris, Dégoût, Peur, Joie, Neutre, Tristesse, Surprise), valence, éveil.
          out[i] = { probs: softmax(scores.slice(0, 8)), valence: scores[8] ?? 0, arousal: scores[9] ?? 0 };
        } catch {
          out[i] = null;
        }
      }
      return out;
    },
    close() {
      void clipSession.release();
      void faceSession.release();
    },
  };
}
