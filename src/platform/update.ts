// Suivi de la mise à jour de l'app : le service worker (la partie qui garde l'app sur l'iPhone pour fonctionner hors
// ligne) télécharge la nouvelle version en entier en arrière-plan ; elle ne s'installe qu'à la prochaine ouverture.

export type UpdateStatus = 'telechargement' | 'prete' | null;

/** Appelle `onChange` quand une mise à jour se télécharge, puis quand elle est prête. Renvoie de quoi arrêter le suivi. */
export function watchUpdate(onChange: (status: UpdateStatus) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  let stopped = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const follow = (worker: ServiceWorker | null) => {
    if (!worker || stopped) return;
    // Première installation : rien à annoncer, l'app tourne déjà.
    if (!hadController) return;
    const update = () => {
      if (stopped) return;
      if (worker.state === 'installing') onChange('telechargement');
      else if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') onChange('prete');
      else if (worker.state === 'redundant') onChange(null);
    };
    update();
    worker.addEventListener('statechange', update);
  };
  void navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration || stopped) return;
    follow(registration.installing ?? registration.waiting);
    registration.addEventListener('updatefound', () => follow(registration.installing));
  });
  return () => {
    stopped = true;
  };
}

/**
 * À l'ouverture de l'app, avant tout travail : si une nouvelle version est prête, on la met en place puis on recharge
 * la page (une seule fois). Jamais en cours d'utilisation : une version qui changerait sous les pieds de l'app
 * casserait le chargement de ses morceaux (fil d'analyse, nouvel œil) — audit du 24/11.
 * Renvoie vrai si la page va être rechargée.
 */
export async function applyPendingUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const waiting = registration?.waiting;
    if (!waiting || !navigator.serviceWorker.controller) return false;
    let started = false;
    const switched = new Promise<boolean>((resolve) => {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          // Bascule tardive (l'app a déjà démarré) : rechargement seulement si l'app ne fait rien ; sinon la nouvelle
          // version sera simplement là à la prochaine ouverture.
          if (started && isBusy()) return;
          window.location.reload();
          resolve(true);
        },
        { once: true },
      );
      setTimeout(() => resolve(false), 15000);
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    const ok = await switched;
    started = true;
    return ok;
  } catch {
    return false;
  }
}

/** L'app est-elle occupée (analyse, séance ouverte) ? Tenu à jour par l'app : une mise à jour n'interrompt jamais un travail. */
let busy = false;
export const setBusy = (value: boolean): void => {
  busy = value;
};
const isBusy = (): boolean => busy;
