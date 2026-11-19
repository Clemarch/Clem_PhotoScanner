import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearProgress,
  keepScreenAwake,
  markProgress,
  readDeviceReport,
  readInterruptedRun,
  requestPersistentStorage,
  readJsHeapMB,
  type InterruptedRun,
} from '../platform/device';
import type { AnalyzeResult } from '../platform/image/types';
import { analyzeDay, config, learnWeights, mergeChoices, measureFace, measureSegmentation, photoKey, sortChronologically, type ChoiceRecord, type MediaItem, type PackAnalysis } from '../engine';
import { clearChoices, loadChoices, removeChoice, saveChoice } from '../platform/storage/choices';
import { loadReports, saveReport, type SavedReport } from '../platform/storage/reports';
import { loadLastRun, runSignature, saveLastRun, type LastRun } from '../platform/storage/lastRun';
import { buildReport } from './report';
import { formatDate } from './format';
import { makeRecord, type Choice, type Choices } from './choices';
import { createFaceDetector, type FaceDetector } from '../platform/vision/faceDetector';
import { createObjectDetector, type ObjectDetector } from '../platform/vision/objectDetector';
import { findFaces } from '../platform/vision/retry';
import {
  createClassifier,
  createEmbedder,
  createGestureFinder,
  createSegmenter,
  type Classifier,
  type Embedder,
  type GestureFinder,
  type Segmenter,
} from '../platform/vision/sceneModels';
import { createAnalyzer } from '../platform/worker/analyzer';
import type { Session } from './session';
import { Accueil } from './screens/Accueil';
import { Analyse } from './screens/Analyse';
import { Diagnostic } from './screens/Diagnostic';
import { Paquets } from './screens/Paquets';
import { ASupprimer } from './screens/ASupprimer';
import { finalKeep } from './choices';

