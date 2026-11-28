import { analyzeFile } from '../image/analyze';
import type { AnalyzeResult } from '../image/types';
import type { AnalyzeRequest, AnalyzeResponse } from './protocol';

export interface Analyzer {
  analyze(id: string, file: File): Promise<AnalyzeResult>;
  dispose(): void;
}

/** Une photo prend 1 à 3 s ; au-delà, le fil est bloqué (iOS l'a endormi). */
export const ANALYZE_STALL_MS = 45_000;

class Stalled extends Error {}

/**
 * Analyse une photo à la fois dans un Web Worker.
 * Si le Worker est indisponible ou échoue à décoder, on réessaie dans la page.
 *
 * Écran verrouillé pendant l'analyse (28/11, mode économie d'énergie) : iOS endort la page et son fil ; la réponse
 * attendue n'arrive jamais et l'analyse restait figée au déverrouillage. Désormais, une photo en cours quand la page
 * revient au premier plan (ou sans réponse après `ANALYZE_STALL_MS`) est relancée dans un fil neuf.
 * `makeWorker` : pour les tests.
 */
export function createAnalyzer(makeWorker: () => Worker = () => new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' })): Analyzer {
  let worker: Worker | null = null;
  const spawn = () => {
    try {
      worker = makeWorker();
    } catch {
      worker = null;
    }
  };
  spawn();

  const viaWorker = (id: string, file: File): Promise<AnalyzeResult> =>
    new Promise((resolve, reject) => {
      const w = worker!;
      let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const cleanup = () => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        clearTimeout(timer);
      };
      const onMessage = (event: MessageEvent<AnalyzeResponse>) => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || 'Erreur du Worker'));
      };
      // Retour au premier plan après un passage en arrière-plan (écran verrouillé) : on n'attend plus ce fil.
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') hidden = true;
        else if (hidden) {
          cleanup();
          reject(new Stalled('reprise après verrouillage'));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Stalled('sans réponse'));
      }, ANALYZE_STALL_MS);
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      w.postMessage({ id, file } satisfies AnalyzeRequest);
    });

  return {
    async analyze(id, file) {
      // Deux essais dans un fil (le second dans un fil neuf si le premier a été endormi), puis dans la page.
      for (let attempt = 0; attempt < 2 && worker; attempt++) {
        try {
          const result = await viaWorker(id, file);
          if (!result.diagnostic.error) return result;
          break;
        } catch (e) {
          worker?.terminate();
          worker = null;
          if (e instanceof Stalled) spawn();
          // Autre erreur : le Worker ne fonctionne pas sur cet appareil ; on ne l'utilise plus.
          else break;
        }
      }
      return analyzeFile(id, file, 'principal');
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}
