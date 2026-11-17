import { useMemo, useState } from 'react';
import { config, type DayAnalysis, type MediaItem, type PackAnalysis } from '../../engine';
import type { Session } from '../session';
import { finalKeep, type Choice, type Choices } from '../choices';
import { formatGap, formatShortTime, formatSize, plural } from '../format';
import { sceneGoal, sceneLabel } from '../reasons';
import { Visionneuse, type ViewerEntry } from './Visionneuse';

interface Props {
  session: Session;
  day: DayAnalysis;
  gap: number;
  onGap: (seconds: number) => void;
  choices: Choices;
  onChoose: (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => void;
}

/** Le paquet mêle-t-il plusieurs types de photo (personnes et paysages, par exemple) ? */
const mixed = (pack: PackAnalysis): boolean => new Set(pack.sceneOf.values()).size > 1;

export function Paquets({ session, day, gap, onGap, choices, onChoose }: Props) {
  const [viewing, setViewing] = useState<number | null>(null);
  const numberOf = (id: string) => day.dayIndex.get(id) ?? null;

  // Toutes les photos de la journée dans l'ordre, pour feuilleter d'un paquet à l'autre.
  const entries = useMemo<ViewerEntry[]>(
    () => [
      ...day.packs.flatMap((pack, i) => pack.pack.items.map((item) => ({ item, pack, packNumber: i + 1 }))),
      ...day.undated.map((item) => ({ item, pack: null, packNumber: null })),
    ],
    [day],
  );
  const positionOf = useMemo(() => new Map(entries.map((e, i) => [e.item.id, i])), [entries]);

  const totals = useMemo(() => {
    let keep = 0;
    let total = 0;
    for (const pack of day.packs)
      for (const item of pack.pack.items) {
        total++;
        if (finalKeep(item, pack, choices).keep) keep++;
      }
    return { keep, total, remove: total - keep };
  }, [day, choices]);

  const tile = (item: MediaItem, pack: PackAnalysis | null) => {
    const number = numberOf(item.id);
    const url = session.thumbnails.get(item.id);
    const state = pack ? finalKeep(item, pack, choices) : null;
    const best = pack?.decisions.get(item.id)?.code === 'meilleure' && pack.pack.items.length > 1;
    const classes = ['vignette', state ? (state.keep ? 'garder' : 'supprimer') : '', best && state?.keep ? 'meilleure' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <button key={item.id} className={classes} onClick={() => setViewing(positionOf.get(item.id) ?? 0)}>
        {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
        {number !== null && <span className="numero">{number}</span>}
        {state && (
          <span className={`etat ${state.keep ? 'garder' : 'supprimer'}${state.byUser ? ' vous' : ''}`} aria-label={state.keep ? 'à garder' : 'à supprimer'}>
            {state.keep ? '✓' : '✕'}
          </span>
        )}
      </button>
    );
  };

  return (
    <main className="page">
      <header className="entete">
        <h2>Tri du jour</h2>
        <p className="doux">
          {plural(day.packs.length, 'paquet')} · {plural(totals.total, 'photo')}
        </p>
      </header>

      {session.faceError && (
        <p className="alerte">
          La recherche de visages ou d’objets n’a pas pu démarrer : le classement est moins fiable. Copiez le rapport de
          l’onglet Diagnostic pour qu’on comprenne pourquoi.
        </p>
      )}

      {totals.total > 0 && (
        <section className="carte bilan">
          <div>
            <strong className="vert">{totals.keep}</strong>
            <span>à garder ({Math.round((totals.keep / totals.total) * 100)} %)</span>
          </div>
          <div>
            <strong className="rouge">{totals.remove}</strong>
            <span>à supprimer</span>
          </div>
          <p className="note">Touchez une photo pour la voir en grand, la feuilleter et changer la décision.</p>
        </section>
      )}

      <section className="carte reglage">
        <label htmlFor="ecart">
          Nouveau paquet après <strong>{formatGap(gap)}</strong> sans photo
        </label>
        <input
          id="ecart"
          type="range"
          min={config.grouping.packGapMinSeconds}
          max={config.grouping.packGapMaxSeconds}
          step={10}
          value={gap}
          onChange={(event) => onGap(Number(event.target.value))}
        />
      </section>

      {day.packs.map((pack, i) => {
        const keep = pack.pack.items.filter((item) => finalKeep(item, pack, choices).keep).length;
        return (
          <section className="carte" key={pack.key}>
            <div className="titre-paquet">
              <h3>
                Paquet {i + 1} <span className="type">{mixed(pack) ? 'Mixte' : sceneLabel[pack.scene]}</span>
              </h3>
              <span>
                {formatShortTime(pack.pack.startAt)} · {keep} / {pack.pack.items.length} gardée{keep > 1 ? 's' : ''}
              </span>
            </div>
            {mixed(pack) ? null : <p className="cherche">On cherche : {sceneGoal[pack.scene]}.</p>}
            {pack.poses.map((pose) => (
              <div className="pose" key={pose.id}>
                {pack.poses.length > 1 && (
                  <span className="pose-lettre">
                    Pose {pose.label}
                    {mixed(pack) && ` · ${sceneLabel[pack.sceneOf.get(pose.items[0]!.id) ?? pack.scene]}`}
                  </span>
                )}
                <div className="grille">{pose.items.map((item) => tile(item, pack))}</div>
              </div>
            ))}
          </section>
        );
      })}

      {day.undated.length > 0 && (
        <section className="carte">
          <div className="titre-paquet">
            <h3>Sans date</h3>
            <span>{plural(day.undated.length, 'photo')}</span>
          </div>
          <p className="alerte">La date de prise de vue est absente : impossible de ranger ces photos dans un paquet.</p>
          <div className="grille">{day.undated.map((item) => tile(item, null))}</div>
        </section>
      )}

      {day.setAside.length > 0 && (
        <section className="carte">
          <div className="titre-paquet">
            <h3>Mis de côté</h3>
            <span>{plural(day.setAside.length, 'fichier')}</span>
          </div>
          <p className="doux">RAW et vidéos : non analysés (les RAW sont traités dans Lightroom).</p>
          <ul className="liste-simple">
            {day.setAside.map((item) => (
              <li key={item.id}>
                {item.fileName} · {item.format} · {formatSize(item.sizeBytes)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {viewing !== null && entries[viewing] && (
        <Visionneuse
          entries={entries}
          start={viewing}
          previews={session.previews}
          thumbnails={session.thumbnails}
          choices={choices}
          numberOf={numberOf}
          onChoose={(entry, choice) => entry.pack && onChoose(entry.item, entry.pack, choice)}
          onClose={() => setViewing(null)}
        />
      )}
    </main>
  );
}
