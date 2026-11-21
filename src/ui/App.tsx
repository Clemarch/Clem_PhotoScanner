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
import {
  analyzeDay,
  buildQueue,
  calibrate,
  config,
  learnWeights,
  mergeChoices,
  mergeValidations,
  measureFace,
  measureSegmentation,
  photoKey,
  sortChronologically,
  tooFast,
  type ChoiceRecord,
  type MediaItem,
  type PackAnalysis,
  type PoseTask,
  type PoseValidation,
} from '../engine';
import { clearValidations, loadValidations, saveValidation } from '../platform/storage/validations';
import { TriEclair, type EclairResult } from './screens/TriEclair';
import { clearChoices, loadChoices, removeChoice, saveChoice } from '../platform/storage/choices';
import { loadReports, saveReport, type SavedReport } from '../platform/storage/reports';
import { loadLastRun, runSignature, saveLastRun, type LastRun } from '../platform/storage/lastRun';
import {
  deleteSession,
  forgetCurrentSession,
  listSessions,
  loadSession,
  loadSessionById,
  saveSession,
  saveSessionSettings,
  setSessionClosed,
  type SavedSession,
  type SessionSummary,
} from '../platform/storage/sessionStore';
import { SeanceTerminee } from './screens/SeanceTerminee';
import { forgetLastBackupCount } from '../platform/storage/backupFile';
import type { DeviceReport } from '../platform/device';
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
import { Reglages } from './screens/Reglages';
import { IconCorbeille, IconReglages, IconTrier } from './icons';
import { Paquets } from './screens/Paquets';
import { ASupprimer } from './screens/ASupprimer';
import { finalKeep } from './choices';

