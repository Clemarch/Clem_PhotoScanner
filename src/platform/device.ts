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

/** Empêche l'écran de se verrouiller pendant l'analyse. Renvoie une fonction pour relâcher. */
export async function keepScreenAwake(): Promise<{ active: boolean; release: () => void }> {
  try {
    const lock = await navigator.wakeLock.request('screen');
    return { active: true, release: () => void lock.release().catch(() => undefined) };
  } catch {
    return { active: false, release: () => undefined };
  }
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
