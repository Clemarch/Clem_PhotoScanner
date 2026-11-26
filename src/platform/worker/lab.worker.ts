/// <reference lib="webworker" />
// Labo d'apprentissage (jalon 7) : les candidats apprennent et sont testés dans ce fil, pour que l'écran reste fluide
// (quelques secondes sur l'iPhone). Le fil est fermé à la fin.

import { labPairs, runLab, type ChoiceRecord, type LabResult, type PoseValidation } from '../../engine';

export interface LabRequest {
  validations: PoseValidation[];
  records: ChoiceRecord[];
  excluded: string[];
}

export type LabResponse = { ok: true; result: LabResult; ms: number } | { ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<LabRequest>) => {
  const t = performance.now();
  try {
    const { validations, records, excluded } = event.data;
    const result = runLab(labPairs(validations, records, new Set(excluded)));
    scope.postMessage({ ok: true, result, ms: performance.now() - t } satisfies LabResponse);
  } catch (e) {
    scope.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies LabResponse);
  }
};
