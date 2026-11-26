import { useEffect, useMemo, useState } from 'react';
import { accuracy, FEATURE_NAMES, type ChoiceRecord, type LabResult, type LearnedWeights, type PoseValidation } from '../../engine';
import type { SessionSummary } from '../../platform/storage/sessionStore';
import { runLabInBackground } from '../../platform/worker/lab';
import { featureLabel } from '../reasons';
import { formatDate, formatShortTime, plural } from '../format';
import { IconFermer } from '../icons';
import { BarreOeil } from '../BarreOeil';
import type { EyeProgress } from '../session';
import { useScrolled } from '../useScrolled';

interface Props {
  validations: PoseValidation[];
  records: ChoiceRecord[];
  excluded: ReadonlySet<string>;
  learned: LearnedWeights;
  seances: SessionSummary[];
  /** Décisions de la séance ouverte que vos goûts appris changent (null : pas de séance ouverte). */
  tasteEffect: { changed: number; total: number } | null;
  eyeProgress: EyeProgress | null;
  onLaunchEye: () => Promise<number>;
  onClose: () => void;
}

// Dernier calcul, gardé tant que les données ne changent pas (rouvrir le labo est immédiat).
let cache: { key: string; result: LabResult } | null = null;

const pct = (right: number, total: number): number | null => (total ? Math.round((right / total) * 100) : null);
const pctText = (right: number, total: number): string => (total ? `${pct(right, total)} %` : '—');

/**
 * Labo d'apprentissage (jalon 7, utilisateur, 26/11 : « suivre la progression de l'apprentissage et voir à quel point
 * tes prédictions et tes sélections sont de plus en plus performantes »). Tout est mesuré honnêtement : une séance n'est
 * jamais jugée par ce qui a été appris sur elle.
 */
