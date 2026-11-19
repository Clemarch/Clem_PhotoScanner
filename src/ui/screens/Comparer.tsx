import { useEffect, useMemo, useState } from 'react';
import { IconFermer } from '../icons';
import type { MediaItem, PackAnalysis } from '../../engine';
import { diffImages, type ImageDiff } from '../../platform/image/difference';
import { finalKeep, type Choice, type Choices } from '../choices';
import { describeDifferences } from '../compare';
import { reasonText } from '../reasons';

interface Props {
  item: MediaItem;
  pack: PackAnalysis;
  previews: Map<string, string>;
  thumbnails: Map<string, string>;
  choices: Choices;
  numberOf: (id: string) => number | null;
  onChoose: (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => void;
  onClose: () => void;
}

/**
 * Comparaison de deux photos d'une même pose : l'une au-dessus de l'autre, zones qui changent entourées, et liste des
 * différences mesurées. Un toucher sur une photo la montre en grand, un autre bascule vers l'autre au même endroit.
 */
export function Comparer({ item, pack, previews, thumbnails, choices, numberOf, onChoose, onClose }: Props) {
  const pose = pack.poses.find((p) => p.items.some((it) => it.id === item.id));
  const others = (pose?.items ?? []).filter((it) => it.id !== item.id);
  const scoreOf = (it: MediaItem) => pack.scores.get(it.id)?.score ?? 0;
  const [otherId, setOtherId] = useState(() => [...others].sort((x, y) => scoreOf(y) - scoreOf(x))[0]?.id ?? null);
  const other = others.find((it) => it.id === otherId) ?? null;
  const [diff, setDiff] = useState<ImageDiff | null>(null);
  const [big, setBig] = useState<'a' | 'b' | null>(null);
  const url = (id: string) => previews.get(id) ?? thumbnails.get(id) ?? '';
  const label = (it: MediaItem) => `n° ${numberOf(it.id) ?? '?'}`;

  useEffect(() => {
    setDiff(null);
    if (!other) return;
    let alive = true;
    diffImages(url(item.id), url(other.id))
      .then((d) => alive && setDiff(d))
      .catch(() => alive && setDiff({ dx: 0, dy: 0, mean: 1, zones: [], comparable: false }));
    return () => {
      alive = false;
    };
  }, [item.id, other?.id]);

  const differences = useMemo(
    () => (other ? describeDifferences(item, other, pack.scores.get(item.id), pack.scores.get(other.id), label(item), label(other)) : []),
    [item, other, pack],
  );

  if (!other) return null;
  const reasonsOnly = (x: MediaItem, y: MediaItem) => {
    const ry = new Set((pack.scores.get(y.id)?.reasons ?? []).map((r) => r.code));
    return (pack.scores.get(x.id)?.reasons ?? []).filter((r) => !ry.has(r.code));
  };
  const zones = (which: 'a' | 'b') =>
    diff?.comparable
      ? diff.zones.map((z, i) => (
          <span
            key={i}
            className="zone-diff"
            style={{
              left: `${(z.x + (which === 'b' ? diff.dx : 0)) * 100}%`,
              top: `${(z.y + (which === 'b' ? diff.dy : 0)) * 100}%`,
              width: `${z.width * 100}%`,
              height: `${z.height * 100}%`,
              opacity: 0.5 + z.strength / 2,
            }}
          />
        ))
      : null;
  const card = (it: MediaItem, which: 'a' | 'b') => {
    const state = finalKeep(it, pack, choices);
    const twin = which === 'a' ? other : item;
    return (
      <figure className="comp-photo">
        <button className="comp-image" onClick={() => setBig(which)} aria-label={`Voir la ${label(it)} en grand`}>
          <img src={url(it.id)} alt="" />
          {zones(which)}
        </button>
        <figcaption>
          <strong>{label(it)}</strong> · {state.review ? 'à vérifier' : state.keep ? 'à garder' : 'à supprimer'}
          {state.byUser ? ' (votre choix)' : ''}
        </figcaption>
        <button
          className="bouton petit"
          onClick={() => {
            onChoose(it, pack, 'garder');
            onChoose(twin, pack, 'supprimer');
          }}
        >
          Garder la {label(it)}, supprimer la {label(twin)}
        </button>
      </figure>
    );
  };

  return (
    <div className="comparer" role="dialog" aria-label="Comparer deux photos">
      <header className="vis-haut">
        <button className="vis-fermer" onClick={onClose} aria-label="Fermer">
          <IconFermer size={17} />
        </button>
        <span>Comparer</span>
        <span />
      </header>
      <div className="comp-corps">
        {others.length > 1 && (
          <div className="comp-choix">
            <span className="note">Comparer la {label(item)} avec :</span>
            {others.map((it) => (
              <button key={it.id} className={`puce ${it.id === otherId ? 'active' : ''}`} onClick={() => setOtherId(it.id)}>
                {label(it)}
              </button>
            ))}
          </div>
        )}
        {card(item, 'a')}
        {card(other, 'b')}
        <section className="carte">
          <h3>Différences</h3>
          {diff === null ? (
            <p className="note">Recherche des zones qui changent…</p>
          ) : diff.comparable ? (
            <p className="note">
              {diff.zones.length === 0
                ? 'Aucune zone ne change nettement : les deux photos sont presque identiques.'
                : `${diff.zones.length} zone${diff.zones.length > 1 ? 's' : ''} qui change${diff.zones.length > 1 ? 'nt' : ''}, entourée${diff.zones.length > 1 ? 's' : ''} en jaune.`}
              {(Math.abs(diff.dx) >= 0.01 || Math.abs(diff.dy) >= 0.01) &&
                ` Cadrage décalé de ${Math.round(Math.abs(diff.dx) * 100)} % en largeur et ${Math.round(Math.abs(diff.dy) * 100)} % en hauteur.`}
            </p>
          ) : (
            <p className="note">Cadrages trop différents pour comparer pixel à pixel.</p>
          )}
          <ul className="raisons">
            {differences.map((d, i) => (
              <li key={i} className={d.favours ? 'plus' : ''}>
                {d.text}
              </li>
            ))}
            {reasonsOnly(item, other).map((r) => (
              <li key={`a-${r.code}`} className={r.tone}>
                {label(item)} seulement : {reasonText(r, numberOf)}
              </li>
            ))}
            {reasonsOnly(other, item).map((r) => (
              <li key={`b-${r.code}`} className={r.tone}>
                {label(other)} seulement : {reasonText(r, numberOf)}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {big && (
        <button className="comp-grand" onClick={() => setBig(big === 'a' ? 'b' : 'a')} aria-label="Basculer vers l'autre photo">
          <img src={url(big === 'a' ? item.id : other.id)} alt="" />
          <span className="comp-etiquette">
            {label(big === 'a' ? item : other)} · touchez pour voir la {label(big === 'a' ? other : item)}
          </span>
          <span
            className="comp-fermer"
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              setBig(null);
            }}
          >
            ✕
          </span>
        </button>
      )}
    </div>
  );
}
