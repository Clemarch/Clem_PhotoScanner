import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runEyeInBackground } from '../../src/platform/vision/eyeRunner';
import type { EyeResponse } from '../../src/platform/vision/eye.worker';

// Fil factice : `loadOk` dit si le chargement du nouvel œil réussit pour le n-ième fil créé.
let plan: boolean[] = [];
let created = 0;
class FakeWorker {
  onmessage: ((e: MessageEvent<EyeResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  private readonly ok: boolean;
  constructor() {
    this.ok = plan[created++] ?? true;
  }
  postMessage(req: { id: string }) {
    queueMicrotask(() => {
      if (this.terminated) return;
      const data: EyeResponse = this.ok
        ? { id: req.id, ok: true, clip: [1], emotions: [], ms: 1 }
        : { id: req.id, ok: false, error: 'no available backend found. ERR: [wasm] RangeError: Out of memory' };
      this.onmessage?.({ data } as MessageEvent<EyeResponse>);
    });
  }
  terminate() {
    this.terminated = true;
  }
}

const photos = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, file: new Blob(), boxes: [] }));

beforeEach(() => {
  plan = [];
  created = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('document', { baseURI: 'https://exemple.test/app/' });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const run = (delays: number[]) =>
  new Promise<{ results: EyeResponse[]; error: string | null }>((resolve) => {
    const results: EyeResponse[] = [];
    runEyeInBackground(photos, (r) => results.push(r), (error) => resolve({ results, error }), delays);
  });

describe('nouvel œil : nouvel essai après un chargement raté (25/11, point 57)', () => {
  it('chargement raté puis réussi dans un fil neuf : toutes les photos mesurées, une seule fois', async () => {
    plan = [false, true];
    const done = run([1000]);
    await vi.runAllTimersAsync();
    const { results, error } = await done;
    expect(error).toBeNull();
    expect(created).toBe(2);
    expect(results.map((r) => r.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(results.every((r) => r.ok)).toBe(true);
  });
  it('toujours raté : s’arrête après les essais prévus, avec l’erreur', async () => {
    plan = [false, false, false];
    const done = run([1000, 2000]);
    await vi.runAllTimersAsync();
    const { results, error } = await done;
    expect(created).toBe(3);
    expect(results).toHaveLength(0);
    expect(error).toMatch(/Out of memory/);
  });
});
