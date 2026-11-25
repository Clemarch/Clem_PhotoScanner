// Lance le « nouvel œil » en arrière-plan, une photo à la fois, dans son propre fil ; le fil est fermé à la fin
// (ou à l'annulation), ce qui rend sa mémoire à l'iPhone.

import type { EyeRequest, EyeResponse } from './eye.worker';

export interface EyeRun {
  cancel(): void;
}

/** Chargement raté (souvent « Out of memory » juste après l'analyse, 25/11) : nouvel essai dans un fil neuf, plus
 *  tard, quand l'iPhone a rendu la mémoire de l'analyse. Le moteur garde son échec dans un même fil : il faut un fil neuf. */
export const EYE_RETRY_DELAYS_MS = [20_000, 60_000];

export function runEyeInBackground(
  photos: readonly Omit<EyeRequest, 'base'>[],
  onResult: (response: EyeResponse) => void,
  /** `attempts` : nombre de fils lancés (1 si le moteur s'est chargé du premier coup). `firstError` : erreur d'un
   *  essai raté, même si un essai suivant a réussi (pour le rapport). */
  onDone: (error: string | null, attempts: number, firstError: string | null) => void,
  retryDelays: readonly number[] = EYE_RETRY_DELAYS_MS,
): EyeRun {
  let worker: Worker | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const base = new URL('./models/onnx/', document.baseURI).href;
  let next = 0;
  let failures = 0;
  let successes = 0;
  let attempt = 0;
  let started = 0;
  let firstError: string | null = null;
  // Échecs d'avant la première réussite : gardés de côté. Si le chargement a raté, l'essai suivant refait ces photos ;
  // sinon (photo illisible), ils sont transmis à la première réussite.
  let early: EyeResponse[] = [];
  const finish = (error: string | null) => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    worker?.terminate();
    worker = null;
    onDone(error, started, firstError);
  };
  const start = () => {
    timer = null;
    if (stopped) return;
    started++;
    try {
      worker = new Worker(new URL('./eye.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      queueMicrotask(() => finish(e instanceof Error ? e.message : String(e)));
      return;
    }
    const send = () => {
      if (stopped || !worker) return;
      if (next >= photos.length) {
        for (const r of early) onResult(r);
        early = [];
        return finish(null);
      }
      worker.postMessage({ ...photos[next++]!, base } satisfies EyeRequest);
    };
    // Rien n'a encore marché : nouvel essai plus tard dans un fil neuf, en reprenant à la première photo.
    const retryOrFinish = (error: string) => {
      worker?.terminate();
      worker = null;
      firstError ??= error;
      if (successes === 0 && attempt < retryDelays.length) {
        timer = setTimeout(start, retryDelays[attempt++]);
        next = 0;
        failures = 0;
        early = [];
        return;
      }
      finish(error);
    };
    worker.onmessage = (event: MessageEvent<EyeResponse>) => {
      if (stopped) return;
      if (event.data.ok) {
        successes++;
        for (const r of early) onResult(r);
        early = [];
        onResult(event.data);
      } else if (++failures >= 3 && failures === next) return retryOrFinish(event.data.error);
      else if (successes > 0) onResult(event.data);
      else early.push(event.data);
      send();
    };
    worker.onerror = (event) => retryOrFinish(event.message || 'fil du nouvel œil arrêté');
    send();
  };
  start();
  return { cancel: () => finish(null) };
}

/** Attente maximale de la mémoire des moteurs de l'analyse avant de lancer le nouvel œil. */
export const EYE_RELEASE_WAIT_MS = 45_000;

/**
 * Attend que Safari ait rendu la mémoire des moteurs de l'analyse (25/11, point 58). Fermer un moteur MediaPipe ne
 * rend pas sa mémoire : elle part au prochain passage du ramasse-miettes de la page (mesuré : 6 moteurs, ~330 Mo,
 * vivants jusque-là). Le fil du nouvel œil ne peut pas déclencher ce passage (chaque fil a le sien). Les moteurs sont
 * suivis par des références faibles : vides une fois la mémoire rendue.
 */
export async function waitForRelease(refs: readonly WeakRef<object>[], maxMs: number, stepMs = 500): Promise<{ freed: boolean; ms: number }> {
  const t0 = Date.now();
  const alive = () => refs.some((r) => r.deref() !== undefined);
  while (alive()) {
    if (Date.now() - t0 >= maxMs) return { freed: false, ms: Date.now() - t0 };
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return { freed: true, ms: Date.now() - t0 };
}
