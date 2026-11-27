import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  analyzeDay,
  buildQueue,
  calibrate,
  config,
  learnWeights,
  mainFaces,
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
  type ShadowComparison,
  shadowCompare,
} from '../engine';
import { clearValidations, loadValidations, saveValidation } from '../platform/storage/validations';
import { loadExcludedSessions, saveExcludedSessions } from '../platform/storage/excludedSessions';
import { TriEclair, type EclairResult } from './screens/TriEclair';
import { clearChoices, loadChoices, removeChoice, saveChoice, saveChoices } from '../platform/storage/choices';
import { loadReports, saveReport, type SavedReport } from '../platform/storage/reports';
import { loadLastRun, runSignature, saveLastRun, type LastRun } from '../platform/storage/lastRun';
import {
  deleteSession,
  forgetCurrentSession,
  listSessions,
  loadSession,
  loadSessionItems,
  loadSessionById,
  saveSession,
  saveSessionSettings,
  setSessionClosed,
  storeSessionImages,
  updateSessionMeasures,
  clearPartialResults,
  fileSignature,
  loadPartialResults,
  savePartialResult,
  type SavedSession,
  type SessionSummary,
} from '../platform/storage/sessionStore';
import { SeanceTerminee } from './screens/SeanceTerminee';
import { forgetLastBackupCount } from '../platform/storage/backupFile';
import type { DeviceReport } from '../platform/device';
import { buildReport } from './report';
import { formatDate, formatMs } from './format';
import { eyePatches, makeRecord, needsEye, withEye, type Choice, type Choices } from './choices';
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
import { BandeauMiseAJour } from './BandeauMiseAJour';
import { createAnalyzer } from '../platform/worker/analyzer';
import { EYE_RELEASE_WAIT_MS, runEyeInBackground, waitForRelease, type EyeRun } from '../platform/vision/eyeRunner';
import { setBusy, watchForegroundUpdates } from '../platform/update';
import { ensureModels, modelsState, type ModelsState } from '../platform/storage/models';
import type { SavedSessionMeta } from '../platform/storage/sessionStore';
import type { AnalyzeResult } from '../platform/image/types';
import type { EyeProgress, Session } from './session';
import { APP_VERSION } from './version';
import { Accueil } from './screens/Accueil';
import { Analyse } from './screens/Analyse';
import { Reglages } from './screens/Reglages';
import { Labo } from './screens/Labo';
import { IconCorbeille, IconReglages, IconTrier } from './icons';
import { Paquets } from './screens/Paquets';
import { ASupprimer } from './screens/ASupprimer';
import { finalKeep } from './choices';

type Tab = 'paquets' | 'supprimer' | 'reglages';

/** « séance du 14/11 » : première date de prise de vue de la séance. */
const sessionLabel = (results: readonly AnalyzeResult[]): string => {
  const first = results.find((r) => r.item.capturedAt !== null)?.item.capturedAt ?? null;
  return first === null ? 'séance sans date' : `séance du ${formatDate(first)}`;
};

