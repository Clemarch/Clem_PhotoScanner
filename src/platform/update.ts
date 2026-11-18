// Suivi de la mise à jour de l'app : le service worker (la partie qui garde l'app sur l'iPhone pour fonctionner hors
// ligne) télécharge la nouvelle version en entier, modèles compris, avant de la mettre en place.

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