export function Labo({ validations, records, excluded, learned, seances, tasteEffect, eyeProgress, onLaunchEye, onClose }: Props) {
  const scrolled = useScrolled();
  const key = `${validations.length}|${records.length}|${records.filter((r) => r.clip).length}|${[...excluded].sort().join(',')}`;
  const [result, setResult] = useState<LabResult | null>(cache?.key === key ? cache.result : null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (cache?.key === key) return;
    let alive = true;
    setError(null);
    runLabInBackground(validations, records, excluded)
      .then((r) => {
        cache = { key, result: r };
        if (alive) setResult(r);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // `key` résume les données utiles : on ne relance pas le calcul à chaque nouvel objet.
  }, [key]);

  const counted = useMemo(() => validations.filter((v) => !excluded.has(v.sessionId)), [validations, excluded]);
  const app = accuracy(counted);
  const firstAt = new Map(seances.map((s) => [s.sessionId, s.firstAt]));
  const sessionName = (id: string) => {
    const at = firstAt.get(id) ?? Number(id);
    // Plusieurs séances le même jour : l'heure les distingue.
    return at ? `${formatDate(at).slice(0, 5)} ${formatShortTime(at)}` : '?';
  };
  const appBySession = [...new Set(counted.map((v) => v.sessionId))].sort().map((id) => ({ id, ...accuracy(counted.filter((v) => v.sessionId === id)).photos }));
  const eyeSeen = records.filter((r) => r.clip).length;
  const top = FEATURE_NAMES.filter((n) => learned[n] !== undefined)
    .sort((a, b) => Math.abs(learned[b]!) - Math.abs(learned[a]!))
    .slice(0, 6);

  const formula = result?.candidates.find((c) => c.id === 'formule') ?? null;
  const others = result?.candidates.filter((c) => c.id !== 'formule') ?? [];
  const rate = (s: { right: number; total: number }) => (s.total ? s.right / s.total : 0);
  const best = [...others].sort((a, b) => rate(b.honest) - rate(a.honest))[0] ?? null;
  const shown = others.find((c) => c.id === chosen) ?? best;

  return (
    <main className="page par-dessus labo">
      <div className={`barre-haut${scrolled ? ' visible' : ''}`} aria-hidden={!scrolled}>
        <strong>Labo d’apprentissage</strong>
      </div>
      <header className="grand-titre">
        <div className="grand-titre-ligne">
          <h1>Labo</h1>
          <button className="rond" onClick={onClose} aria-label="Fermer">
            <IconFermer size={16} />
          </button>
        </div>
        <p className="sous-titre">Ce que l’app apprend de vos choix, mesuré honnêtement</p>
      </header>

      <section className="groupe labo-chiffres">
        <div>
          <strong>{pctText(app.photos.right, app.photos.total)}</strong>
          <span>photos où l’app a vu comme vous</span>
        </div>
        <div>
          <strong>{app.poses.total}</strong>
          <span>poses validées</span>
        </div>
        <div>
          <strong>{records.length}</strong>
          <span>choix appris</span>
        </div>
        <div>
          <strong>{eyeSeen}</strong>
          <span>photos vues par le nouvel œil</span>
        </div>
      </section>

      <BarreOeil progress={eyeProgress} onLaunch={onLaunchEye} />

      <h2 className="titre-groupe">Les prédictions s’améliorent-elles ?</h2>
      <section className="groupe">
        {!result && !error && <p className="note">Calcul en cours (quelques secondes)…</p>}
        {error && <p className="alerte">Calcul impossible : {error}</p>}
        {result && formula && shown && result.sessions.length > 0 && (
          <>
            <p className="note">
              Pour chaque séance, ce que l’app aurait prédit ce jour-là avec ce qu’elle avait appris <strong>avant</strong> :
              part des paires (une photo gardée, une supprimée, même pose) où elle met devant celle que vous gardez. 50 %,
              c’est le hasard.
            </p>
            <div className="puces" role="group" aria-label="Candidat comparé à la formule">
              {others.map((c) => (
                <button key={c.id} className={`puce${c.id === shown.id ? ' active' : ''}`} onClick={() => setChosen(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <Courbe
              labels={result.sessions.map((_, i) => String(i + 1))}
              series={[
                { name: 'Formule actuelle', className: 's1', points: formula.curve },
                { name: shown.label, className: 's2', points: shown.curve },
              ]}
              selected={selected ?? result.sessions.length - 1}
              onSelect={setSelected}
            />
            {(() => {
              const i = selected ?? result.sessions.length - 1;
              const f = formula.curve[i]!;
              const s = shown.curve[i]!;
              return (
                <p className="note labo-detail" role="status">
                  Séance {i + 1}, du {sessionName(result.sessions[i]!)} ({plural(f.total, 'paire')}) : formule {pctText(f.right, f.total)} ·{' '}
                  {shown.label.toLowerCase()} {pctText(s.right, s.total)}
                  {excluded.has(result.sessions[i]!) ? ' · hors statistiques' : ''}
                </p>
              );
            })()}
          </>
        )}
        {result && result.sessions.length === 0 && (
          <p className="note">Pas encore de poses validées dans le tri éclair : la courbe apparaîtra après la première séance.</p>
        )}
      </section>

      {result && formula && (
        <>
          <h2 className="titre-groupe">Les candidats</h2>
          <section className="groupe">
            <p className="note">
              Chaque façon d’apprendre est testée sur chaque séance avec ce qu’elle a appris sur les autres
              ({plural(result.pairs, 'paire')} au total). Elle ne prendrait la place de la formule qu’en faisant mieux d’au
              moins 3 points sur 300 paires.
            </p>
            <ul className="labo-candidats">
              {result.candidates.map((c) => {
                const gain = formula.honest.total ? Math.round((rate(c.honest) - rate(formula.honest)) * 100) : 0;
                return (
                  <li key={c.id} className={c.id === 'formule' ? 'aux-commandes' : ''}>
                    <div>
                      <strong>{c.label}</strong>
                      <span className="note bloc">{c.description}</span>
                    </div>
                    <div className="labo-score">
                      <strong>{pctText(c.honest.right, c.honest.total)}</strong>
                      <span className={gain > 0 ? 'vert' : gain < 0 ? 'rouge' : 'doux'}>
                        {c.id === 'formule' ? 'aux commandes' : `${gain > 0 ? '+' : ''}${gain} pt`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="note">
              {result.winner
                ? `« ${result.candidates.find((c) => c.id === result.winner)!.label} » bat nettement la formule : je vous proposerai de lui confier les décisions.`
                : 'Aucun candidat ne bat encore nettement la formule : elle reste aux commandes. Chaque séance validée leur donne de quoi apprendre.'}
            </p>
          </section>
        </>
      )}

      <h2 className="titre-groupe">Séance par séance</h2>
      <section className="groupe">
        <table className="progres">
          <thead>
            <tr>
              <th>Séance (poses)</th>
              <th>App juste</th>
              {result && <th>Formule</th>}
              {result && shown && <th>{shown.id === 'oeil' ? 'Œil' : shown.label.replace('Formule + ', '+ ')}</th>}
            </tr>
          </thead>
          <tbody>
            {[...new Set(validations.map((v) => v.sessionId))].sort().map((id) => {
              const a = accuracy(validations.filter((v) => v.sessionId === id));
              const f = formula?.bySession.find((b) => b.sessionId === id);
              const s = shown?.bySession.find((b) => b.sessionId === id);
              return (
                <tr key={id} className={excluded.has(id) ? 'hors' : ''}>
                  <td>
                    {sessionName(id)}
                    <span className="doux"> ({a.poses.total})</span>
                  </td>
                  <td>{pctText(a.photos.right, a.photos.total)}</td>
                  {result && <td>{f ? pctText(f.right, f.total) : '—'}</td>}
                  {result && shown && <td>{s ? pctText(s.right, s.total) : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">
          « App juste » : photos où la proposition de l’app était la vôtre, dans le tri éclair. Les autres colonnes : paires
          bien classées, chaque séance testée avec ce qui a été appris sur les autres. En gris : séances hors statistiques.
          {appBySession.length >= 2 &&
            ` Première séance comptée : ${pctText(appBySession[0]!.right, appBySession[0]!.total)}, dernière : ${pctText(appBySession[appBySession.length - 1]!.right, appBySession[appBySession.length - 1]!.total)}.`}
        </p>
      </section>

      <h2 className="titre-groupe">Ce que vos choix disent</h2>
      <section className="groupe">
        {top.length === 0 ? (
          <p className="note">Pas encore assez de choix.</p>
        ) : (
          <ul className="gouts">
            {top.map((name) => (
              <li key={name} className={learned[name]! > 0 ? 'plus' : 'moins'}>
                {learned[name]! > 0 ? 'Compte plus pour vous : ' : 'Compte moins pour vous : '}
                {featureLabel[name]}
              </li>
            ))}
          </ul>
        )}
        <p className="note">
          Les {top.length} critères que vos choix ont le plus déplacés. Ces goûts déplacent la note d’une photo de 0,08 au plus.
          {tasteEffect && ` Dans la séance ouverte, ils changent ${tasteEffect.changed} décision${tasteEffect.changed > 1 ? 's' : ''} sur ${tasteEffect.total} par rapport à la formule seule.`}
        </p>
      </section>
    </main>
  );
}

/** En dessous, un point de la courbe repose sur trop peu de paires pour dire quelque chose. */
const FEW = 10;

/** Courbe : une ligne par série, un point par séance ; toucher un point affiche son détail sous la courbe. */
function Courbe({
  labels,
  series,
  selected,
  onSelect,
}: {
  labels: string[];
  series: { name: string; className: string; points: { right: number; total: number }[] }[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const W = 340;
  const H = 190;
  const left = 34;
  const right = 12;
  const top = 12;
  const bottom = 26;
  const n = labels.length;
  const x = (i: number) => (n === 1 ? (left + W - right) / 2 : left + (i * (W - left - right)) / (n - 1));
  const y = (p: number) => top + ((100 - p) * (H - top - bottom)) / 100;
  // Une étiquette d'abscisse sur deux quand les séances sont nombreuses.
  const every = n > 8 ? 2 : 1;
  return (
    <figure className="courbe">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Courbe : ${series.map((s) => s.name).join(' et ')}, séance par séance`}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line className={g === 50 ? 'grille hasard' : 'grille'} x1={left} x2={W - right} y1={y(g)} y2={y(g)} />
            <text className="axe" x={left - 6} y={y(g) + 4} textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        <rect className="selection" x={x(selected) - 12} y={top} width={24} height={H - top - bottom} rx={6} />
        {series.map((s) => {
          const pts = s.points.map((p, i) => ({ i, v: pct(p.right, p.total) })).filter((p): p is { i: number; v: number } => p.v !== null);
          return (
            <g key={s.name} className={s.className}>
              <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
              {pts.map((p) => (
                <circle key={p.i} className={s.points[p.i]!.total < FEW ? 'creux' : ''} cx={x(p.i)} cy={y(p.v)} r={p.i === selected ? 5 : 4} />
              ))}
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} className="axe" x={x(i)} y={H - 8} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {/* Zones de toucher plus larges que les points. */}
        {labels.map((l, i) => (
          <rect key={`t${i}`} className="cible" x={x(i) - 16} y={0} width={32} height={H} onClick={() => onSelect(i)}>
            <title>{l}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="legende-courbe">
        <span className="axe-titre">En bas : séances dans l’ordre · à gauche : % de paires bien classées</span>
        {series.map((s) => (
          <span key={s.name}>
            <i className={s.className} />
            {s.name}
          </span>
        ))}
        <span>
          <i className="hasard" />
          hasard
        </span>
        {series[0]!.points.some((p) => p.total > 0 && p.total < FEW) && (
          <span>
            <i className="creux" />
            moins de {FEW} paires : peu fiable
          </span>
        )}
      </figcaption>
    </figure>
  );
}
