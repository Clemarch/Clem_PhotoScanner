// Adaptateurs MediaPipe pour trois modèles d'analyse, tous exécutés sur l'appareil, fichiers de l'app :
// - silhouette des personnes avec peau (Selfie Multiclass) ;
// - empreinte fine de l'image (MobileNet v3 small) ;
// - classement de la scène (EfficientNet-Lite0, catégories ImageNet).

import type { ImageClassifier, ImageEmbedder, ImageSegmenter } from '@mediapipe/tasks-vision';
import { config, type SceneLabel } from '../../engine';

const local = (path: string): string => new URL(path, document.baseURI).href;
const fileset = () => ({
  wasmLoaderPath: local('models/wasm/vision_wasm_internal.js'),
  wasmBinaryPath: local('models/wasm/vision_wasm_internal.wasm'),
});

export interface Segmenter {
  /** Masque de classes (une par pixel), à la taille de l'image donnée. */
  segment(image: ImageBitmap): { mask: Uint8Array; width: number; height: number } | null;
  close(): void;
}

export async function createSegmenter(): Promise<Segmenter> {
  const vision = await import('@mediapipe/tasks-vision');
  const segmenter: ImageSegmenter = await vision.ImageSegmenter.createFromOptions(fileset(), {
    baseOptions: { modelAssetPath: local('models/selfie_multiclass_256x256.tflite'), delegate: 'CPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });
  return {
    segment(image) {
      const result = segmenter.segment(image);
      try {
        const m = result.categoryMask;
        if (!m) return null;
        // Copie : le masque appartient au modèle et est libéré avec le résultat.
        return { mask: new Uint8Array(m.getAsUint8Array()), width: m.width, height: m.height };
      } finally {
        result.close();
      }
    },
    close() {
      segmenter.close();
    },
  };
}

export interface Embedder {
  embed(image: ImageBitmap): number[] | null;
  close(): void;
}

export async function createEmbedder(): Promise<Embedder> {
  const vision = await import('@mediapipe/tasks-vision');
  const embedder: ImageEmbedder = await vision.ImageEmbedder.createFromOptions(fileset(), {
    baseOptions: { modelAssetPath: local('models/mobilenet_v3_small.tflite'), delegate: 'CPU' },
    runningMode: 'IMAGE',
    l2Normalize: true,
    quantize: false,
  });
  return {
    embed(image) {
      const vector = embedder.embed(image).embeddings[0]?.floatEmbedding;
      return vector ? Array.from(vector) : null;
    },
    close() {
      embedder.close();
    },
  };
}

export interface Classifier {
  classify(image: ImageBitmap): SceneLabel[];
  close(): void;
}

export async function createClassifier(): Promise<Classifier> {
  const vision = await import('@mediapipe/tasks-vision');
  const classifier: ImageClassifier = await vision.ImageClassifier.createFromOptions(fileset(), {
    baseOptions: { modelAssetPath: local('models/efficientnet_lite0.tflite'), delegate: 'CPU' },
    runningMode: 'IMAGE',
    maxResults: config.classifier.maxLabels,
    scoreThreshold: config.classifier.minScore,
  });
  return {
    classify(image) {
      return (classifier.classify(image).classifications[0]?.categories ?? []).map((c) => ({
        index: c.index,
        name: c.categoryName || c.displayName,
        score: c.score,
      }));
    },
    close() {
      classifier.close();
    },
  };
}
