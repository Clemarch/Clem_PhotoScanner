import { useEffect, useMemo, useRef, useState } from 'react';
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
import { analyzeDay, config, learnWeights, measureFace, photoKey, sortChronologically, type ChoiceRecord } from '../engine';
import { clearChoices, loadChoices, removeChoice, saveChoice } from '../platform/storage/choices';
import { makeRecord, type Choices } from './choices';
import { createFaceDetector, type FaceDetector } from '../platform/vision/faceDetector';
import { createObjectDetector, type ObjectDetector } from '../platform/vision/objectDetector';
import { findFaces } from '../platform/vision/retry';
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
  const [gap, setGap] = useState<number>(config.grouping.packGapSeconds);
  const [records, setRecords] = useState<ChoiceRecord[]>([]);

  useEffect(() => {
    setInterrupted(readInterruptedRun());
    clearProgress();
    void loadChoices().then(setRecords);
  }, []);

  // Choix de l'utilisateur, et goûts appris à partir de tous ses choix enregistrés sur l'appareil.
  const choices = useMemo<Choices>(() => ({ byKey: new Map(records.map((r) => [r.key, r])) }), [records]);
  const learned = useMemo(() => learnWeights(records), [records]);
  const items = useMemo(() => session?.results.map((r) => r.item) ?? [], [session]);
  const day = useMemo(() => analyzeDay(items, gap, learned), [items, gap, learned]);

  const start = async (files: File[]) => {
    session?.thumbnails.forEach((url) => URL.revokeObjectURL(url));
    session?.previews.forEach((url) => URL.revokeObjectURL(url));
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
    let objectDetector: ObjectDetector | null = null;
    try {
      objectDetector = await createObjectDetector();
    } catch (e) {
      faceError ??= `objets : ${e instanceof Error ? e.message : String(e)}`;
    }
    const results: AnalyzeResult[] = [];
    const thumbnails = new Map<string, string>();
    const previews = new Map<string, string>();
    const startedAt = performance.now();

    for (let i = 0; i < files.length && !cancelRef.current; i++) {
      const file = files[i]!;
      setProgress({ done: i, total: files.length, name: file.name });
      markProgress(i + 1, files.length);
      const result = await analyzer.analyze(`m${i + 1}`, file);
      const frame = result.frame;
      result.frame = null;
      if (frame) {
        // Objets d'abord : les personnes détectées guident une seconde recherche des visages manqués.
        if (objectDetector) {
          try {
            const t = performance.now();
            result.item.objects = objectDetector.detect(frame.bitmap);
            result.diagnostic.objectMs = performance.now() - t;
          } catch (e) {
            faceError ??= `objets : ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        if (detector) {
          try {
            const t = performance.now();
            const { observations, retried } = await findFaces(detector, frame.bitmap, result.item.objects);
            result.item.faces = observations.map((o) =>
              measureFace(o, frame.gray, frame.width, frame.height, result.item.focal35, frame.rgba),
            );
            result.diagnostic.faceMs = performance.now() - t;
            result.diagnostic.faceCount = observations.length;
            result.diagnostic.faceRetry = retried;
          } catch (e) {
            faceError ??= e instanceof Error ? e.message : String(e);
          }
        }
        frame.bitmap.close();
      }
      results.push(result);
      if (result.thumbnail) thumbnails.set(result.item.id, URL.createObjectURL(result.thumbnail));
      if (result.preview) previews.set(result.item.id, URL.createObjectURL(result.preview));
    }

    analyzer.dispose();
    detector?.close();
    objectDetector?.close();
    wake.release();
    clearProgress();
    const device = await readDeviceReport();
    // Ordre de la journée : le numéro d'une photo est le même dans les deux onglets.
    const order = new Map(sortChronologically(results.map((r) => r.item)).map((item, i) => [item.id, i]));
    results.sort((a, b) => order.get(a.item.id)! - order.get(b.item.id)!);
    setSession({
      results,
      thumbnails,
      previews,
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
      {tab === 'paquets' ? (
        <Paquets
          session={session}
          day={day}
          gap={gap}
          onGap={setGap}
          choices={choices}
          onChoose={(item, pack, choice) => {
            const key = photoKey(item);
            if (choice === null) {
              setRecords((list) => list.filter((r) => r.key !== key));
              void removeChoice(key);
            } else {
              const record = makeRecord(item, pack, choice);
              setRecords((list) => [...list.filter((r) => r.key !== key), record]);
              void saveChoice(record);
            }
          }}
        />
      ) : (
        <Diagnostic
          session={session}
          day={day}
          records={records}
          learned={learned}
          onForget={() => {
            setRecords([]);
            void clearChoices();
          }}
        />
      )}
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
