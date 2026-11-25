/// <reference lib="webworker" />
// « Nouvel œil » dans son propre fil (réglage 13 bis) : il tourne après l'analyse, pendant que l'utilisateur trie,
// et sa mémoire (206 Mo mesurés, plafond 1 Go) est rendue à l'iPhone dès qu'il a fini (le fil est fermé).

import type { Box, FaceEmotion } from '../../engine';
import { capSharedWasmMemory, createEye, type Eye } from './eye';

// Avant tout chargement du moteur : sa mémoire est plafonnée (voir `capSharedWasmMemory`).
capSharedWasmMemory();

export interface EyeRequest {
  id: string;
  /** Photo d'origine, ou son aperçu gardé (séance reprise : l'original n'est plus accessible). */
  file: Blob;
  /** Boîtes des visages principaux (proportions de l'image), dans l'ordre où l'app les attend. */
  boxes: Box[];
  /** Adresse complète du dossier des modèles. */
  base: string;
}

export type EyeResponse =
  | { id: string; ok: true; clip: number[] | null; emotions: (FaceEmotion | null)[]; ms: number }
  | { id: string; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let eye: Promise<Eye> | null = null;

scope.onmessage = async (event: MessageEvent<EyeRequest>) => {
  const { id, file, boxes, base } = event.data;
  try {
    eye ??= createEye(base);
    const model = await eye;
    const t = performance.now();
    // Même décodage que l'analyse (orientation de la photo comprise), en plus petit : les boîtes restent justes.
    // Jamais en pleine taille ici : ce fil porte déjà les modèles (~206 Mo). Si le décodage réduit échoue, la photo
    // est simplement sautée (elle n'aura pas les mesures du nouvel œil).
    const bitmap = await createImageBitmap(file, { resizeWidth: 1024, resizeQuality: 'medium' });
    try {
      const clip = await model.clip(bitmap);
      const emotions = boxes.length ? await model.emotions(bitmap, boxes) : [];
      scope.postMessage({ id, ok: true, clip, emotions, ms: performance.now() - t } satisfies EyeResponse);
    } finally {
      bitmap.close();
    }
  } catch (e) {
    scope.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies EyeResponse);
  }
};
