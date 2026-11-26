// Lance le labo d'apprentissage dans son propre fil ; si les fils manquent, le calcul se fait dans la page (chargé
// seulement alors : l'écran principal n'embarque pas le vocabulaire du nouvel œil).

import type { ChoiceRecord, LabResult, PoseValidation } from '../../engine';
import type { LabRequest, LabResponse } from './lab.worker';

export function runLabInBackground(validations: PoseValidation[], records: ChoiceRecord[], excluded: ReadonlySet<string>): Promise<LabResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      import('../../engine/learning/lab')
        .then(({ labPairs, runLab }) => resolve(runLab(labPairs(validations, records, excluded))))
        .catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      return;
    }
    worker.onmessage = (event: MessageEvent<LabResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'fil du labo arrêté'));
    };
    worker.postMessage({ validations, records, excluded: [...excluded] } satisfies LabRequest);
  });
}
