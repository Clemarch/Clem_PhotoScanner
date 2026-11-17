import { useEffect, useRef, useState } from 'react';
import type { MediaItem, PackAnalysis } from '../../engine';
import { finalKeep, type Choice, type Choices } from '../choices';
import { formatTime } from '../format';
import { decisionText, reasonText, sceneLabel } from '../reasons';

export interface ViewerEntry {
  item: MediaItem;
  pack: PackAnalysis | null;
  packNumber: number | null;
}

interface Props {
  entries: ViewerEntry[];
  start: number;
  previews: Map<string, string>;
  thumbnails: Map<string, string>;
  choices: Choices;
  numberOf: (id: string) => number | null;
  onChoose: (entry: ViewerEntry, choice: Choice | null) => void;
  onClose: () => void;
}

/** Visionneuse plein écran : glisser à gauche ou à droite pour changer de photo. */
export function Visionneuse({ entries, start, previews, thumbnails, choices, numberOf, onChoose, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; t: number; horizontal: boolean | null; dx: number } | null>(null);
  const entry = entries[index]!;
  const go = (step: number) => setIndex((i) => Math.min(entries.length - 1, Math.max(0, i + step)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const { item, pack } = entry;
  const score = pack?.scores.get(item.id) ?? null;
  const decision = pack?.decisions.get(item.id) ?? null;
  const state = pack ? finalKeep(item, pack, choices) : null;
  const url = (id: string) => previews.get(id) ?? thumbnails.get(id);
  const number = numberOf(item.id);

  return (
    <div className="visionneuse" role="dialog" aria-label="Photo en grand">
      <header className="vis-haut">
        <button className="vis-fermer" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <span>
          {index + 1} / {entries.length}
        </span>
      </header>

      <div
        className="vis-image"
        onTouchStart={(e) => {
          const t = e.touches[0]!;
          touch.current = { x: t.clientX, y: t.clientY, t: Date.now(), horizontal: null, dx: 0 };
        }}
        onTouchMove={(e) => {
          const start = touch.current;
          if (!start) return;
          const t = e.touches[0]!;
          const mx = t.clientX - start.x;
          const my = t.clientY - start.y;
          if (start.horizontal === null && Math.hypot(mx, my) > 8) start.horizontal = Math.abs(mx) > Math.abs(my);
          if (start.horizontal) {
            start.dx = mx;
            setDx(mx);
          }
        }}
        onTouchEnd={() => {
          // Distance lue dans la référence, pas dans l'état React : un glissement rapide se termine
          // parfois avant que l'écran ait été redessiné.
          const start = touch.current;
          touch.current = null;
          const moved = start?.dx ?? 0;
          const fast = start !== null && Date.now() - start.t < 250 && Math.abs(moved) > 30;
          if (moved < -70 || (fast && moved < 0)) go(1);
          else if (moved > 70 || (fast && moved > 0)) go(-1);
          setDx(0);
        }}
      >
        <div className="vis-piste" style={{ transform: `translateX(calc(${-index * 100}% + ${dx}px))`, transition: dx ? 'none' : undefined }}>
          {entries.map((e, i) => (
            <div className="vis-cadre" key={e.item.id}>
              {Math.abs(i - index) <= 1 && url(e.item.id) && <img src={url(e.item.id)} alt="" decoding="async" draggable={false} />}
            </div>
          ))}
        </div>
        {index > 0 && (
          <button className="vis-fleche gauche" onClick={() => go(-1)} aria-label="Photo précédente">
            ‹
          </button>
        )}
        {index < entries.length - 1 && (
          <button className="vis-fleche droite" onClick={() => go(1)} aria-label="Photo suivante">
            ›
          </button>
        )}
      </div>

      <section className="vis-infos">
        <p className="vis-titre">
          {number !== null ? `Photo n° ${number}` : 'Photo sans date'} · {formatTime(item.capturedAt)}
          {entry.packNumber !== null && pack && (
            <span>
              {' '}
              · paquet {entry.packNumber}, {sceneLabel[pack.sceneOf.get(item.id) ?? pack.scene].toLowerCase()}, pose {decision?.pose}
            </span>
          )}
        </p>
        {state && (
          <p className={`vis-decision ${state.keep ? 'garder' : 'supprimer'}`}>
            {state.keep ? 'À garder' : 'À supprimer'}
            <span>
              {' '}
              ·{' '}
              {state.byUser
                ? 'votre choix'
                : decision
                  ? decisionText(decision, numberOf, (id) => pack?.scores.get(id)?.score, item.id)
                  : ''}
            </span>
          </p>
        )}
        {score && score.reasons.length > 0 && (
          <ul className="raisons">
            {score.reasons.map((reason) => (
              <li key={reason.code} className={reason.tone}>
                {reasonText(reason, numberOf)}
              </li>
            ))}
          </ul>
        )}
        {pack && state && (
          <div className="vis-choix">
            <button
              className={`bouton ${state.keep ? 'choisi-garder' : ''}`}
              onClick={() => onChoose(entry, state.byUser && state.keep ? null : 'garder')}
            >
              Garder
            </button>
            <button
              className={`bouton ${!state.keep ? 'choisi-supprimer' : ''}`}
              onClick={() => onChoose(entry, state.byUser && !state.keep ? null : 'supprimer')}
            >
              Supprimer
            </button>
          </div>
        )}
        {state?.byUser && (
          <button className="lien" onClick={() => onChoose(entry, null)}>
            Revenir au choix de l’app
          </button>
        )}
      </section>
    </div>
  );
}
