import { useEffect, useRef, useState } from 'react';
import {
  clearProgress,
  keepScreenAwake,
  markProgress,
  readDeviceReport,
  readInterruptedRun,
  readJsHeapMB,
  type InterruptedRun,
} from '../platform/device';
import type { AnalyzeResult } from '../platform/image/types';
import { measureFace } from '../engine';
import { createFaceDetector, type FaceDetector } from '../platform/vision/faceDetector';
import { createAnalyzer } from '../platform/worker/analyzer';
import type { Session } from './session';
import { Accueil } from './screens/Accueil';
import { Analyse } from './screens/Analyse';
import { Diagnostic } from './screens/Diagnostic';
import { Paquets } from './screens/Paquets';

type Tab = 'paquets' | 'diagnostic';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>('paquets');
  const [interrupted, setInterrupted] = useState<InterruptedRun | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    setInterrupted(readInterruptedRun());
    clearProgress();
  }, []);

  const start = async (files: File[]) => {
    session?.thumbnails.forEach((url) => URL.revokeObjectURL(url));
    setSession(null);
    setInterrupted(null);
    cancelRef.current = false;
    setProgress({ done: 0, total: files.length, name: '' });

    const heapBeforeMB = readJsHeapMB();
    const wake = await keepScreenAwake();
    const analyzer = createAnalyzer();
    let detector: FaceDetector | null = null;
    let faceError: string | null = null;
    try {
      detector = await createFaceDetector();
    } catch (e) {
      faceError = e instanceof Error ? e.message : String(e);
    }
    const results: AnalyzeResult[] = [];
    const thumbnails = new Map<string, string>();
    const startedAt = performance.now();

    for (let i = 0; i < files.length && !cancelRef.current; i++) {
      const file = files[i]!;
      setProgress({ done: i, total: files.length, name: file.name });
      markProgress(i + 1, files.length);
      const result = await analyzer.analyze(`m${i + 1}`, file);
      const frame = result.frame;
      result.frame = null;
      if (frame) {
        if (detector) {
          try {
            const t = performance.now();
            const observations = detector.detect(frame.bitmap);
            result.item.faces = observations.map((o) => measureFace(o, frame.gray, frame.width, frame.height));
            result.diagnostic.faceMs = performance.now() - t;
            result.diagnostic.faceCount = observations.length;
          } catch (e) {
            faceError ??= e instanceof Error ? e.message : String(e);
          }
        }
        frame.bitmap.close();
      }
      results.push(result);
      if (result.thumbnail) thumbnails.set(result.item.id, URL.createObjectURL(result.thumbnail));
    }

    analyzer.dispose();
    detector?.close();
    wake.release();
    clearProgress();
    const device = await readDeviceReport();
    setSession({
      results,
      thumbnails,
      totalMs: performance.now() - startedAt,
      cancelled: cancelRef.current,
      wakeLock: wake.active,
      heapBeforeMB,
      heapAfterMB: readJsHeapMB(),
      device,
      faceError,
    });
    setProgress(null);
    setTab('paquets');
  };

  if (progress) {
    return (
      <Analyse
        done={progress.done}
        total={progress.total}
        currentName={progress.name}
        onCancel={() => {
          cancelRef.current = true;
        }}
      />
    );
  }

  if (!session) return <Accueil onFiles={start} interrupted={interrupted} />;

  return (
    <>
      {tab === 'paquets' ? <Paquets session={session} /> : <Diagnostic session={session} />}
      <nav className="onglets">
        <button className={tab === 'paquets' ? 'actif' : ''} onClick={() => setTab('paquets')}>
          Paquets
        </button>
        <button className={tab === 'diagnostic' ? 'actif' : ''} onClick={() => setTab('diagnostic')}>
          Diagnostic
        </button>
        <label className="nouveau">
          Nouvelle journée
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) void start(files);
            }}
          />
        </label>
      </nav>
    </>
  );
}
