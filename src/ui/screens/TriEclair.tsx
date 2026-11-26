import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { config, type PoseTask, WHY_REASONS } from '../../engine';
import { isLandscape, plural } from '../format';
import { IconCoche, IconCroix, IconEtoile, IconFermer, IconFleche } from '../icons';

export interface EclairResult {
  task: PoseTask;
  kept: Set<string>;
  ms: number;
  /** « Les deux se valent » (point 65). */
  tie: boolean;
  /** « Pourquoi ? » : raisons de la correction (point 65). */
  why: string[];
}

/** Noms affichés des raisons de « Pourquoi ? ». */
const WHY_LABEL: Record<(typeof WHY_REASONS)[number], string> = {
  expression: 'Expression',
  regard: 'Regard',
  lumiere: 'Lumière',
  cadrage: 'Cadrage',
  naturel: 'Plus naturel',
};

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
  const [tie, setTie] = useState(false);
  const [why, setWhy] = useState<string[]>([]);
  const [results, setResults] = useState<Map<string, EclairResult>>(new Map());
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const task = tasks[index];

  // Nouvelle pose : sélection reprise (si déjà validée) ou proposition de l'app.
  useEffect(() => {
    if (!task) return;
    const done = results.get(task.key);
    setKept(new Set(done?.kept ?? task.proposed));
    setTie(done?.tie ?? false);
    setWhy(done?.why ?? []);
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
    // Raisons gardées seulement si la proposition a été corrigée (sinon elles n'expliquent rien).
    const corrected = task.items.some((it) => kept.has(it.id) !== task.proposed.has(it.id));
    const result = { task, kept: new Set(kept), ms: Date.now() - shownAt.current, tie, why: corrected && !tie ? why : [] };
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
    const counted = list.filter((r) => r.task.items.length > 1 && !r.tie && (r.ms >= config.triage.minValidMs || !same(r)));
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
  const corrected = task.items.some((it) => kept.has(it.id) !== task.proposed.has(it.id));
  const several = task.items.length > 1;

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
              {task.review.has(it.id) && (
                <span className="eclair-presque">
                  {task.pack.decisions.get(it.id)?.code === 'presque' ? 'presque aussi bonne' : 'prise par erreur ?'}
                </span>
              )}
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
        {/* Point 65 : deux gestes facultatifs qui apprennent le plus à l'app. « Pourquoi ? » n'apparaît que si vous avez
            corrigé sa proposition ; « se valent » retire la pose des mesures (ni juste, ni faux). */}
        {several && corrected && !tie && (
          <div className="eclair-pourquoi" role="group" aria-label="Pourquoi ce choix ? (facultatif)">
            <span className="doux">Pourquoi ?</span>
            {WHY_REASONS.map((r) => (
              <button
                key={r}
                className={`puce${why.includes(r) ? ' active' : ''}`}
                aria-pressed={why.includes(r)}
                onClick={() => setWhy((list) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]))}
              >
                {WHY_LABEL[r]}
              </button>
            ))}
          </div>
        )}
        {several && (
          <button className={`lien eclair-valent${tie ? ' actif' : ''}`} aria-pressed={tie} onClick={() => setTie((t) => !t)}>
            {tie ? '✓ ' : ''}
            {task.items.length > 2 ? 'Elles se valent' : 'Les deux se valent'}
          </button>
        )}
        {/* Rangée « Pourquoi ? » affichée : l'aide est masquée, pour laisser la place aux photos. */}
        {!(several && corrected && !tie) && <p className="note centre">Touchez une photo pour la garder ou la supprimer · ⤢ pour la voir en grand</p>}
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
          onValidate={() => {
            setZoom(null);
            validate();
          }}
          keepCount={keepCount}
          removeCount={removeCount}
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
  onValidate,
  keepCount,
  removeCount,
}: {
  items: PoseTask['items'];
  start: string;
  url: (id: string) => string | undefined;
  kept: Set<string>;
  numberOf: (id: string) => number | null;
  onToggle: (id: string) => void;
  onClose: () => void;
  /** Valider la pose sans revenir à la grille (utilisateur, 25/11). */
  onValidate: () => void;
  keepCount: number;
  removeCount: number;
}) {
  const [at, setAt] = useState(() => Math.max(0, items.findIndex((it) => it.id === start)));
  const [big, setBig] = useState(false);
  const area = useRef<HTMLDivElement | null>(null);
  const lastTap = useRef(0);
  const item = items[at]!;
  const keep = kept.has(item.id);

  useEffect(() => setBig(false), [at]);

  // Toutes les photos de la pose décodées d'avance : passer de l'une à l'autre est immédiat.
  useEffect(() => {
    for (const it of items) {
      const src = url(it.id);
      if (!src) continue;
      const img = new Image();
      img.src = src;
      void img.decode().catch(() => {});
    }
  }, [items]);

  // Glisser le doigt : à gauche ou à droite pour la photo suivante ou précédente, vers le bas pour revenir à la pose.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touch.current = !big && t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || big) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      lastTap.current = 0;
      setAt((i) => Math.min(items.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1))));
    } else if (dy > 90 && dy > Math.abs(dx) * 1.5) {
      onClose();
    }
  };

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
        <button className="bouton loupe-retour" onClick={onClose} aria-label="Revenir à la pose">
          ‹ Pose
        </button>
        <span>
          Photo n° {numberOf(item.id)} · {at + 1} sur {items.length}
        </span>
        <span />
      </header>
      <div className={`loupe-image${big ? ' grande' : ''}`} ref={area} onClick={tap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {url(item.id) && <img src={url(item.id)} alt="" draggable={false} />}
      </div>
      {items.length > 1 && (
        <div className="loupe-points" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.id} className={`${i === at ? 'actif ' : ''}${kept.has(it.id) ? 'garde' : 'jete'}`} />
          ))}
        </div>
      )}
      <p className="note centre">Glissez pour changer de photo · deux touchers pour zoomer · vers le bas pour revenir</p>
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
      <div className="loupe-actions">
        <button className="bouton principal grand eclair-valider" onClick={onValidate}>
          <span>Valider la pose</span>
          <small>
            {keepCount} gardée{keepCount > 1 ? 's' : ''}
            {removeCount > 0 ? ` · ${removeCount} à supprimer` : ''}
          </small>
        </button>
      </div>
    </div>
  );
}
