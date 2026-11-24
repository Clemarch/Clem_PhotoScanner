import type { ModelsState } from '../platform/storage/models';

const mo = (bytes: number) => Math.round(bytes / 1_000_000);

/** Modèles du nouvel œil : prêts, en cours de téléchargement (avec la progression), ou en échec (avec « Réessayer »). */
export function EtatModeles({ models, onRetry }: { models: ModelsState | null; onRetry: () => void }) {
  if (!models) return null;
  if (models.ready) return <p className="note centre">Modèles d’analyse prêts ✓ (nouvel œil compris)</p>;
  const pct = Math.round((models.done / models.total) * 100);
  return (
    <section className={models.error ? 'alerte alerte-bloc' : 'info alerte-bloc'}>
      <p>
        <strong>Modèles du nouvel œil : {pct} %</strong> ({mo(models.done)} / {mo(models.total)} Mo, une seule fois).{' '}
        {models.error
          ? `Téléchargement interrompu (${models.error}).`
          : 'Gardez l’app ouverte, en Wi-Fi de préférence. Vous pouvez déjà analyser : le nouvel œil s’ajoutera dès qu’ils seront là.'}
      </p>
      <div className="barre" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      {models.error && (
        <button className="bouton principal" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </section>
  );
}
