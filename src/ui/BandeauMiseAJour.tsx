import { useEffect, useState } from 'react';
import { applyPendingUpdate, watchUpdate, type UpdateStatus } from '../platform/update';

/**
 * Nouvelle version, annoncée partout (pas seulement sur l'accueil, que l'on ne voit plus pendant une séance) : on
 * l'installe d'un toucher ; la séance en cours est gardée et reprise telle quelle (25/11).
 */
export function BandeauMiseAJour() {
  const [update, setUpdate] = useState<UpdateStatus>(null);
  useEffect(() => watchUpdate(setUpdate), []);
  if (update !== 'prete') return null;
  return (
    <div className="info alerte-bloc bandeau-maj">
      <p>Nouvelle version prête. Votre séance et vos choix sont gardés.</p>
      <button className="bouton principal" onClick={() => void applyPendingUpdate()}>
        Installer maintenant
      </button>
    </div>
  );
}
