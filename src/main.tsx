import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/style.css';
import { applyPendingUpdate } from './platform/update';

// Nouvelle version prête : mise en place d'abord (la page se recharge), puis l'app démarre.
void applyPendingUpdate().then((reloading) => {
  if (reloading) return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
