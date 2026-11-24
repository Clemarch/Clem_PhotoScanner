import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { config, type PoseTask } from '../../engine';
import { isLandscape, plural } from '../format';
import { IconCoche, IconCroix, IconEtoile, IconFermer, IconFleche } from '../icons';

export interface EclairResult {
  task: PoseTask;
  kept: Set<string>;
  ms: number;
}

interface Props {
  tasks: PoseTask[];
  previews: Map<string, string>;
  thumbnails: Map<string, string>;
  numberOf: (id: string) => number | null;
  onValidate: (result: EclairResult) => void;
  onClose: () => void;
  /** Aller à l'onglet Supprimer. */
  onFinish: () => void;
}

/**
 * Tri éclair (jalon 6) : une pose par écran, photos en grand, la proposition de l'app déjà cochée. Un toucher bascule
 * garder ↔ supprimer, « Valider » passe à la suivante. Chaque pose validée apprend à l'app vos vrais choix.
 */
export function TriEclair({ tasks, previews, thumbnails, numberOf, onValidate, onClose, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState<Set<string>>(() => new Set(tasks[0]?.proposed ?? []));
  const [zoom, setZoom] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, EclairResult>>(new Map());
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const task = tasks[index];

  // Nouvelle pose : sélection reprise (si déjà validée) ou proposition de l'app.
  useEffect(() => {
    if (!task) return;
    setKept(new Set(results.get(task.key)?.kept ?? task.proposed));
    setZoom(null);
    shownAt.current = Date.now();
  }, [index]);

  const url = (id: string) => previews.get(id) ?? thumbnails.get(id);
  const toggle = (id: string) =>
    setKept((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const validate = () => {
    if (!task) return;
    const result = { task, kept: new Set(kept), ms: Date.now() - shownAt.current };
    setResults((map) => new Map(map).set(task.key, result));
    onValidate(result);
    setIndex((i) => i + 1);
  };

  const summary = useMemo(() => {
    const list = [...results.values()];
    // Justesse de l'app elle-même (sa proposition, pas un choix que vous aviez déjà fait).
    // Mêmes règles que la justesse des Réglages : photos seules et poses validées trop vite écartées.
    const same = (r: EclairResult) => r.kept.size === r.task.appProposed.size && [...r.kept].every((id) => r.task.appProposed.has(id));
    // Acceptée trop vite sans rien changer : écartée ; une correction, même rapide, compte.
    const counted = list.filter((r) => r.task.items.length > 1 && (r.ms >= config.triage.minValidMs || !same(r)));
    const right = counted.filter(same).length;
    const removed = list.reduce((n, r) => n + r.task.items.filter((it) => !r.kept.has(it.id)).length, 0);
    return { poses: list.length, counted: counted.length, right, removed };
  }, [results]);

  if (!task) {
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    return (
      <div className="eclair" role="dialog" aria-label="Tri éclair terminé">
        <header className="eclair-haut">
          <button className="vis-fermer" onClick={onClose} aria-label="Fermer">
            <IconFermer size={17} />
          </button>
          <span />
          <span />
        </header>
        <section className="eclair-fin">
          <span className="heros-icone vert">
            <IconCoche size={30} />
          </span>
          <h2>Tri terminé</h2>
          <p className="doux">
            {plural(summary.poses, 'pose')} en {seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`}.
          </p>
          {summary.counted > 0 && (
            <p className="eclair-score">
              L’app avait vu juste sur <strong>{summary.right}</strong> {summary.right > 1 ? 'poses' : 'pose'} sur {summary.counted} (
              {Math.round((summary.right / summary.counted) * 100)} %). Chaque pose validée lui apprend vos goûts.
            </p>
          )}
          <button className="bouton danger grand" onClick={onFinish}>
            Supprimer dans Photos <IconFleche size={18} />
          </button>
          <button className="lien" onClick={onClose}>
            Revenir aux paquets
          </button>
        </section>
      </div>
    );
  }

  const removeCount = task.items.length - task.items.filter((it) => kept.has(it.id)).length;
  const keepCount = task.items.length - removeCount;
  const best = [...task.items].sort((a, b) => (task.pack.scores.get(b.id)?.score ?? 0) - (task.pack.scores.get(a.id)?.score ?? 0))[0]!;
  const zoomItem = zoom ? task.items.find((it) => it.id === zoom) ?? null : null;

  return (
    <div className="eclair" role="dialog" aria-label="Tri éclair">
      <header className="eclair-haut">
        <button className="vis-fermer" onClick={onClose} aria-label="Fermer">
          <IconFermer size={17} />
        </button>
        <span className="eclair-titre">
          <strong>
            Pose {index + 1} sur {tasks.length}
          </strong>
          <span>
            Paquet {task.packNumber} · {plural(task.items.length, 'photo')}
          </span>
        </span>
        <button className="lien" onClick={() => setIndex((i) => i + 1)}>
          Passer
        </button>
      </header>
      <div className="eclair-progres" aria-hidden="true">
        <div style={{ width: `${(index / tasks.length) * 100}%` }} />
      </div>

      <div className={`eclair-grille n${Math.min(task.items.length, 5)}`}>
        {/* Paysage : toute la largeur (les photos s'empilent) ; portrait : deux par ligne (24/11). */}
        {task.items.map((it) => {
          const keep = kept.has(it.id);
          const src = url(it.id);
          return (
            <button
              key={it.id}
              className={`eclair-photo ${keep ? 'garde' : 'jete'} ${isLandscape(it) || task.items.length === 1 ? 'paysage' : 'portrait'}`}
              onClick={() => toggle(it.id)}
              aria-label={`Photo n° ${numberOf(it.id) ?? ''} : ${keep ? 'gardée' : 'supprimée'}. Toucher pour changer.`}
            >
              {src && <img src={src} alt="" decoding="async" draggable={false} />}
              <span className="numero">{numberOf(it.id)}</span>
              {it.id === best.id && task.items.length > 1 && (
                <span className="etoile">
                  <IconEtoile size={11} />
                </span>
              )}
              {task.review.has(it.id) && <span className="eclair-presque">presque aussi bonne</span>}
              <span className={`eclair-etat ${keep ? 'garde' : 'jete'}`}>{keep ? <IconCoche size={15} /> : <IconCroix size={13} />}</span>
              <span
                className="eclair-loupe"
                role="button"
                aria-label="Voir en grand"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(it.id);
                }}
              >
                ⤢
              </span>
            </button>
          );
        })}
      </div>

      <footer className="eclair-bas">
        <p className="note centre">Touchez une photo pour la garder ou la supprimer · ⤢ pour la voir en grand</p>
        <div className="eclair-actions">
          <button className="bouton eclair-retour" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} aria-label="Pose précédente">
            ‹
          </button>
          <button className="bouton principal grand eclair-valider" onClick={validate}>
            <span>Valider</span>
            <small>
              {keepCount} gardée{keepCount > 1 ? 's' : ''}
              {removeCount > 0 ? ` · ${removeCount} à supprimer` : ''}
            </small>
          </button>
        </div>
      </footer>

      {zoomItem && (
        <Loupe
          items={task.items}
          start={zoomItem.id}
          url={url}
          kept={kept}
          numberOf={numberOf}
          onToggle={toggle}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}

/** Photo en grand dans le tri éclair : double toucher pour zoomer (puis glisser), flèches pour les autres photos. */
function Loupe({
  items,
  start,
  url,
  kept,
  numberOf,
  onToggle,
  onClose,
}: {
  items: PoseTask['items'];
  start: string;
  url: (id: string) => string | undefined;
  kept: Set<string>;
  numberOf: (id: string) => number | null;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [at, setAt] = useState(() => Math.max(0, items.findIndex((it) => it.id === start)));
  const [big, setBig] = useState(false);
  const area = useRef<HTMLDivElement | null>(null);
  const lastTap = useRef(0);
  const item = items[at]!;
  const keep = kept.has(item.id);

  useEffect(() => setBig(false), [at]);

  const tap = (e: MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTap.current > 320) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    const el = area.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    setBig((b) => {
      const next = !b;
      // Zoom centré sur le point touché.
      requestAnimationFrame(() => {
        if (!next || !area.current) return;
        area.current.scrollLeft = fx * area.current.scrollWidth - rect.width / 2;
        area.current.scrollTop = fy * area.current.scrollHeight - rect.height / 2;
      });
      return next;
    });
  };

  return (
    <div className="loupe" role="dialog" aria-label="Photo en grand">
      <header className="vis-haut">
        <button className="vis-fermer" onClick={onClose} aria-label="Fermer">
          <IconFermer size={17} />
        </button>
        <span>
          Photo n° {numberOf(item.id)} · {at + 1} sur {items.length}
        </span>
        <span />
      </header>
      <div className={`loupe-image${big ? ' grande' : ''}`} ref={area} onClick={tap}>
        {url(item.id) && <img src={url(item.id)} alt="" draggable={false} />}
      </div>
      <p className="note centre">Touchez deux fois pour zoomer</p>
      <div className="eclair-actions loupe-actions">
        <button className="bouton eclair-retour" disabled={at === 0} onClick={() => setAt((i) => i - 1)} aria-label="Photo précédente">
          ‹
        </button>
        <button className={`bouton grand ${keep ? 'choisi-garder' : 'choisi-supprimer'}`} onClick={() => onToggle(item.id)}>
          {keep ? (
            <>
              <IconCoche size={16} /> Gardée
            </>
          ) : (
            <>
              <IconCroix size={15} /> À supprimer
            </>
          )}
        </button>
        <button className="bouton eclair-retour" disabled={at === items.length - 1} onClick={() => setAt((i) => i + 1)} aria-label="Photo suivante">
          ›
        </button>
      </div>
    </div>
  );
}
