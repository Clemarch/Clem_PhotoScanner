import { analyzeFile } from '../image/analyze';
import type { AnalyzeResult } from '../image/types';
import type { AnalyzeRequest, AnalyzeResponse } from './protocol';

export interface Analyzer {
  analyze(id: string, file: File): Promise<AnalyzeResult>;
  dispose(): void;
}

/**
 * Analyse une photo à la fois dans un Web Worker.
 * Si le Worker est indisponible ou échoue à décoder, on réessaie dans la page.
 */
export function createAnalyzer(): Analyzer {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }

  const viaWorker = (id: string, file: File): Promise<AnalyzeResult> =>
    new Promise((resolve, reject) => {
      const w = worker!;
      const cleanup = () => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
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
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage({ id, file } satisfies AnalyzeRequest);
    });

  return {
    async analyze(id, file) {
      if (worker) {
        try {
          const result = await viaWorker(id, file);
          if (!result.diagnostic.error) return result;
        } catch {
          // Le Worker ne fonctionne pas sur cet appareil : on ne l'utilise plus.
          worker.terminate();
          worker = null;
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
