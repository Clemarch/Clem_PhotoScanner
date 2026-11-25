import { useState } from 'react';
import type { EyeProgress } from './session';

/**
 * Nouvel œil : barre de progression bien visible (utilisateur, 26/11 : « un élément bien visible qui permet de voir où
 * en est l'analyse de l'œil »), et, dans Réglages, un bouton pour le lancer soi-même.
 */
export function BarreOeil({ progress, onLaunch }: { progress: EyeProgress | null; onLaunch?: () => Promise<number> }) {
  const [message, setMessage] = useState<string | null>(null);
  const running = progress && !progress.finished;
  if (!running && !onLaunch) return null;

  if (running) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <section className="carte-oeil" role="status">
        <div className="carte-oeil-tete">
          <strong>👁 Nouvel œil</strong>
          <span className="doux">{progress.waiting ? 'démarre…' : `${progress.done} / ${progress.total}`}</span>
        </div>
        <div className={`barre${progress.waiting ? ' attente' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: progress.waiting ? '100%' : `${pct}%` }} />
        </div>
        <p className="note">
          {progress.waiting
            ? `Il démarre dans un instant (l’iPhone libère la mémoire de l’analyse) : ${progress.total} photos de la ${progress.label} à regarder.`
            : `Il regarde les photos de la ${progress.label} en arrière-plan (environ 1 s chacune). Vous pouvez trier pendant ce temps ; gardez l’app ouverte.`}
        </p>
      </section>
    );
  }

  return (
    <section className="carte-oeil">
      <div className="carte-oeil-tete">
        <strong>👁 Nouvel œil</strong>
        <span className="doux">{progress?.finished ? `${progress.label} : terminé ✓` : 'au repos'}</span>
      </div>
      <p className="note">
        Il regarde chaque photo pour apprendre vos goûts. Il se lance tout seul après chaque analyse ; ce bouton le relance
        sur les photos qu’il n’a pas encore vues (une séance à la fois).
      </p>
      <button
        className="bouton"
        onClick={async () => {
          const n = await onLaunch!();
          setMessage(n > 0 ? `Lancé sur ${n} photo${n > 1 ? 's' : ''}.` : 'Toutes les photos ont déjà été regardées ✓');
        }}
      >
        Lancer le nouvel œil
      </button>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
