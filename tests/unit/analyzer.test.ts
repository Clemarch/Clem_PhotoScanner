import { describe, expect, it, vi } from 'vitest';
import { ANALYZE_STALL_MS, createAnalyzer } from '../../src/platform/worker/analyzer';

// Écran verrouillé pendant l'analyse (28/11) : le fil endormi ne répond plus ; la photo est relancée dans un fil neuf.
class FakeWorker {
  listeners: Record<string, ((e: unknown) => void)[]> = { message: [], error: [] };
  terminated = false;
  constructor(private readonly answers: boolean) {}
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners[type]!.push(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners[type] = this.listeners[type]!.filter((f) => f !== fn);
  }
  postMessage(msg: { id: string }) {
    if (!this.answers) return; // endormi : aucune réponse
    const result = { item: { id: msg.id }, diagnostic: { id: msg.id }, thumbnail: null, preview: null, frame: null };
    queueMicrotask(() => this.listeners.message!.forEach((f) => f({ data: { id: msg.id, ok: true, result } })));
  }
  terminate() {
    this.terminated = true;
  }
}

describe('analyse qui reprend après un verrouillage (28/11)', () => {
  it('sans réponse, la photo est relancée dans un fil neuf, qui répond', async () => {
    vi.useFakeTimers();
    const made: FakeWorker[] = [];
    const analyzer = createAnalyzer(() => {
      const w = new FakeWorker(made.length > 0);
      made.push(w);
      return w as unknown as Worker;
    });
    const pending = analyzer.analyze('m1', new Blob() as File);
    await vi.advanceTimersByTimeAsync(ANALYZE_STALL_MS + 10);
    const result = await pending;
    expect(result.item.id).toBe('m1');
    expect(made).toHaveLength(2);
    expect(made[0]!.terminated).toBe(true);
    vi.useRealTimers();
  });
});
