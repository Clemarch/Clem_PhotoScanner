// Adaptateur MediaPipe : repère les personnes et les objets courants (bouteille, téléphone, sac…).
// Modèle EfficientDet-Lite0 entraîné sur les 80 catégories COCO ; fichier de l'app, jamais téléchargé ailleurs.

import type { ObjectDetector as MpObjectDetector } from '@mediapipe/tasks-vision';
import { config, type DetectedObject } from '../../engine';

export interface ObjectDetector {
  detect(image: ImageBitmap): DetectedObject[];
  close(): void;
}

const local = (path: string): string => new URL(path, document.baseURI).href;

export async function createObjectDetector(): Promise<ObjectDetector> {
  const vision = await import('@mediapipe/tasks-vision');
  const detector: MpObjectDetector = await vision.ObjectDetector.createFromOptions(
    {
      wasmLoaderPath: local('models/wasm/vision_wasm_internal.js'),
      wasmBinaryPath: local('models/wasm/vision_wasm_internal.wasm'),
    },
    {
      baseOptions: { modelAssetPath: local('models/efficientdet_lite0.tflite'), delegate: 'CPU' },
      runningMode: 'IMAGE',
      scoreThreshold: config.content.minObjectScore,
      maxResults: 25,
    },
  );

  return {
    detect(image) {
      const { width, height } = image;
      return detector.detect(image).detections.flatMap((d) => {
        const box = d.boundingBox;
        const category = d.categories[0];
        if (!box || !category) return [];
        return [
          {
            label: category.categoryName,
            score: category.score,
            box: { x: box.originX / width, y: box.originY / height, width: box.width / width, height: box.height / height },
          },
        ];
      });
    },
    close() {
      detector.close();
    },
  };
}
