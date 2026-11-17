// Adaptateur MediaPipe : cherche les visages dans une image, entièrement sur l'appareil.
// Le modèle et son moteur de calcul sont des fichiers de l'app (dossier models/), jamais téléchargés ailleurs.

import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { boxFromPoints, config, type FaceObservation } from '../../engine';

export interface FaceDetector {
  detect(image: ImageBitmap): FaceObservation[];
  close(): void;
}

const local = (path: string): string => new URL(path, document.baseURI).href;

export async function createFaceDetector(): Promise<FaceDetector> {
  // Chargé seulement au moment de l'analyse, pour que l'app s'ouvre vite.
  const vision = await import('@mediapipe/tasks-vision');
  const landmarker: FaceLandmarker = await vision.FaceLandmarker.createFromOptions(
    {
      wasmLoaderPath: local('models/wasm/vision_wasm_internal.js'),
      wasmBinaryPath: local('models/wasm/vision_wasm_internal.wasm'),
    },
    {
      // Calcul sur le processeur : plus lent que la puce graphique, mais le plus fiable sur Safari.
      baseOptions: { modelAssetPath: local('models/face_landmarker.task'), delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: config.faces.maxFaces,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    },
  );

  return {
    detect(image) {
      const result = landmarker.detect(image);
      return result.faceLandmarks.map((points, i) => {
        const blendshapes: Record<string, number> = {};
        for (const category of result.faceBlendshapes?.[i]?.categories ?? [])
          blendshapes[category.categoryName] = category.score;
        const matrix = result.facialTransformationMatrixes?.[i]?.data;
        return { box: boxFromPoints(points), blendshapes, matrix: matrix ? Array.from(matrix) : null };
      });
    },
    close() {
      landmarker.close();
    },
  };
}
