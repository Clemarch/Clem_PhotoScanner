import { useEffect, useRef, useState } from 'react';
import { photoKey, type AsideKind, type MediaItem, type PackAnalysis } from '../../engine';
import { finalKeep, type Choice, type Choices } from '../choices';
import { formatTime } from '../format';
import { asideLabel, decisionText, reasonText, sceneLabel } from '../reasons';
import { Comparer } from './Comparer';
import { Commentaire } from '../Commentaire';

export interface ViewerEntry {
  item: MediaItem;
  pack: PackAnalysis | null;
  packNumber: number | null;
  /** Fichier mis de côté : toujours gardé. */
  aside?: AsideKind;
}

interface Props {
  entries: ViewerEntry[];
  start: number;
  previews: Map<string, string>;
  /** Fichiers d'origine, affichés en pleine définition dès qu'on zoome. */
  originals: Map<string, File>;
  thumbnails: Map<string, string>;
  choices: Choices;
  numberOf: (id: string) => number | null;
  onChoose: (entry: ViewerEntry, choice: Choice | null) => void;
  /** Commentaire sur le choix de l'utilisateur (pourquoi il garde ou supprime). */
  onComment: (entry: ViewerEntry, comment: string) => void;
  onClose: () => void;
}

/** Visionneuse plein écran : glisser à gauche ou à droite pour changer de photo. */
export function Visionneuse({ entries, start, previews, originals, thumbnails, choices, numberOf, onChoose, onComment, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [dx, setDx] = useState(0);
  // Zoom : échelle et décalage (en pixels) de la photo affichée.
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const area = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{
    mode: 'swipe' | 'pan' | 'pinch';
    x: number;
    y: number;
    t: number;
    horizontal: boolean | null;
    dx: number;
    dist: number;
    scale: number;
    tx: number;
    ty: number;
    midX: number;
    midY: number;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  // Sur iPhone, après un double toucher, le système rejoue le geste comme un double clic de souris environ une
  // seconde plus tard : sans ce garde-fou, le zoom s'annulait aussitôt.
  const lastTouchAt = useRef(0);
  const entry = entries[index]!;
  const zoomed = zoom.s > 1.01;
  const go = (step: number) => setIndex((i) => Math.min(entries.length - 1, Math.max(0, i + step)));

  // Changer de photo remet le zoom à zéro.
  useEffect(() => setZoom({ s: 1, x: 0, y: 0 }), [index]);

  // Photo d'origine en pleine définition, seulement pendant le zoom (une seule à la fois en mémoire).
  useEffect(() => {
    const file = originals.get(entry.item.id);
    if (!zoomed || !file) {
      setFullUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFullUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [zoomed, entry.item.id, originals]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Limite le déplacement pour que la photo zoomée ne sorte pas du cadre. */
  const bounded = (s: number, x: number, y: number) => {
    const rect = area.current?.getBoundingClientRect();
    const maxX = rect ? ((s - 1) * rect.width) / 2 : 0;
    const maxY = rect ? ((s - 1) * rect.height) / 2 : 0;
    return { s, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  /** Double toucher : zoome sur le point touché, ou revient à la photo entière. */
  const toggleZoom = (clientX: number, clientY: number) => {
    if (zoomed) return setZoom({ s: 1, x: 0, y: 0 });
    const rect = area.current?.getBoundingClientRect();
    if (!rect) return;
    const s = 2.5;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setZoom(bounded(s, -(clientX - cx) * (s - 1), -(clientY - cy) * (s - 1)));
  };

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
        ref={area}
        onDoubleClick={(e) => {
          if (Date.now() - lastTouchAt.current < 1500) return;
          toggleZoom(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          lastTouchAt.current = Date.now();
          const t = e.touches[0]!;
          if (e.touches.length === 2) {
            const u = e.touches[1]!;
            gesture.current = {
              mode: 'pinch',
              x: 0,
              y: 0,
              t: Date.now(),
              horizontal: null,
              dx: 0,
              dist: Math.hypot(u.clientX - t.clientX, u.clientY - t.clientY),
              scale: zoom.s,
              tx: zoom.x,
              ty: zoom.y,
              midX: (t.clientX + u.clientX) / 2,
              midY: (t.clientY + u.clientY) / 2,
            };
            return;
          }
          const now = Date.now();
          const tap = lastTap.current;
          if (tap && now - tap.t < 300 && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) < 30) {
            lastTap.current = null;
            gesture.current = null;
            toggleZoom(t.clientX, t.clientY);
            return;
          }
          lastTap.current = { t: now, x: t.clientX, y: t.clientY };
          gesture.current = {
            mode: zoomed ? 'pan' : 'swipe',
            x: t.clientX,
            y: t.clientY,
            t: now,
            horizontal: null,
            dx: 0,
            dist: 0,
            scale: zoom.s,
            tx: zoom.x,
            ty: zoom.y,
            midX: 0,
            midY: 0,
          };
        }}
        onTouchMove={(e) => {
          const g = gesture.current;
          if (!g) return;
          const t = e.touches[0]!;
          if (g.mode === 'pinch' && e.touches.length >= 2) {
            const u = e.touches[1]!;
            const s = Math.max(1, Math.min(6, (g.scale * Math.hypot(u.clientX - t.clientX, u.clientY - t.clientY)) / g.dist));
            const midX = (t.clientX + u.clientX) / 2;
            const midY = (t.clientY + u.clientY) / 2;
            setZoom(bounded(s, (g.tx * s) / g.scale + midX - g.midX, (g.ty * s) / g.scale + midY - g.midY));
            return;
          }
          const mx = t.clientX - g.x;
          const my = t.clientY - g.y;
          if (g.mode === 'pan') {
            setZoom((z) => bounded(z.s, g.tx + mx, g.ty + my));
            return;
          }
          if (g.horizontal === null && Math.hypot(mx, my) > 8) g.horizontal = Math.abs(mx) > Math.abs(my);
          if (g.horizontal) {
            g.dx = mx;
            setDx(mx);
          }
        }}
        onTouchEnd={(e) => {
          lastTouchAt.current = Date.now();
          const g = gesture.current;
          if (!g || e.touches.length > 0) return;
          gesture.current = null;
          if (g.mode === 'pinch') {
            setZoom((z) => (z.s < 1.05 ? { s: 1, x: 0, y: 0 } : z));
            return;
          }
          if (g.mode !== 'swipe') return;
          // Distance lue dans la référence, pas dans l'état React : un glissement rapide se termine
          // parfois avant que l'écran ait été redessiné.
          const moved = g.dx;
          const fast = Date.now() - g.t < 250 && Math.abs(moved) > 30;
          if (moved < -70 || (fast && moved < 0)) go(1);
          else if (moved > 70 || (fast && moved > 0)) go(-1);
          setDx(0);
        }}
      >
        <div className="vis-piste" style={{ transform: `translateX(calc(${-index * 100}% + ${dx}px))`, transition: dx ? 'none' : undefined }}>
          {entries.map((e, i) => (
            <div className="vis-cadre" key={e.item.id}>
              {Math.abs(i - index) <= 1 && url(e.item.id) && (
                <img
                  src={i === index && fullUrl ? fullUrl : url(e.item.id)}
                  alt=""
                  decoding="async"
                  draggable={false}
                  style={i === index && zoomed ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` } : undefined}
                />
              )}
            </div>
          ))}
        </div>
        {!zoomed && <p className="vis-astuce">Pincez ou touchez deux fois pour zoomer</p>}
        {index > 0 && !zoomed && (
          <button className="vis-fleche gauche" onClick={() => go(-1)} aria-label="Photo précédente">
            ‹
          </button>
        )}
        {index < entries.length - 1 && !zoomed && (
          <button className="vis-fleche droite" onClick={() => go(1)} aria-label="Photo suivante">
            ›
          </button>
        )}
      </div>

      <section className="vis-infos">
        <p className="vis-titre">
          {number !== null ? `Photo n° ${number}` : entry.aside ? 'Mise de côté' : 'Photo sans date'}
          {item.capturedAt !== null && ` · ${formatTime(item.capturedAt)}`}
          {entry.packNumber !== null && pack && (
            <span>
              {' '}
              · paquet {entry.packNumber}, {sceneLabel[pack.sceneOf.get(item.id) ?? pack.scene].toLowerCase()}, pose {decision?.pose}
            </span>
          )}
        </p>
        {state && (
          <p className={`vis-decision ${state.review ? 'verifier' : state.keep ? 'garder' : 'supprimer'}`}>
            {state.review ? 'À vérifier' : state.keep ? 'À garder' : 'À supprimer'}
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
        {entry.aside && (
          <p className="vis-decision garder">
            À garder
            <span> · {asideLabel[entry.aside]} : pas analysée, jamais proposée à la suppression</span>
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
              ✓ À garder
            </button>
            <button
              className={`bouton ${!state.keep ? 'choisi-supprimer' : ''}`}
              onClick={() => onChoose(entry, state.byUser && !state.keep ? null : 'supprimer')}
            >
              ✕ À supprimer
            </button>
          </div>
        )}
        {state?.byUser && (
          <button className="bouton commentaire-bouton" onClick={() => setCommenting(true)}>
            {choices.byKey.get(photoKey(item))?.comment
              ? `💬 « ${choices.byKey.get(photoKey(item))!.comment} »`
              : '💬 Pourquoi ? Ajouter un commentaire'}
          </button>
        )}
        {pack && (pack.poses.find((p) => p.items.some((it) => it.id === item.id))?.items.length ?? 0) > 1 && (
          <button className="bouton vis-comparer" onClick={() => setComparing(true)}>
            Comparer avec la même pose
          </button>
        )}
        {pack && state && (
          <p className="note centre">Rien n’est supprimé ici : la suppression se fait dans l’onglet « 2. Dans Photos ».</p>
        )}
        {state?.byUser && (
          <button className="lien" onClick={() => onChoose(entry, null)}>
            Revenir au choix de l’app
          </button>
        )}
      </section>
      {commenting && (
        <Commentaire
          initial={choices.byKey.get(photoKey(item))?.comment ?? ''}
          title={`Photo n° ${number ?? '?'}`}
          onSave={(text) => onComment(entry, text)}
          onClose={() => setCommenting(false)}
        />
      )}
      {comparing && pack && (
        <Comparer
          item={item}
          pack={pack}
          previews={previews}
          thumbnails={thumbnails}
          choices={choices}
          numberOf={numberOf}
          onChoose={(it, p, c) => onChoose({ item: it, pack: p, packNumber: entry.packNumber }, c)}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