type Tab = 'paquets' | 'supprimer' | 'diagnostic';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>('paquets');
  const [interrupted, setInterrupted] = useState<InterruptedRun | null>(null);
  const cancelRef = useRef(false);
  const [gap, setGap] = useState<number>(config.grouping.packGapSeconds);
  const [records, setRecords] = useState<ChoiceRecord[]>([]);
  // Paquets rattachés à la main au paquet précédent (pour cette journée).
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<SavedReport[]>([]);
  // Séance précédente (pour reprendre au bon endroit) et séance en cours.
  const [runs, setRuns] = useState<{ previous: LastRun | null; latest: LastRun | null }>(() => ({ previous: null, latest: loadLastRun() }));

  useEffect(() => {
    setInterrupted(readInterruptedRun());
    clearProgress();
    void loadChoices().then(setRecords);
    void loadReports().then(setReports);
    // Protège les choix enregistrés contre l'effacement automatique de Safari.
    void requestPersistentStorage();
  }, []);

  // Choix de l'utilisateur, et goûts appris à partir de tous ses choix enregistrés sur l'appareil.
  const choices = useMemo<Choices>(() => ({ byKey: new Map(records.map((r) => [r.key, r])) }), [records]);
  const learned = useMemo(() => learnWeights(records), [records]);
  const items = useMemo(() => session?.results.map((r) => r.item) ?? [], [session]);
  const day = useMemo(() => analyzeDay(items, gap, learned, joined), [items, gap, learned, joined]);

  // Rapport de l'analyse en cours, conservé sur l'iPhone et mis à jour avec les choix (4 s après le dernier, pour ne
  // pas ralentir l'app pendant qu'on trie : le rapport recalcule l'accord honnête, qui demande un peu de calcul).
  useEffect(() => {
    if (!session || session.cancelled) return;
    const timer = window.setTimeout(() => {
      const photos = session.results.length;
      const first = session.results.find((r) => r.item.capturedAt !== null)?.item.capturedAt ?? null;
      const chosen = session.results.filter((r) => records.some((c) => c.key === photoKey(r.item))).length;
      void saveReport({
        id: session.id,
        at: Date.now(),
        title: `${first ? formatDate(first) : 'Sans date'} · ${photos} photos · ${chosen} choix`,
        text: buildReport(session, day, records, learned),
      }).then(() => loadReports().then(setReports));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [session, day, records, learned]);

  const start = async (files: File[]) => {
    setJoined(new Set());
    session?.thumbnails.forEach((url) => URL.revokeObjectURL(url));
    session?.previews.forEach((url) => URL.revokeObjectURL(url));
    setSession(null);
    setInterrupted(null);
    cancelRef.current = false;
    setProgress({ done: 0, total: files.length, name: '' });

    const heapBeforeMB = readJsHeapMB();
    // Écran tenu allumé pendant toute l'analyse ; redemandé à chaque photo au cas où iOS l'aurait retiré.
    const wake = keepScreenAwake();
    await wake.ensure();
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
    // Trois modèles complémentaires ; si l'un ne démarre pas, l'analyse continue sans lui.
    const start3 = async <T,>(name: string, create: () => Promise<T>): Promise<T | null> => {
      try {
        return await create();
      } catch (e) {
        faceError ??= `${name} : ${e instanceof Error ? e.message : String(e)}`;
        return null;
      }
    };
    const segmenter: Segmenter | null = await start3('silhouette', createSegmenter);
    const embedder: Embedder | null = await start3('empreinte', createEmbedder);
    const classifier: Classifier | null = await start3('scène', createClassifier);
    const gestures: GestureFinder | null = await start3('gestes', createGestureFinder);
    const results: AnalyzeResult[] = [];
    const originals = new Map<string, File>();
    const thumbnails = new Map<string, string>();
    const previews = new Map<string, string>();
    const startedAt = performance.now();
    const launchedAt = Date.now();

    for (let i = 0; i < files.length && !cancelRef.current; i++) {
      const file = files[i]!;
      setProgress({ done: i, total: files.length, name: file.name });
      markProgress(i + 1, files.length);
      void wake.ensure();
      const result = await analyzer.analyze(`m${i + 1}`, file);
      const frame = result.frame;
      result.frame = null;
      // Capture d'écran ou image enregistrée : mise de côté, sans passer par les modèles.
      if (frame && result.item.camera === false) frame.bitmap.close();
      else if (frame) {
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
        {
          const t = performance.now();
          try {
            if (segmenter) {
              // Image réduite : le masque est à la taille de l'image donnée, inutile qu'il soit grand.
              const side = config.segmentation.inputMaxSide;
              const scale = Math.min(1, side / Math.max(frame.width, frame.height));
              const small = await createImageBitmap(frame.bitmap, {
                resizeWidth: Math.max(1, Math.round(frame.width * scale)),
                resizeHeight: Math.max(1, Math.round(frame.height * scale)),
              });
              try {
                const seg = segmenter.segment(small);
                if (seg) result.item.segmentation = measureSegmentation(seg.mask, seg.width, seg.height, (result.item.faces ?? []).map((f) => f.box));
              } finally {
                small.close();
              }
            }
            if (embedder) result.item.embedding = embedder.embed(frame.bitmap);
            if (classifier) result.item.labels = classifier.classify(frame.bitmap);
            // Gestes : seulement s'il y a des personnes à juger.
            if (gestures && (result.item.faces?.length ?? 0) > 0) result.item.hands = gestures.find(frame.bitmap);
          } catch (e) {
            faceError ??= `modèles : ${e instanceof Error ? e.message : String(e)}`;
          }
          if (segmenter || embedder || classifier || gestures) result.diagnostic.modelsMs = performance.now() - t;
        }
        frame.bitmap.close();
      }
      results.push(result);
      // Le fichier d'origine reste sur l'iPhone ; on garde seulement sa référence, pour le zoom en pleine définition.
      originals.set(result.item.id, file);
      if (result.thumbnail) thumbnails.set(result.item.id, URL.createObjectURL(result.thumbnail));
      if (result.preview) previews.set(result.item.id, URL.createObjectURL(result.preview));
    }

    analyzer.dispose();
    detector?.close();
    objectDetector?.close();
    segmenter?.close();
    embedder?.close();
    classifier?.close();
    gestures?.close();
    // À lire avant de relâcher : après, l'écran n'est évidemment plus tenu allumé.
    const wakeActive = wake.active;
    const wakeInfo = wake.describe();
    wake.release();
    clearProgress();
    const device = await readDeviceReport();
    // Ordre de la journée : le numéro d'une photo est le même dans les deux onglets.
    const order = new Map(sortChronologically(results.map((r) => r.item)).map((item, i) => [item.id, i]));
    results.sort((a, b) => order.get(a.item.id)! - order.get(b.item.id)!);
    const dated = results.map((r) => r.item.capturedAt).filter((t): t is number => t !== null);
    if (dated.length > 0 && !cancelRef.current) {
      const run: LastRun = {
        firstAt: Math.min(...dated),
        lastAt: Math.max(...dated),
        photos: results.length,
        doneAt: Date.now(),
        signature: runSignature(results.map((r) => photoKey(r.item))),
      };
      saveLastRun(run);
      // La même sélection analysée une seconde fois (reprise, nouvelle version) n'est pas une nouvelle séance.
      setRuns((r) => ({ previous: r.latest?.signature === run.signature ? r.previous : r.latest, latest: run }));
    }
    setSession({
      id: String(launchedAt),
      results,
      thumbnails,
      previews,
      originals,
      totalMs: performance.now() - startedAt,
      cancelled: cancelRef.current,
      wakeLock: wakeActive,
      wakeLockInfo: wakeInfo,
      heapBeforeMB,
      heapAfterMB: readJsHeapMB(),
      device,
      faceError,
    });
    setProgress(null);
    setTab('paquets');
  };

  // Restauration d'une sauvegarde : fusion, rien n'est effacé ; le choix le plus récent l'emporte.
  const restore = async (incoming: ChoiceRecord[]) => {
    const { merged, added, updated } = mergeChoices(records, incoming);
    const before = new Map(records.map((r) => [r.key, r]));
    for (const r of merged) if (before.get(r.key) !== r) await saveChoice(r);
    setRecords(merged);
    return { added, updated };
  };

  const choose = (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => {
    const key = photoKey(item);
    if (choice === null) {
      setRecords((list) => list.filter((r) => r.key !== key));
      void removeChoice(key);
    } else {
      const record = makeRecord(item, pack, choice);
      setRecords((list) => [...list.filter((r) => r.key !== key), record]);
      void saveChoice(record);
    }
  };
  const comment = (item: MediaItem, text: string) => {
    const key = photoKey(item);
    const record = records.find((r) => r.key === key);
    if (!record || (record.comment ?? '') === text) return;
    const updated = { ...record, comment: text || undefined };
    setRecords((list) => list.map((r) => (r.key === key ? updated : r)));
    void saveChoice(updated);
  };
  const toRemove = day.packs.reduce((n, pack) => n + pack.pack.items.filter((it) => !finalKeep(it, pack, choices).keep).length, 0);

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

  if (!session)
    return <Accueil onFiles={start} interrupted={interrupted} reports={reports} lastRun={runs.latest} records={records} onRestore={restore} />;

  return (
    <>
      {tab === 'paquets' ? (
        <Paquets
          session={session}
          day={day}
          gap={gap}
          onGap={setGap}
          onJoin={(key, join) =>
            setJoined((set) => {
              const next = new Set(set);
              if (join) next.add(key);
              else next.delete(key);
              return next;
            })
          }
          choices={choices}
          previousRun={runs.previous}
          onNewDay={(files) => void start(files)}
          onChoose={choose}
          onComment={comment}
        />
      ) : tab === 'supprimer' ? (
        <ASupprimer session={session} day={day} choices={choices} onChoose={choose} onComment={comment} />
      ) : (
        <Diagnostic
          session={session}
          day={day}
          records={records}
          learned={learned}
          reports={reports}
          onRestore={restore}
          onForget={() => {
            setRecords([]);
            void clearChoices();
          }}
        />
      )}
      <nav className="onglets">
        <button className={tab === 'paquets' ? 'actif' : ''} onClick={() => setTab('paquets')}>
          1. Trier
        </button>
        <button className={tab === 'supprimer' ? 'actif' : ''} onClick={() => setTab('supprimer')}>
          2. Dans Photos{toRemove > 0 && <span className="pastille">{toRemove}</span>}
        </button>
        <button className={tab === 'diagnostic' ? 'actif' : ''} onClick={() => setTab('diagnostic')}>
          Diagnostic
        </button>
      </nav>
    </>
  );
}
