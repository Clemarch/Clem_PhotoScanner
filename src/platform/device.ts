// Informations sur l'appareil et le navigateur, pour l'écran de diagnostic.

export interface DeviceReport {
  userAgent: string;
  installed: boolean;
  offlineReady: boolean;
  cores: number | null;
  screen: string;
  support: Record<string, boolean>;
  storageUsedMB: number | null;
  storageQuotaMB: number | null;
  /** Stockage déclaré durable : iOS ne l'efface pas de lui-même (choix et apprentissage protégés). */
  persisted: boolean | null;
  /** Mémoire utilisée par la page, si le navigateur accepte de la donner (Safari refuse). */
  jsHeapMB: number | null;
}

interface ChromeMemory {
  usedJSHeapSize: number;
}

export function readJsHeapMB(): number | null {
  const memory = (performance as unknown as { memory?: ChromeMemory }).memory;
  return memory ? memory.usedJSHeapSize / 1_048_576 : null;
}

/** App ouverte depuis l'écran d'accueil (installée), et non dans un onglet Safari. */
export function isInstalled(): boolean {
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * Demande que le stockage de l'app soit durable. Sans cela, Safari peut effacer les choix enregistrés d'un site
 * resté sans visite pendant 7 jours ; une app installée sur l'écran d'accueil est mieux protégée.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? null;
  } catch {
    return null;
  }
}

export async function readDeviceReport(): Promise<DeviceReport> {
  let storageUsedMB: number | null = null;
  let storageQuotaMB: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      storageUsedMB = (estimate.usage ?? 0) / 1_048_576;
      storageQuotaMB = (estimate.quota ?? 0) / 1_048_576;
    }
  } catch {
    // Information facultative.
  }
  let persisted: boolean | null = null;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    // Information facultative.
  }
  const standalone = isInstalled();

  return {
    userAgent: navigator.userAgent,
    installed: standalone,
    offlineReady: Boolean(navigator.serviceWorker?.controller),
    cores: navigator.hardwareConcurrency ?? null,
    screen: `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`,
    support: {
      'Worker': typeof Worker !== 'undefined',
      'createImageBitmap': typeof createImageBitmap === 'function',
      'OffscreenCanvas': typeof OffscreenCanvas !== 'undefined',
      'Wake Lock': 'wakeLock' in navigator,
      'Service worker': 'serviceWorker' in navigator,
      'Mesure mémoire': readJsHeapMB() !== null,
    },
    storageUsedMB,
    storageQuotaMB,
    persisted,
    jsHeapMB: readJsHeapMB(),
  };
}

export interface ScreenAwake {
  /** Vrai si l'écran est actuellement tenu allumé (verrou système ou vidéo de secours). */
  readonly active: boolean;
  /** Redemande le verrou s'il a été perdu ; à appeler régulièrement pendant l'analyse. */
  ensure: () => Promise<void>;
  /** Résumé lisible pour le rapport : méthode, reprises, ou raison de l'échec. */
  describe: () => string;
  release: () => void;
}

/**
 * Empêche l'écran de se verrouiller pendant l'analyse.
 * 1. Verrou d'écran du système (Wake Lock) : iOS le retire dès que la page passe en arrière-plan
 *    (notification, appel, sélecteur de photos), d'où la redemande automatique au retour et à chaque photo.
 * 2. Secours si le système refuse : une vidéo muette de 2 secondes, invisible, lue en boucle (iOS ne verrouille
 *    pas l'écran pendant qu'une vidéo joue).
 */
export function keepScreenAwake(): ScreenAwake {
  let sentinel: WakeLockSentinel | null = null;
  let lastError: string | null = null;
  let reacquired = 0;
  let acquiredOnce = false;
  let released = false;
  let video: HTMLVideoElement | null = null;

  const videoPlaying = () => video !== null && !video.paused && !video.ended;

  const acquire = async (): Promise<void> => {
    if (released || document.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      sentinel = lock;
      lastError = null;
      if (acquiredOnce) reacquired += 1;
      acquiredOnce = true;
      lock.addEventListener('release', () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch (e) {
      sentinel = null;
      lastError = e instanceof Error ? `${e.name}${e.message ? ` : ${e.message}` : ''}` : String(e);
    }
  };

  const startVideo = async (): Promise<void> => {
    if (released) return;
    try {
      if (!video) {
        video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('aria-hidden', 'true');
        video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
        video.src = new URL('nosleep.mp4', document.baseURI).href;
        document.body.appendChild(video);
      }
      if (video.paused) await video.play();
    } catch (e) {
      lastError = `${lastError ?? 'verrou refusé'} · vidéo : ${e instanceof Error ? e.name : String(e)}`;
    }
  };

  // Une seule vérification à la fois : évite de demander deux verrous si le retour au premier plan et la photo
  // suivante tombent au même moment.
  let pending: Promise<void> | null = null;
  const ensure = (): Promise<void> => {
    pending ??= (async () => {
      try {
        await acquire();
        // Le secours ne sert que si le verrou système n'est pas là.
        if (!sentinel || sentinel.released) await startVideo();
        else if (video && !video.paused) video.pause();
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void ensure();
  };
  document.addEventListener('visibilitychange', onVisible);
  void ensure();

  return {
    get active() {
      return (sentinel !== null && !sentinel.released) || videoPlaying();
    },
    ensure,
    describe: () => {
      const method = sentinel && !sentinel.released ? 'verrou système' : videoPlaying() ? 'vidéo de secours' : 'aucune';
      const parts = [method, reacquired > 0 ? `${reacquired} reprise${reacquired > 1 ? 's' : ''}` : null, lastError ? `erreur : ${lastError}` : null];
      return parts.filter(Boolean).join(' · ');
    },
    release: () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
      if (video) {
        video.pause();
        video.remove();
        video = null;
      }
    },
  };
}

// Témoin d'analyse en cours : s'il est encore là au lancement, c'est que l'app a été coupée en route.
const PROGRESS_KEY = 'photo-triage.analyse-en-cours';

export interface InterruptedRun {
  done: number;
  total: number;
}

export function markProgress(done: number, total: number): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ done, total }));
  } catch {
    // Stockage indisponible : sans conséquence.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Idem.
  }
}

export function readInterruptedRun(): InterruptedRun | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InterruptedRun>;
    if (typeof parsed.done === 'number' && typeof parsed.total === 'number') return { done: parsed.done, total: parsed.total };
  } catch {
    // Valeur illisible : on l'ignore.
  }
  return null;
}