type Tab = 'paquets' | 'supprimer' | 'reglages';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>('paquets');
  const [interrupted, setInterrupted] = useState<InterruptedRun | null>(null);
  const cancelRef = useRef(false);
  // Une analyse a été lancée : la séance relue au démarrage (plus lente) ne doit pas la remplacer.
  const startedRef = useRef(false);
  const [gap, setGap] = useState<number>(config.grouping.packGapSeconds);
  const [records, setRecords] = useState<ChoiceRecord[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  // Séance terminée (tout est parti à la suppression) : ses photos ne s'affichent plus, mais elle peut être rouverte.
  const [closed, setClosed] = useState(false);
  // Toutes les séances gardées sur l'iPhone (utilisateur, 20/11 : « possible de réouvrir la session si besoin et toutes
  // les autres antérieures »).
  const [seances, setSeances] = useState<SessionSummary[]>([]);
  // Tri éclair (jalon 6) : journal des poses validées, et file en cours (figée à l'ouverture).
  const [validations, setValidations] = useState<PoseValidation[]>([]);
  const [eclair, setEclair] = useState<PoseTask[] | null>(null);
  // Une analyse vient de se terminer : le tri éclair s'ouvre de lui-même.
  const [justAnalyzed, setJustAnalyzed] = useState(false);
  const refreshSeances = () => void listSessions().then(setSeances);
  // Réglages ouverts par-dessus l'accueil.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Paquets rattachés à la main au paquet précédent (pour cette journée).
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<SavedReport[]>([]);
  // Séance précédente (pour reprendre au bon endroit) et séance en cours.
  const [runs, setRuns] = useState<{ previous: LastRun | null; latest: LastRun | null }>(() => ({ previous: null, latest: loadLastRun() }));

  useEffect(() => {
    setInterrupted(readInterruptedRun());
    clearProgress();
    void loadChoices().then((list) => {
      setRecords(list);
      setRecordsLoaded(true);
    });
    void loadReports().then(setReports);
    void loadValidations().then(setValidations);
    // Séance en cours reprise si iOS a fermé l'app en arrière-plan (passage dans une autre app, mémoire).
    void loadSession().then((saved) => {
      if (!saved || startedRef.current) return;
      setSession(openSaved(saved, 'reprise'));
    });
    refreshSeances();
    // Protège les choix enregistrés contre l'effacement automatique de Safari.
    void requestPersistentStorage();
  }, []);

  /** Séance gardée → séance affichée (vignettes et aperçus relus sur l'iPhone, réglages repris). */
  function openSaved(saved: SavedSession, how: 'reprise' | 'rouverte'): Session {
    const thumbnails = new Map<string, string>();
    const previews = new Map<string, string>();
    for (const r of saved.results) {
      if (r.thumbnail) thumbnails.set(r.item.id, URL.createObjectURL(r.thumbnail));
      if (r.preview) previews.set(r.item.id, URL.createObjectURL(r.preview));
    }
    setGap(saved.settings?.gap ?? config.grouping.packGapSeconds);
    setJoined(new Set(saved.settings?.joined ?? []));
    setClosed(false);
    return {
      id: saved.sessionId,
      results: saved.results.map((r) => ({ ...r, frame: null })),
      thumbnails,
      previews,
      originals: new Map(),
      ...saved.meta,
      device: saved.meta.device as DeviceReport,
      restored: how === 'reprise',
      reopened: how === 'rouverte',
    };
  }

  const releaseUrls = (s: Session | null) => {
    s?.thumbnails.forEach((url) => URL.revokeObjectURL(url));
    s?.previews.forEach((url) => URL.revokeObjectURL(url));
  };

  /** Rouvre une séance : celle qui est affichée (terminée), ou une plus ancienne. */
  const reopen = async (sessionId: string) => {
    if (session?.id === sessionId) {
      setClosed(false);
    } else {
      const saved = await loadSessionById(sessionId);
      if (!saved) return;
      releaseUrls(session);
      setSession(openSaved(saved, 'rouverte'));
    }
    await setSessionClosed(sessionId, false);
    setSettingsOpen(false);
    setTab('paquets');
    window.scrollTo({ top: 0 });
    refreshSeances();
  };

  /** Tout est parti à la suppression : la séance se termine. */
  const finish = () => {
    if (!session) return;
    setClosed(true);
    window.scrollTo({ top: 0 });
    void setSessionClosed(session.id, true).then(refreshSeances);
  };

  const removeSaved = async (sessionId: string) => {
    await deleteSession(sessionId);
    refreshSeances();
  };

  // Choix de l'utilisateur, et goûts appris à partir de tous ses choix enregistrés sur l'appareil.
  const choices = useMemo<Choices>(() => ({ byKey: new Map(records.map((r) => [r.key, r])) }), [records]);
  const learned = useMemo(() => learnWeights(records), [records]);
  const items = useMemo(() => session?.results.map((r) => r.item) ?? [], [session]);
  // Paquets toujours découpés selon ce que montrent les photos (utilisateur, 20/11 : l'interrupteur n'avait pas de sens).
  const day = useMemo(() => analyzeDay(items, gap, learned, joined, true), [items, gap, learned, joined]);

  // File du tri éclair : poses à trancher, sans celles déjà validées dans cette séance, ni les « sûres » (l'app y a fait
  // ses preuves sur vos validations passées).
  const calibration = useMemo(() => calibrate(validations), [validations]);
  const queue = useMemo(() => buildQueue(day, (it, p) => finalKeep(it, p, choices), calibration), [day, choices, calibration]);
  const validatedHere = useMemo(() => {
    const prefix = `${session?.id ?? ''}|`;
    return new Set(validations.filter((v) => v.id.startsWith(prefix)).map((v) => v.id.slice(prefix.length)));
  }, [validations, session]);
  const pending = useMemo(() => queue.filter((t) => !t.sure && !validatedHere.has(t.key)), [queue, validatedHere]);
  const sureLeft = useMemo(() => queue.filter((t) => t.sure && !validatedHere.has(t.key)), [queue, validatedHere]);
  const openEclair = (which: 'suite' | 'sures' | 'tout') =>
    setEclair(which === 'suite' ? pending : which === 'sures' ? sureLeft : queue);
  // Une analyse vient de se terminer : le tri éclair s'ouvre de lui-même s'il y a des poses à trancher.
  useEffect(() => {
    if (!justAnalyzed || !session) return;
    setJustAnalyzed(false);
    if (pending.length > 0) setEclair(pending);
  }, [justAnalyzed, session, pending]);

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
        text: buildReport(session, day, records, learned, validations),
      }).then(() => loadReports().then(setReports));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [session, day, records, learned, validations]);

  // Réglages de la séance (écart entre paquets, paquets réunis) gardés avec elle.
  useEffect(() => {
    if (session) void saveSessionSettings(session.id, { gap, joined: [...joined] });
  }, [session, gap, joined]);

  const start = async (files: File[]) => {
    startedRef.current = true;
    // La séance précédente n'est plus « ouverte » : si iOS ferme l'app pendant l'analyse, elle n'est pas reprise.
    void forgetCurrentSession();
    setJoined(new Set());
    releaseUrls(session);
    setSession(null);
    setClosed(false);
    setSettingsOpen(false);
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
    const meta = {
      totalMs: performance.now() - startedAt,
      cancelled: cancelRef.current,
      wakeLock: wakeActive,
      wakeLockInfo: wakeInfo,
      heapBeforeMB,
      heapAfterMB: readJsHeapMB(),
      device,
      faceError,
    };
    setSession({ id: String(launchedAt), results, thumbnails, previews, originals, ...meta });
    // Gardée sur l'iPhone : reprise si iOS ferme l'app pendant qu'on est dans une autre app.
    void saveSession(String(launchedAt), results, meta).then(refreshSeances);
    setProgress(null);
    setTab('paquets');
    setJustAnalyzed(true);
  };

  // Restauration d'une sauvegarde : fusion, rien n'est effacé ; le choix le plus récent l'emporte.
  const restore = async (incoming: ChoiceRecord[], incomingValidations: PoseValidation[] = []) => {
    if (incomingValidations.length) {
      const all = mergeValidations(validations, incomingValidations);
      for (const v of all) await saveValidation(v);
      setValidations(all);
    }
    const { merged, added, updated } = mergeChoices(records, incoming);
    const before = new Map(records.map((r) => [r.key, r]));
    for (const r of merged) if (before.get(r.key) !== r) await saveChoice(r);
    setRecords(merged);
    return { added, updated };
  };

  /**
   * Pose validée dans le tri éclair : un choix enregistré pour chacune de ses photos (exemple complet, non biaisé),
   * et une ligne au journal. Validée trop vite sans rien changer : comptée comme vue, sans servir à l'apprentissage.
   */
  const validatePose = ({ task, kept, ms }: EclairResult) => {
    if (!session) return;
    const id = `${session.id}|${task.key}`;
    // Pose déjà validée (« Tout revoir », retour en arrière) : la proposition d'origine est gardée. Celle d'aujourd'hui a
    // appris de votre première validation de ces mêmes photos, elle gonflerait la justesse.
    const previous = validations.find((v) => v.id === id);
    const validation: PoseValidation = {
      id,
      at: Date.now(),
      sessionId: session.id,
      packKey: task.pack.key,
      margin: previous?.margin ?? task.margin,
      keys: task.items.map(photoKey),
      proposed: previous?.proposed ?? task.items.filter((it) => task.appProposed.has(it.id)).map(photoKey),
      kept: task.items.filter((it) => kept.has(it.id)).map(photoKey),
      ms,
    };
    void saveValidation(validation);
    setValidations((list) => [...list.filter((v) => v.id !== validation.id), validation]);
    const changed = task.items.some((it) => kept.has(it.id) !== task.proposed.has(it.id));
    if (!changed && tooFast(validation)) return;
    const fresh = task.items.map((it) => makeRecord(it, task.pack, kept.has(it.id) ? 'garder' : 'supprimer', false, 'pose'));
    const freshKeys = new Set(fresh.map((r) => r.key));
    // Commentaires déjà écrits sur ces photos : gardés.
    const comments = new Map(records.filter((r) => freshKeys.has(r.key) && r.comment).map((r) => [r.key, r.comment!]));
    const withComments = fresh.map((r) => (comments.has(r.key) ? { ...r, comment: comments.get(r.key) } : r));
    setRecords((list) => [...list.filter((r) => !freshKeys.has(r.key)), ...withComments]);
    for (const r of withComments) void saveChoice(r);
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
  // Paquets traités (envoyés au raccourci ou marqués « Fait ») : chaque photo laissée telle quelle compte comme un accord
  // avec l'app (utilisateur, 19/11 : « quand je clique pas c'est que je suis d'accord »).
  const confirmPacks = (packs: PackAnalysis[]) => {
    const known = new Set(records.map((r) => r.key));
    const fresh: ChoiceRecord[] = [];
    for (const pack of packs)
      for (const item of pack.pack.items) {
        if (known.has(photoKey(item))) continue;
        const state = finalKeep(item, pack, choices);
        fresh.push(makeRecord(item, pack, state.keep ? 'garder' : 'supprimer', true));
      }
    if (fresh.length === 0) return;
    setRecords((list) => [...list.filter((r) => !fresh.some((f) => f.key === r.key)), ...fresh]);
    for (const record of fresh) void saveChoice(record);
  };
  // Paquet rouvert (« Fait » retiré, envoi recommencé) : ses accords silencieux sont oubliés, les vrais choix restent.
  const unconfirmPacks = (packs: PackAnalysis[]) => {
    const keys = new Set(packs.flatMap((pack) => pack.pack.items.map(photoKey)));
    const gone = records.filter((r) => r.implicit && keys.has(r.key));
    if (gone.length === 0) return;
    setRecords((list) => list.filter((r) => !(r.implicit && keys.has(r.key))));
    for (const record of gone) void removeChoice(record.key);
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

  const settings = (onClose?: () => void) => (
    <Reglages
      session={session}
      day={session ? day : null}
      records={records}
      learned={learned}
      reports={reports}
      onRestore={restore}
      onForget={() => {
        setValidations([]);
        void clearValidations();
        setRecords([]);
        void clearChoices();
        forgetLastBackupCount();
      }}
      validations={validations}
      seances={seances}
      currentId={closed ? null : (session?.id ?? null)}
      onReopen={(id) => void reopen(id)}
      onDeleteSession={(id) => void removeSaved(id)}
      onClose={onClose}
    />
  );

  if (!session) {
    if (settingsOpen) return settings(() => setSettingsOpen(false));
    return (
      <Accueil
        onFiles={start}
        interrupted={interrupted}
        lastRun={runs.latest}
        records={records}
        recordsLoaded={recordsLoaded}
        onRestore={restore}
        onSettings={() => setSettingsOpen(true)}
        seances={seances.length}
      />
    );
  }

  const goTab = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const ended = (
    <SeanceTerminee
      session={session}
      onReopen={() => void reopen(session.id)}
      onNewDay={(files) => void start(files)}
      onSeances={() => goTab('reglages')}
    />
  );

  return (
    <>
      {closed && tab !== 'reglages' ? (
        ended
      ) : tab === 'paquets' ? (
        <Paquets
          session={session}
          day={day}
          gap={gap}
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
          onGoDelete={() => goTab('supprimer')}
          eclair={{ pending: pending.length, sure: sureLeft.length, total: queue.length }}
          onEclair={openEclair}
        />
      ) : tab === 'supprimer' ? (
        <ASupprimer session={session} day={day} choices={choices} onChoose={choose} onComment={comment} onConfirm={confirmPacks} onUnconfirm={unconfirmPacks} onFinished={finish} />
      ) : (
        settings()
      )}
      <nav className="onglets">
        <button className={tab === 'paquets' ? 'actif' : ''} onClick={() => goTab('paquets')}>
          <IconTrier />
          <span>Trier</span>
        </button>
        <button className={tab === 'supprimer' ? 'actif' : ''} onClick={() => goTab('supprimer')}>
          <span className="onglet-icone">
            <IconCorbeille />
            {toRemove > 0 && !closed && <span className="pastille">{toRemove}</span>}
          </span>
          <span>Supprimer</span>
        </button>
        <button className={tab === 'reglages' ? 'actif' : ''} onClick={() => goTab('reglages')}>
          <IconReglages />
          <span>Réglages</span>
        </button>
      </nav>
      {eclair && !closed && (
        <TriEclair
          tasks={eclair}
          previews={session.previews}
          thumbnails={session.thumbnails}
          numberOf={(id) => day.dayIndex.get(id) ?? null}
          onValidate={validatePose}
          onClose={() => setEclair(null)}
          onFinish={() => {
            setEclair(null);
            goTab('supprimer');
          }}
        />
      )}
    </>
  );
}
