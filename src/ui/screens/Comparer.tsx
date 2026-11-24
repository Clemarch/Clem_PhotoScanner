import { useEffect, useMemo, useState } from 'react';
import { IconFermer } from '../icons';
import { mainFaces, type MediaItem, type PackAnalysis } from '../../engine';
import { diffImages, type ImageDiff } from '../../platform/image/difference';
import { finalKeep, type Choice, type Choices } from '../choices';
import { describeDifferences, scoreFactors } from '../compare';
import { featureLabel, reasonText } from '../reasons';
import { isLandscape } from '../format';

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
 * Comparaison de deux photos d'une même pose, côte à côte (gauche / droite, utilisateur, 19/11) : zones qui changent
 * entourées, tableau des critères de la note (le meilleur en vert), et différences mesurées. Un toucher sur une photo
 * la montre en grand, un autre bascule vers l'autre au même endroit.
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
  // Deux photos en paysage : l'une au-dessus de l'autre (24/11) ; on parle alors de « haut » et « bas ».
  const stacked = !!other && isLandscape(item) && isLandscape(other);
  const A = stacked ? 'haut' : 'gauche';
  const B = stacked ? 'bas' : 'droite';
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);

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
    () =>
      other
        ? describeDifferences(item, other, pack.scores.get(item.id), pack.scores.get(other.id), `${stacked ? 'celle du haut' : 'la gauche'} (${label(item)})`, `${stacked ? 'celle du bas' : 'la droite'} (${label(other)})`)
        : [],
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
  const sa = pack.scores.get(item.id);
  const sb = pack.scores.get(other.id);
  const withFaces = mainFaces(item.faces).length > 0 || mainFaces(other.faces).length > 0;
  const factors = sa && sb ? scoreFactors(sa, sb, withFaces) : [];
  const note = (it: MediaItem) => Math.round(scoreOf(it) * 100);
  const side = (which: 'a' | 'b') => cap(which === 'a' ? A : B);
  const fmt = (feature: string, v: number) => (feature === 'gouts' ? `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : String(Math.round(v * 100)));

  const card = (it: MediaItem, which: 'a' | 'b') => {
    const state = finalKeep(it, pack, choices);
    const twin = which === 'a' ? other : item;
    const best = note(it) > note(twin);
    return (
      <figure className={`comp-photo ${which === 'a' ? 'gauche' : 'droite'}`}>
        <span className="comp-cote">
          {side(which)} · {label(it)}
        </span>
        <button className="comp-image" onClick={() => setBig(which)} aria-label={`Voir la ${label(it)} en grand`}>
          <img src={url(it.id)} alt="" />
          {zones(which)}
        </button>
        <p className="comp-note">
          <strong className={best ? 'vert' : ''}>{note(it)}</strong> / 100
        </p>
        <p className="comp-etat">
          {state.review ? 'à vérifier' : state.keep ? 'à garder' : 'à supprimer'}
          {state.byUser ? ' · votre choix' : ''}
        </p>
        <button
          className="bouton petit"
          onClick={() => {
            onChoose(it, pack, 'garder');
            onChoose(twin, pack, 'supprimer');
          }}
        >
          Garder celle-ci
        </button>
      </figure>
    );
  };

  const gap = note(item) - note(other);
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
            <span className="note">{stacked ? 'En bas' : 'À droite'} :</span>
            {others.map((it) => (
              <button key={it.id} className={`puce ${it.id === otherId ? 'active' : ''}`} onClick={() => setOtherId(it.id)}>
                {label(it)}
              </button>
            ))}
          </div>
        )}
        <div className={`comp-duo${isLandscape(item) && isLandscape(other) ? ' paysages' : ''}`}>
          {card(item, 'a')}
          {card(other, 'b')}
        </div>
        <p className="note centre">« Garder celle-ci » garde cette photo et supprime l’autre. Touchez une photo pour la voir en grand.</p>

        <section className="carte">
          <h3>Pourquoi ces notes</h3>
          <p className="doux">
            {gap === 0
              ? 'Notes égales.'
              : `${gap > 0 ? `${stacked ? 'Celle du haut' : 'La gauche'} (${label(item)})` : `${stacked ? 'Celle du bas' : 'La droite'} (${label(other)})`} a la meilleure note : ${Math.max(note(item), note(other))} contre ${Math.min(note(item), note(other))}.`}
          </p>
          {factors.length > 0 ? (
            <div className="comp-tableau" role="table">
              <div className="comp-ligne entete" role="row">
                <span role="columnheader">Critère</span>
                <span role="columnheader">{cap(A)}</span>
                <span role="columnheader">{cap(B)}</span>
              </div>
              {factors.map((f) => (
                <div className="comp-ligne" role="row" key={f.feature}>
                  <span role="cell">{f.feature === 'gouts' ? 'vos goûts appris' : featureLabel[f.feature]}</span>
                  <span role="cell" className={f.favours === 'a' ? 'gagne' : ''}>
                    {fmt(f.feature, f.a)}
                  </span>
                  <span role="cell" className={f.favours === 'b' ? 'gagne' : ''}>
                    {fmt(f.feature, f.b)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="note">Aucun critère ne diffère nettement.</p>
          )}
          <p className="note">
            Sur 100, la meilleure valeur en vert. Pour les défauts (visage masqué, objet devant, photo penchée…), moins
            c’est mieux. Les visages comptent bien plus que le reste : expression d’abord, puis netteté des visages.
          </p>
        </section>

        <section className="carte">
          <h3>Ce qui change</h3>
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
            {differences
              .filter((d) => !d.text.startsWith('Note :'))
              .map((d, i) => (
                <li key={i} className={d.favours ? 'plus' : ''}>
                  {d.text}
                  {d.favours && <strong className={d.favours === 'a' ? 'avantage gauche' : 'avantage droite'}> · avantage {d.favours === 'a' ? A : B}</strong>}
                </li>
              ))}
            {reasonsOnly(item, other).map((r) => (
              <li key={`a-${r.code}`} className={r.tone}>
                {cap(A)} seulement : {reasonText(r, numberOf)}
              </li>
            ))}
            {reasonsOnly(other, item).map((r) => (
              <li key={`b-${r.code}`} className={r.tone}>
                {cap(B)} seulement : {reasonText(r, numberOf)}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {big && (
        <button className="comp-grand" onClick={() => setBig(big === 'a' ? 'b' : 'a')} aria-label="Basculer vers l'autre photo">
          <img src={url(big === 'a' ? item.id : other.id)} alt="" />
          <span className="comp-etiquette">
            {side(big)} · {label(big === 'a' ? item : other)} — touchez pour voir celle {big === 'a' ? `du ${B === 'bas' ? 'bas' : 'côté droit'}` : `du ${A === 'haut' ? 'haut' : 'côté gauche'}`}
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
