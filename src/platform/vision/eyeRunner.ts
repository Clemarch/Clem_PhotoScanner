// Lance le « nouvel œil » en arrière-plan, une photo à la fois, dans son propre fil ; le fil est fermé à la fin
// (ou à l'annulation), ce qui rend sa mémoire à l'iPhone.

import type { EyeRequest, EyeResponse } from './eye.worker';

export interface EyeRun {
  cancel(): void;
}

export function runEyeInBackground(
  photos: readonly Omit<EyeRequest, 'base'>[],
  onResult: (response: EyeResponse) => void,
  onDone: (error: string | null) => void,
): EyeRun {
  let worker: Worker | null = null;
  let stopped = false;
  const stop = (error: string | null) => {
    if (stopped) return;
    stopped = true;
    worker?.terminate();
    worker = null;
    onDone(error);
  };
  try {
    worker = new Worker(new URL('./eye.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    queueMicrotask(() => stop(e instanceof Error ? e.message : String(e)));
    return { cancel: () => stop(null) };
  }
  const base = new URL('./models/onnx/', document.baseURI).href;
  let next = 0;
  let failures = 0;
  const send = () => {
    if (stopped || !worker) return;
    if (next >= photos.length) return stop(null);
    worker.postMessage({ ...photos[next++]!, base } satisfies EyeRequest);
  };
  worker.onmessage = (event: MessageEvent<EyeResponse>) => {
    if (stopped) return;
    onResult(event.data);
    if (!event.data.ok && ++failures >= 3 && failures === next) return stop(event.data.error);
    send();
  };
  worker.onerror = (event) => stop(event.message || 'fil du nouvel œil arrêté');
  send();
  return { cancel: () => stop(null) };
}
