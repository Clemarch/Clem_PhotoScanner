// « Nouvel œil » (jalon 6, réglage 13), en coulisse : deux modèles embarqués, exécutés par onnxruntime-web
// (WebAssembly, un seul fil, aucun appel réseau : les fichiers sont servis par l'app elle-même).
// - SigLIP 2 base (Google, licence Apache-2.0), partie image, quantifiée en 8 bits : une empreinte de 768 nombres qui
//   décrit le contenu de la photo (attitude, ambiance, cadrage). Plus fin que CLIP ViT-B/32 (utilisé au réglage 13) ;
//   plus lent, ce qui ne gêne plus depuis qu'il tourne en arrière-plan (24/11, utilisateur : « mes modèles doivent être
//   performants »). Le champ s'appelle toujours `clip` (empreinte de type CLIP).
// - HSEmotion EfficientNet-B0 (licence Apache-2.0) sur chaque visage principal : 8 émotions, valence (positif /
//   négatif) et éveil.
// Rien de tout cela ne décide encore : les mesures servent à comparer honnêtement, sur les poses validées, ce nouvel
// œil à la formule actuelle (`src/engine/learning/ranker.ts`).

import type { Box, FaceEmotion } from '../../engine';
import { readModel } from '../storage/models';

type Ort = typeof import('onnxruntime-web/wasm');
type Session = import('onnxruntime-web/wasm').InferenceSession;

/** SigLIP 2 : image ramenée à 224 × 224 (sans recadrage), valeurs entre -1 et 1. */
const CLIP_SIZE = 224;
const CLIP_MEAN = [0.5, 0.5, 0.5];
const CLIP_STD = [0.5, 0.5, 0.5];
const FACE_SIZE = 224;
const FACE_MEAN = [0.485, 0.456, 0.406];
const FACE_STD = [0.229, 0.224, 0.225];
/** Marge autour de la boîte du visage (le modèle a appris sur des visages un peu plus larges que les points). */
const FACE_MARGIN = 0.12;
/** Au plus N visages par photo (les plus grands), pour garder l'analyse rapide. */
const MAX_FACES = 4;

export interface Eye {
  /** Empreinte d'image normalisée (SigLIP 2, 768 nombres), ou null si le calcul échoue. */
  clip(bitmap: ImageBitmap): Promise<number[] | null>;
  /** Émotions de chaque visage (boîtes en proportions de l'image), dans le même ordre ; null si non calculées. */
  emotions(bitmap: ImageBitmap, boxes: readonly Box[]): Promise<(FaceEmotion | null)[]>;
  close(): void;
}

/** Image (ou une partie, en proportions) ramenée à size × size, normalisée, au format attendu par les modèles. */
function tensorData(bitmap: ImageBitmap, size: number, mean: number[], std: number[], crop?: Box): Float32Array {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (crop) {
    const sx = crop.x * bitmap.width;
    const sy = crop.y * bitmap.height;
    ctx.drawImage(bitmap, sx, sy, crop.width * bitmap.width, crop.height * bitmap.height, 0, 0, size, size);
  } else {
    // Image entière ramenée au carré (comme le préparateur d'images de SigLIP).
    ctx.drawImage(bitmap, 0, 0, size, size);
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

/** Charge les deux modèles. Lève une erreur si le moteur ou un modèle manque (l'analyse continue alors sans).
 *  `base` : adresse complète du dossier des modèles (dans un fil séparé, une adresse relative ne part pas du même
 *  endroit que dans la page). */
export async function createEye(base = new URL('./models/onnx/', document.baseURI).href): Promise<Eye> {
  const ort: Ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' as const };
  // Modèles lus dans le stockage de l'app (téléchargés et vérifiés à l'ouverture, `src/platform/storage/models.ts`).
  const load = async (file: string): Promise<Session> => {
    const bytes = await readModel(base, file);
    if (!bytes) throw new Error(`modèle ${file} pas encore téléchargé`);
    return ort.InferenceSession.create(bytes, options);
  };
  const clipSession: Session = await load('siglip2_base_int8.onnx');
  let faceSession: Session;
  try {
    faceSession = await load('hsemotion_b0_va.onnx');
  } catch (e) {
    // Mémoire iOS : le premier modèle (95 Mo) n'est pas laissé chargé si le second manque.
    void clipSession.release();
    throw e;
  }

  return {
    async clip(bitmap) {
      try {
        const input = new ort.Tensor('float32', tensorData(bitmap, CLIP_SIZE, CLIP_MEAN, CLIP_STD), [1, 3, CLIP_SIZE, CLIP_SIZE]);
        const result = await clipSession.run({ [clipSession.inputNames[0]!]: input });
        // SigLIP : sortie « pooler_output » (résumé de l'image) ; sinon la première sortie.
        const name = clipSession.outputNames.includes('pooler_output') ? 'pooler_output' : clipSession.outputNames[0]!;
        const data = result[name]!.data as Float32Array;
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
