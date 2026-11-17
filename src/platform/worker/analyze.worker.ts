/// <reference lib="webworker" />
// Web Worker : un « ouvrier » qui analyse les photos en arrière-plan, pour que l'écran reste fluide.

import { analyzeFile } from '../image/analyze';
import type { AnalyzeRequest, AnalyzeResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
  const { id, file } = event.data;
  let response: AnalyzeResponse;
  try {
    response = { id, ok: true, result: await analyzeFile(id, file, 'worker') };
  } catch (e) {
    response = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  scope.postMessage(response);
};
