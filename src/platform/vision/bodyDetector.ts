// Adaptateur MediaPipe : points du corps (épaules, coudes, poignets, genoux, chevilles…), sur l'appareil.
// Modèle Pose Landmarker « lite » ; fichier de l'app, jamais téléchargé ailleurs.

import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { BodyPoint } from '../../engine';

export interface BodyDetector {
  detect(image: ImageBitmap): BodyPoint[][];
  close(): void;
}

const local = (path: string): string => new URL(path, document.baseURI).href;

export async function createBodyDetector(): Promise<BodyDetector> {
  const vision = await import('@mediapipe/tasks-vision');
  const landmarker: PoseLandmarker = await vision.PoseLandmarker.createFromOptions(
    {
      wasmLoaderPath: local('models/wasm/vision_wasm_internal.js'),
      wasmBinaryPath: local('models/wasm/vision_wasm_internal.wasm'),
    },
    {
      baseOptions: { modelAssetPath: local('models/pose_landmarker_lite.task'), delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 4,
    },
  );
  return {
    detect(image) {
      return landmarker.detect(image).landmarks.map((points) =>
        points.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })),
      );
    },
    close() {
      landmarker.close();
    },
  };
}