/** Mesures de la séance à réenregistrer avec celles du nouvel œil (sans toucher à ses réglages ni à son état). */
const sessionMeta = (session: Session): SavedSessionMeta => ({
  totalMs: session.totalMs,
  cancelled: session.cancelled,
  wakeLock: session.wakeLock,
  wakeLockInfo: session.wakeLockInfo,
  heapBeforeMB: session.heapBeforeMB,
  heapAfterMB: session.heapAfterMB,
  device: session.device,
  faceError: session.faceError,
  eyeInfo: session.eyeInfo ?? null,
  eyeStart: null,
  resumed: session.resumed,
  retriaged: session.retriaged,
});

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
  // Séances hors statistiques (photos déjà triées avant, par exemple) : leurs validations ne comptent pas.
  const [excluded, setExcluded] = useState<Set<string>>(loadExcludedSessions);
  const counted = useMemo(() => validations.filter((v) => !excluded.has(v.sessionId)), [validations, excluded]);
  const toggleCounted = (sessionId: string, count: boolean) =>
    setExcluded((set) => {
      const next = new Set(set);
      if (count) next.delete(sessionId);
      else next.add(sessionId);
      saveExcludedSessions(next);
      return next;
    });
  const [eclair, setEclair] = useState<PoseTask[] | null>(null);
  // Comparaison du nouvel œil : calcul un peu long, fait au calme (quelques secondes après la dernière validation).
  const [shadow, setShadow] = useState<ShadowComparison | null>(null);
  // Nouvel œil en arrière-plan : progression (affichée dans Réglages) et tâche en cours.
  const [eyeProgress, setEyeProgress] = useState<EyeProgress | null>(null);
  // Labo d'apprentissage (jalon 7), ouvert par-dessus l'accueil ou les réglages.
  const [laboOpen, setLaboOpen] = useState(false);
  const eyeRun = useRef<EyeRun | null>(null);
  const eyeToken = useRef(0);
  // Modèles du nouvel œil : état du téléchargement (accueil) et attente avant de lancer l'œil.
  const [models, setModels] = useState<ModelsState | null>(null);
  const modelsPromise = useRef<Promise<ModelsState | null> | null>(null);
  // Téléchargement en cours (un seul à la fois), analyse en cours, et téléchargement à reprendre après elle.
  const modelsDownload = useRef<AbortController | null>(null);
  const analysing = useRef(false);
  const resumeModels = useRef(false);
  /**
   * Télécharge les modèles manquants. Jamais deux fois en même temps (« Réessayer » touché deux fois), ni pendant une
   * analyse : son tampon de 95 Mo s'ajouterait à la mémoire de l'analyse, celle qu'iOS surveille ; il reprend après.
   */
  const downloadModels = (): Promise<ModelsState | null> => {
    if (modelsDownload.current && modelsPromise.current) return modelsPromise.current;
    if (analysing.current) {
      resumeModels.current = true;
      return Promise.resolve(null);
    }
    const controller = new AbortController();
    modelsDownload.current = controller;
    const promise = ensureModels(setModels, controller.signal)
      .then((state) => {
        // Séance qui attendait ses modèles (téléchargement échoué puis relancé) : le nouvel œil s'y met maintenant.
        const waiting = pendingEye.current;
        if (state?.ready && waiting) {
          pendingEye.current = null;
          waiting.meta.eyeInfo = null;
          runEye(waiting.sessionId, waiting.results, waiting.originals, waiting.meta);
        }
        return state;
      })
      .finally(() => {
        if (modelsDownload.current === controller) modelsDownload.current = null;
      });
    modelsPromise.current = promise;
    return promise;
  };
  const retryModels = () => void downloadModels();
  // Séance dont le nouvel œil attend ses modèles.
  const pendingEye = useRef<{ sessionId: string; results: AnalyzeResult[]; originals: Map<string, Blob>; meta: SavedSessionMeta } | null>(null);
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

  // Nouvelle version cherchée au lancement et à chaque retour dans l'app (25/11).
  useEffect(() => watchForegroundUpdates(), []);

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
    // Modèles du nouvel œil : vérifiés, et téléchargés s'il le faut, dès l'ouverture (progression sur l'accueil).
    modelsPromise.current = modelsState().then((state) => {
      setModels(state);
      return state.ready ? state : downloadModels();
    });
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
    setRecovering(null);
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
      // Nouvel œil de la séance précédente : arrêté, y compris s'il attendait encore ses modèles.
      eyeToken.current++;
      eyeRun.current?.cancel();
      eyeRun.current = null;
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

  /**
   * Images d'une séance reprise devenues illisibles : l'utilisateur re-choisit les mêmes photos, reconnues par leur nom
   * et leur taille. Seules les images sont refaites (pas l'analyse) ; les choix ne bougent pas. Les photos d'origine
   * redeviennent aussi accessibles pour le zoom.
   */
  const [recovering, setRecovering] = useState<{ done: number; total: number; found?: number } | null>(null);
  const recoverImages = async (files: File[]) => {
    const current = session;
    if (!current || recovering) return;
    const bySignature = new Map(current.results.map((r) => [`${r.item.fileName}|${r.item.sizeBytes}`, r]));
    // Secours : même nom seulement, s'il est unique dans la séance (l'iPhone peut convertir la photo autrement).
    const names = new Map<string, AnalyzeResult | null>();
    for (const r of current.results) names.set(r.item.fileName, names.has(r.item.fileName) ? null : r);
    const matches = files
      .map((file) => ({ file, result: bySignature.get(fileSignature(file)) ?? names.get(file.name) ?? undefined }))
      .filter((m) => m.result);
    setRecovering({ done: 0, total: matches.length });
    const thumbnails = new Map(current.thumbnails);
    const previews = new Map(current.previews);
    const originals = new Map(current.originals);
    const fresh = new Map<string, { thumbnail: Blob | null; preview: Blob | null }>();
    const analyzer = createAnalyzer();
    try {
      for (let i = 0; i < matches.length; i++) {
        const { file, result } = matches[i]!;
        const id = result!.item.id;
        originals.set(id, file);
        if (!thumbnails.has(id) || !previews.has(id)) {
          try {
            const redone = await analyzer.analyze(id, file);
            redone.frame?.bitmap.close();
            if (redone.thumbnail) {
              fresh.set(id, { thumbnail: redone.thumbnail, preview: redone.preview });
              const oldThumb = thumbnails.get(id);
              const oldPreview = previews.get(id);
              if (oldThumb) URL.revokeObjectURL(oldThumb);
              if (oldPreview) URL.revokeObjectURL(oldPreview);
              thumbnails.set(id, URL.createObjectURL(redone.thumbnail));
              if (redone.preview) previews.set(id, URL.createObjectURL(redone.preview));
            }
          } catch {
            // Photo illisible : elle reste sans image.
          }
        }
        setRecovering({ done: i + 1, total: matches.length });
      }
    } finally {
      analyzer.dispose();
    }
    const results = current.results.map((r) => (fresh.has(r.item.id) ? { ...r, ...fresh.get(r.item.id)! } : r));
    setSession((s) => (s && s.id === current.id ? { ...s, results, thumbnails, previews, originals } : s));
    setRecovering({ done: matches.length, total: matches.length, found: fresh.size });
    // Gardées au format relisible : la prochaine reprise les montrera.
    if (fresh.size > 0) void storeSessionImages(current.id, results);
  };

  // Une mise à jour arrivée en retard ne recharge jamais l'app pendant un travail (analyse, séance ouverte).
  useEffect(() => setBusy(Boolean(progress || session)), [progress, session]);

  // Choix de l'utilisateur, et goûts appris à partir de tous ses choix enregistrés sur l'appareil.
  const choices = useMemo<Choices>(() => ({ byKey: new Map(records.map((r) => [r.key, r])) }), [records]);
  // Pages sous le tri éclair (paquets, suppression) : mises à jour sans bloquer l'écran.
  const pageChoices = useDeferredValue(choices);
  // Pendant le tri éclair, les gros calculs (goûts appris, toute la séance recalculée, comparaison du nouvel œil,
  // rapport) attendent sa fermeture : sinon chaque pose validée bloquait l'écran 1 à 3 s (utilisateur, 25/11). Le tri
  // éclair travaille sur sa propre liste de poses, figée à l'ouverture : rien ne change pour lui.
  const eclairOpen = eclair !== null;
  const learningRecords = useRef(records);
  if (!eclairOpen) learningRecords.current = records;
  const learned = useMemo(() => learnWeights(learningRecords.current), [learningRecords.current]);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  useEffect(() => {
    if (eclairOpen) return;
    const timer = window.setTimeout(() => setShadow(shadowCompare(counted, recordsRef.current)), 3000);
    return () => window.clearTimeout(timer);
  }, [counted, eclairOpen]);
  const items = useMemo(() => session?.results.map((r) => r.item) ?? [], [session]);
  // Paquets toujours découpés selon ce que montrent les photos (utilisateur, 20/11 : l'interrupteur n'avait pas de sens).
  const day = useMemo(() => analyzeDay(items, gap, learned, joined, true), [items, gap, learned, joined]);
  // Ce que vos goûts appris changent dans cette séance (utilisateur, 26/11 : « je ne vois rien de mes goûts ») :
  // décisions comparées à celles de la formule seule. Calculé seulement quand le labo est ouvert.
  const tasteEffect = useMemo(() => {
    if (!laboOpen || !session || Object.keys(learned).length === 0) return null;
    const base = analyzeDay(items, gap, {}, joined, true);
    const baseKeep = new Map<string, boolean>();
    for (const p of base.packs) for (const [id, d] of p.decisions) baseKeep.set(id, d.keep);
    let changed = 0;
    let total = 0;
    for (const p of day.packs)
      for (const [id, d] of p.decisions) {
        total++;
        if (baseKeep.has(id) && baseKeep.get(id) !== d.keep) changed++;
      }
    return { changed, total };
  }, [laboOpen, session, items, gap, joined, learned, day]);

  // File du tri éclair : poses à trancher, sans celles déjà validées dans cette séance, ni les « sûres » (l'app y a fait
  // ses preuves sur vos validations passées).
  const calibration = useMemo(() => calibrate(counted), [counted]);
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
    if (!session || session.cancelled || eclairOpen) return;
    const timer = window.setTimeout(() => {
      const photos = session.results.length;
      const first = session.results.find((r) => r.item.capturedAt !== null)?.item.capturedAt ?? null;
      const chosen = session.results.filter((r) => records.some((c) => c.key === photoKey(r.item))).length;
      void saveReport({
        id: session.id,
        at: Date.now(),
        title: `${first ? formatDate(first) : 'Sans date'} · ${photos} photos · ${chosen} choix`,
        text: buildReport(session, day, records, learned, validations, shadow, excluded),
      }).then(() => loadReports().then(setReports));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [session, day, records, learned, validations, shadow, eclairOpen, excluded]);

  // Réglages de la séance (écart entre paquets, paquets réunis) gardés avec elle.
  useEffect(() => {
    if (session) void saveSessionSettings(session.id, { gap, joined: [...joined] });
  }, [session, gap, joined]);

  /** Le nouvel œil attend que ses modèles soient sur l'iPhone (téléchargés à l'ouverture), puis se lance. */
  const startEye = (
    sessionId: string,
    results: AnalyzeResult[],
    originals: Map<string, Blob>,
    meta: SavedSessionMeta,
    engines: readonly WeakRef<object>[] = [],
  ) => {
    const token = ++eyeToken.current;
    // Visible tout de suite (25/11, « je ne vois pas l'œil avancer ») : en attente, puis la progression.
    const waitingTotal = results.filter((r) => r.item.kind === 'photo' && !r.item.isRaw && r.item.camera !== false && !r.diagnostic.error && originals.has(r.item.id)).length;
    if (waitingTotal > 0) setEyeProgress({ sessionId, label: sessionLabel(results), done: 0, total: waitingTotal, waiting: true });
    // Mémoire (25/11, point 58) : le nouvel œil attend aussi que Safari ait rendu la mémoire des moteurs de l'analyse.
    void Promise.all([(modelsPromise.current ?? Promise.resolve(null)).catch(() => null), waitForRelease(engines, EYE_RELEASE_WAIT_MS)]).then(
      ([state, release]) => {
        if (token !== eyeToken.current) return; // une autre analyse a commencé entre-temps
        const note = engines.length
          ? release.freed
            ? `mémoire de l’analyse rendue après ${formatMs(release.ms)}`
            : `mémoire de l’analyse pas encore rendue après ${formatMs(release.ms)}, lancé quand même`
          : null;
        if (!state?.ready) {
          setEyeProgress((p) => (p?.sessionId === sessionId && p.waiting ? null : p));
          pendingEye.current = { sessionId, results, originals, meta };
          meta.eyeInfo ??= `modèles pas encore téléchargés${state?.error ? ` (${state.error})` : ''}`;
          setSession((s) => (s && s.id === sessionId ? { ...s, eyeInfo: meta.eyeInfo } : s));
          return;
        }
        runEye(sessionId, results, originals, meta, note);
        // Rien lancé (aucune photo, ou une analyse a commencé) : l'attente n'est plus affichée.
        if (!eyeRun.current) setEyeProgress((p) => (p?.sessionId === sessionId && p.waiting ? null : p));
      },
    );
  };

  /**
   * Nouvel œil en arrière-plan : une photo à la fois. Chaque résultat complète la photo (empreinte SigLIP 2, émotions
   * des visages) et les choix déjà faits sur elle ; à la fin, la séance est réenregistrée avec ces mesures.
   */
  const runEye = (sessionId: string, results: AnalyzeResult[], originals: Map<string, Blob>, meta: SavedSessionMeta, note: string | null = null, after?: () => void) => {
    // Jamais pendant une analyse : ses six moteurs et le nouvel œil ne doivent pas se disputer la mémoire (point 58).
    if (analysing.current) return;
    eyeRun.current?.cancel();
    const byId = new Map(results.map((r) => [r.item.id, r]));
    // Photos réellement analysées seulement : RAW et vidéos sont mis de côté, jamais décodés ; captures non plus.
    const photos = results
      .filter((r) => r.item.kind === 'photo' && !r.item.isRaw && r.item.camera !== false && !r.diagnostic.error && originals.has(r.item.id))
      .map((r) => ({ id: r.item.id, file: originals.get(r.item.id)!, boxes: mainFaces(r.item.faces).map((f) => f.box) }));
    if (photos.length === 0) return;
    setEyeProgress({ sessionId, label: sessionLabel(results), done: 0, total: photos.length });
    // Les informations du rapport décrivent ce passage-ci (une erreur d'un passage précédent n'est plus vraie).
    meta.eyeInfo = null;
    meta.eyeStart = null;
    let handled = 0;
    let succeeded = 0;
    eyeRun.current = runEyeInBackground(
      photos,
      (response) => {
        const result = byId.get(response.id);
        if (!result) return;
        if (response.ok) {
          succeeded++;
          result.item.clip = response.clip;
          mainFaces(result.item.faces).forEach((face, i) => {
            face.emotion = response.emotions[i] ?? null;
            face.clip = response.faceClips?.[i] ?? null;
          });
          result.item.eyeV = config.ranker.eyeVersion;
          result.diagnostic.eyeMs = response.ms;
          // Choix déjà faits sur cette photo pendant que l'œil travaillait : complétés (empreinte, émotions, visages).
          const key = photoKey(result.item);
          const existing = recordsRef.current.find((r) => r.key === key);
          const patched = existing ? eyePatches([existing], [result.item])[0] : undefined;
          if (patched) {
            // Complété sur la version en cours du choix (un choix plus récent n'est pas remplacé par l'ancien).
            setRecords((list) => list.map((r) => (r.key === key ? withEye(r, patched) : r)));
            void saveChoice(withEye(existing!, patched));
          }
        } else meta.eyeInfo ??= response.error;
        // Mesures gardées au fur et à mesure : si iOS ferme l'app en route, elles ne sont pas perdues.
        if (++handled % 50 === 0) void updateSessionMeasures(sessionId, results, meta);
        setEyeProgress((p) => (p && p.sessionId === sessionId ? { ...p, done: p.done + 1 } : p));
      },
      (error, attempts, firstError) => {
        if (error) meta.eyeInfo ??= error;
        const load =
          error && succeeded === 0
            ? `non chargé après ${attempts} essai${attempts > 1 ? 's' : ''}`
            : attempts > 1
              ? `chargé au ${attempts}e essai (avant : ${firstError ?? '?'})`
              : 'chargé du premier coup';
        meta.eyeStart = [note, load].filter(Boolean).join(' · ');
        eyeRun.current = null;
        setEyeProgress((p) => (p && p.sessionId === sessionId ? { ...p, total: p.done, finished: true } : p));
        setSession((s) => (s && s.id === sessionId ? { ...s, eyeInfo: meta.eyeInfo, eyeStart: meta.eyeStart } : s));
        // Mesures gardées avec la séance (reprise, réouverture), sans toucher à ses réglages, à son état (terminée) ni à
        // la séance ouverte ; rien si elle a été effacée entre-temps.
        void updateSessionMeasures(sessionId, results, meta);
        // Choix faits pendant que le nouvel œil travaillait : complétés avec ses mesures.
        applyEyePatches(results.map((r) => r.item));
        // Rattrapage : la séance gardée suivante (27/11 : une seule séance revue par lancement, c'était trop peu).
        after?.();
      },
    );
  };

  // Séance reprise ou rouverte (iOS a fermé l'app, mise à jour installée) : le nouvel œil s'était arrêté en route et
  // ne repartait jamais ; il reprend sur les aperçus gardés, pour les photos qui n'ont pas encore ses mesures (25/11).
  const eyeResumed = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.originals.size > 0 || !models?.ready || eyeRun.current || analysing.current || eyeResumed.current === session.id) return;
    eyeResumed.current = session.id;
    const missing = new Map<string, Blob>();
    for (const r of session.results)
      if (r.preview && r.item.kind === 'photo' && !r.item.isRaw && r.item.camera !== false && !r.diagnostic.error && needsEye(r.item))
        missing.set(r.item.id, r.preview);
    if (missing.size === 0) return;
    const token = eyeToken.current;
    // Puis les séances gardées qui attendent encore le nouvel œil (27/11).
    runEye(session.id, session.results, missing, sessionMeta(session), null, () => {
      if (eyeToken.current === token) void catchUpEye(session.id);
    });
  }, [session, models]);

  // Rattrapage (25/11) : séances gardées dont des photos n'ont jamais eu les mesures du nouvel œil (arrêté en route
  // avant le réglage 16 quinquies). Une séance à la fois, quand aucune séance n'est en cours d'utilisation, à partir de
  // ses aperçus, puis la suivante (27/11 : enchaînées jusqu'à la dernière). Les choix sont complétés à la fin.
  const eyeCaughtUp = useRef(false);
  /** Séances déjà passées par le rattrapage depuis l'ouverture de l'app : jamais deux fois (une photo que l'œil ne
   *  sait pas lire ne relance pas la même séance en boucle). */
  const eyeTried = useRef(new Set<string>());
  /** Lance le nouvel œil sur la première séance gardée (autre que `skip`) dont des photos n'ont pas ses mesures.
   *  Rend le nombre de photos lancées (0 : rien à faire). */
  const catchUpEye = async (skip?: string): Promise<number> => {
    const needs = (it: MediaItem) => it.kind === 'photo' && !it.isRaw && it.camera !== false && needsEye(it);
    for (const s of await listSessions()) {
      if (s.sessionId === skip || eyeTried.current.has(s.sessionId)) continue;
      if (!(await loadSessionItems(s.sessionId)).some(needs)) continue;
      const saved = await loadSessionById(s.sessionId);
      if (!saved || eyeRun.current || analysing.current) return 0;
      const results = saved.results.map((r) => ({ ...r, frame: null })) as AnalyzeResult[];
      const missing = new Map<string, Blob>();
      for (const r of results) if (r.preview && !r.diagnostic.error && needs(r.item)) missing.set(r.item.id, r.preview);
      if (missing.size === 0) continue;
      eyeTried.current.add(s.sessionId);
      // Puis la suivante, tant qu'aucune analyse ne commence (`runEye` refuse alors de démarrer).
      const token = eyeToken.current;
      runEye(s.sessionId, results, missing, saved.meta, null, () => {
        if (eyeToken.current === token) void catchUpEye(skip);
      });
      return missing.size;
    }
    return 0;
  };
  useEffect(() => {
    if (!models?.ready || (session && !closed) || eyeRun.current || analysing.current || eyeCaughtUp.current) return;
    eyeCaughtUp.current = true;
    void catchUpEye(session?.id);
  }, [models, session, closed]);

  /**
   * « Lancer le nouvel œil » (utilisateur, 26/11) : d'abord la séance ouverte, à partir de ses aperçus, puis les séances
   * gardées. Rend le nombre de photos lancées (0 : toutes ont déjà ses mesures, ou il tourne déjà).
   */
  const launchEye = async (): Promise<number> => {
    if (eyeRun.current || analysing.current || !models?.ready) return 0;
    // Demandé par l'utilisateur : les séances déjà essayées depuis l'ouverture peuvent être retentées.
    eyeTried.current.clear();
    const token = eyeToken.current;
    const next = () => {
      if (eyeToken.current === token) void catchUpEye(session && !closed ? session.id : undefined);
    };
    if (session && !closed) {
      const missing = new Map<string, Blob>();
      for (const r of session.results)
        if (r.preview && r.item.kind === 'photo' && !r.item.isRaw && r.item.camera !== false && !r.diagnostic.error && needsEye(r.item))
          missing.set(r.item.id, r.preview);
      if (missing.size > 0) {
        runEye(session.id, session.results, missing, sessionMeta(session), null, next);
        return missing.size;
      }
    }
    return catchUpEye(session && !closed ? session.id : undefined);
  };

  /** Complète les choix sans mesures du nouvel œil avec celles des photos données (voir `eyePatches`). */
  const applyEyePatches = (items: MediaItem[]) => {
    const patches = new Map(eyePatches(recordsRef.current, items).map((r) => [r.key, r]));
    if (patches.size === 0) return;
    const merged: ChoiceRecord[] = [];
    for (const r of recordsRef.current) {
      const p = patches.get(r.key);
      if (p) merged.push(withEye(r, p));
    }
    void saveChoices(merged);
    const byKey = new Map(merged.map((r) => [r.key, r]));
    setRecords((list) => list.map((r) => (byKey.has(r.key) ? withEye(r, byKey.get(r.key)!) : r)));
  };

  // Au lancement, une fois les choix lus : les séances gardées complètent les choix faits avant la fin du nouvel œil
  // (rattrape les séances déjà triées, 25/11).
  const backfilled = useRef(false);
  useEffect(() => {
    if (!recordsLoaded || backfilled.current) return;
    backfilled.current = true;
    void (async () => {
      const items: MediaItem[] = [];
      for (const s of await listSessions()) items.push(...(await loadSessionItems(s.sessionId)));
      applyEyePatches(items);
    })();
  }, [recordsLoaded]);

  const start = async (files: File[]) => {
    startedRef.current = true;
    eyeToken.current++;
    pendingEye.current = null;
    eyeRun.current?.cancel();
    eyeRun.current = null;
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
    // Mémoire iOS : le téléchargement des modèles du nouvel œil s'arrête pendant l'analyse, il reprend juste après.
    analysing.current = true;
    if (modelsDownload.current) {
      modelsDownload.current.abort();
      modelsDownload.current = null;
      resumeModels.current = true;
    }

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

    // Analyse interrompue (iOS a fermé l'app) : les photos déjà analysées sont reprises telles quelles.
    const partial = await loadPartialResults(APP_VERSION);
    // Enregistrements en cours : attendus avant l'effacement final, sinon un retardataire resterait sur l'iPhone.
    const partialSaves: Promise<void>[] = [];
    let reused = 0;
    // Tous les modèles ont démarré : sinon les photos analysées sans eux ne sont pas gardées pour une reprise.
    const allModels = Boolean(detector && objectDetector && segmenter && embedder && classifier && gestures);

    for (let i = 0; i < files.length && !cancelRef.current; i++) {
      const file = files[i]!;
      setProgress({ done: i, total: files.length, name: file.name });
      markProgress(i + 1, files.length);
      void wake.ensure();
      const signature = fileSignature(file);
      const previous = partial.get(signature);
      if (previous) {
        const id = `m${i + 1}`;
        const result: AnalyzeResult = { ...previous, item: { ...previous.item, id }, diagnostic: { ...previous.diagnostic, id }, frame: null };
        reused++;
        results.push(result);
        originals.set(id, file);
        if (result.thumbnail) thumbnails.set(id, URL.createObjectURL(result.thumbnail));
        if (result.preview) previews.set(id, URL.createObjectURL(result.preview));
        continue;
      }
      const result = await analyzer.analyze(`m${i + 1}`, file);
      const frame = result.frame;
      result.frame = null;
      // Un modèle a échoué sur cette photo (souvent faute de mémoire) : mesures incomplètes, à refaire en cas de reprise.
      let incomplete = false;
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
            incomplete = true;
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
            incomplete = true;
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
            incomplete = true;
            faceError ??= `modèles : ${e instanceof Error ? e.message : String(e)}`;
          }
          if (segmenter || embedder || classifier || gestures) result.diagnostic.modelsMs = performance.now() - t;
        }
        frame.bitmap.close();
      }
      results.push(result);
      // Gardée tout de suite : si iOS ferme l'app plus loin, elle ne sera pas refaite. Une photo en échec ou mesurée sans
      // tous les modèles (souvent faute de mémoire, juste avant la fermeture) n'est pas gardée : elle sera retentée.
      if (!result.diagnostic.error && !incomplete && allModels) partialSaves.push(savePartialResult(signature, result, APP_VERSION));
      // Le fichier d'origine reste sur l'iPhone ; on garde seulement sa référence, pour le zoom en pleine définition.
      originals.set(result.item.id, file);
      if (result.thumbnail) thumbnails.set(result.item.id, URL.createObjectURL(result.thumbnail));
      if (result.preview) previews.set(result.item.id, URL.createObjectURL(result.preview));
    }

    analyzer.dispose();
    // Moteurs de l'analyse suivis sans être retenus : le nouvel œil attend que Safari ait rendu leur mémoire.
    const engines = [detector, objectDetector, segmenter, embedder, classifier, gestures].flatMap((e) => (e ? [new WeakRef<object>(e)] : []));
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
    // Analyse finie (ou arrêtée par l'utilisateur) : plus rien à reprendre.
    void Promise.all(partialSaves).then(clearPartialResults);
    // Modèles de l'analyse fermés : le téléchargement des modèles du nouvel œil peut reprendre.
    analysing.current = false;
    if (resumeModels.current) {
      resumeModels.current = false;
      void downloadModels();
    }
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
      resumed: reused,
      // Photos déjà triées avant cette séance (25/11) : signalées, pour pouvoir sortir la séance des statistiques.
      retriaged: (() => {
        const known = new Set(recordsRef.current.map((r) => r.key));
        return results.filter((r) => known.has(photoKey(r.item))).length;
      })(),
      eyeInfo: null as string | null,
    };
    setSession({ id: String(launchedAt), results, thumbnails, previews, originals, ...meta });
    // Gardée sur l'iPhone : reprise si iOS ferme l'app pendant qu'on est dans une autre app.
    void saveSession(String(launchedAt), results, meta).then(refreshSeances);
    // « Nouvel œil » après l'analyse, dans son propre fil, pendant que l'utilisateur trie (réglage 13 bis) : les modèles
    // de l'analyse sont déjà fermés, la mémoire ne s'additionne plus.
    // Nouvel œil sur les aperçus (1080 px, déjà tournés) plutôt que sur les photos d'origine (12 Mpx) : 25/11, 5,2 s par
    // photo sur les originaux contre 1,9 s sur les aperçus ; mêmes images qu'à la reprise d'une séance.
    const eyeImages = new Map(results.flatMap((r) => (r.preview ? [[r.item.id, r.preview] as const] : [])));
    if (!cancelRef.current) startEye(String(launchedAt), results, eyeImages, meta, engines);
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
  const validatePose = ({ task, kept, ms, tie, why, note, weak }: EclairResult) => {
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
      // Revalidée d'un geste rapide (retour en arrière, « Tout revoir ») : le temps déjà passé sur la pose compte, sinon
      // une validation faite en regardant serait écartée comme « trop rapide ».
      ms: Math.max(ms, previous?.ms ?? 0),
      ...(tie ? { tie: true } : {}),
      ...(why.length ? { why } : {}),
      ...(note ? { note } : {}),
      ...(weak ? { weak: true } : {}),
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
      excluded={excluded}
      onToggleCounted={toggleCounted}
      shadow={shadow}
      models={models}
      onRetryModels={retryModels}
      eyeProgress={eyeProgress}
      onLaunchEye={launchEye}
      seances={seances}
      currentId={closed ? null : (session?.id ?? null)}
      onReopen={(id) => void reopen(id)}
      onDeleteSession={(id) => void removeSaved(id)}
      onClose={onClose}
      onLabo={validations.length > 0 ? () => setLaboOpen(true) : undefined}
    />
  );

  if (laboOpen)
    return (
      <Labo
        validations={validations}
        records={records}
        excluded={excluded}
        learned={learned}
        seances={seances}
        tasteEffect={tasteEffect}
        eyeProgress={eyeProgress}
        onLaunchEye={launchEye}
        onClose={() => {
          setLaboOpen(false);
          window.scrollTo({ top: 0 });
        }}
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
        onLabo={validations.length > 0 ? () => setLaboOpen(true) : undefined}
        seances={seances.length}
        models={models}
        onRetryModels={retryModels}
        eyeProgress={eyeProgress}
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
      records={records}
    />
  );

  return (
    <>
      <BandeauMiseAJour />
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
          choices={pageChoices}
          previousRun={runs.previous}
          onNewDay={(files) => void start(files)}
          onChoose={choose}
          onComment={comment}
          onGoDelete={() => goTab('supprimer')}
          eclair={{ pending: pending.length, sure: sureLeft.length, total: queue.length }}
          onEclair={openEclair}
          recovering={recovering}
          onRecoverImages={(files) => void recoverImages(files)}
          eyeProgress={eyeProgress}
        />
      ) : tab === 'supprimer' ? (
        <ASupprimer session={session} day={day} choices={choices} onChoose={choose} onComment={comment} onConfirm={confirmPacks} onUnconfirm={unconfirmPacks} onFinished={finish} unverified={pending.length} onVerify={() => openEclair('suite')} />
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
