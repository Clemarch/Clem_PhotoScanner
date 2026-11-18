import { useMemo, useState } from 'react';
import { asideKind, config, type DayAnalysis, type MediaItem, type PackAnalysis } from '../../engine';
import type { Session } from '../session';
import { finalKeep, stateLook, type Choice, type Choices } from '../choices';
import { formatGap, formatShortTime, formatSize, plural } from '../format';
import { asideLabel, sceneGoal, sceneLabel } from '../reasons';
import { Visionneuse, type ViewerEntry } from './Visionneuse';
import { dayEntries } from '../entries';

interface Props {
  session: Session;
  day: DayAnalysis;
  gap: number;
  onGap: (seconds: number) => void;
  /** Rattacher un paquet au précédent (true) ou annuler (false). */
  onJoin: (key: string, join: boolean) => void;
  /** Choisir de nouvelles photos (nouvelle journée). */
  onNewDay: (files: File[]) => void;
  choices: Choices;
  onChoose: (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => void;
  onComment: (item: MediaItem, comment: string) => void;
}

/** Le paquet mêle-t-il plusieurs types de photo (personnes et paysages, par exemple) ? */
const mixed = (pack: PackAnalysis): boolean => new Set(pack.sceneOf.values()).size > 1;

export function Paquets({ session, day, gap, onGap, onJoin, onNewDay, choices, onChoose, onComment }: Props) {
  const [viewing, setViewing] = useState<number | null>(null);
  const numberOf = (id: string) => day.dayIndex.get(id) ?? null;

  // Toutes les photos de la journée dans l'ordre, pour feuilleter d'un paquet à l'autre.
  // Fichiers mis de côté qui ont une image : captures d'écran, documents (les RAW et vidéos n'en ont pas).
  const asideShown = useMemo(() => day.setAside.filter((item) => session.thumbnails.has(item.id)), [day, session]);
  const entries = useMemo<ViewerEntry[]>(
    () => dayEntries(day, new Set(asideShown.map((item) => item.id))),
    [day, asideShown],
  );
  const positionOf = useMemo(() => new Map(entries.map((e, i) => [e.item.id, i])), [entries]);

  const totals = useMemo(() => {
    let keep = 0;
    let total = 0;
    const review: { item: MediaItem; pack: PackAnalysis }[] = [];
    for (const pack of day.packs)
      for (const item of pack.pack.items) {
        total++;
        const state = finalKeep(item, pack, choices);
        if (state.review) review.push({ item, pack });
        else if (state.keep) keep++;
      }
    return { keep, total, review, remove: total - keep - review.length };
  }, [day, choices]);

  const tile = (item: MediaItem, pack: PackAnalysis | null) => {
    const number = numberOf(item.id);
    const url = session.thumbnails.get(item.id);
    const state = pack ? finalKeep(item, pack, choices) : null;
    const best = pack?.decisions.get(item.id)?.code === 'meilleure' && pack.pack.items.length > 1;
    const look = state ? stateLook(state) : null;
    const classes = ['vignette', look?.css ?? '', best && state?.keep && !state.review ? 'meilleure' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <button key={item.id} className={classes} onClick={() => setViewing(positionOf.get(item.id) ?? 0)}>
        {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
        {number !== null && <span className="numero">{number}</span>}
        {state && (
          <span className={`etat ${look!.css}${state.byUser ? ' vous' : ''}`} aria-label={look!.label}>
            {look!.mark}
          </span>
        )}
      </button>
    );
  };

  return (
    <main className="page">
      <header className="entete">
        <div className="entete-ligne">
          <h2>Tri du jour</h2>
          <label className="nouvelle">
            Nouvelle journée
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length) onNewDay(files);
              }}
            />
          </label>
        </div>
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
          {totals.review.length > 0 && (
            <div>
              <strong className="bleu">{totals.review.length}</strong>
              <span>à vérifier</span>
            </div>
          )}
          <div>
            <strong className="rouge">{totals.remove}</strong>
            <span>à supprimer</span>
          </div>
          <p className="note">
            Étape 1 : touchez une photo pour la voir en grand, la feuilleter et corriger la décision. Étape 2 : onglet
            « Dans Photos », pour les supprimer vous-même dans l’app Photos.
          </p>
        </section>
      )}

      {totals.review.length > 0 && (
        <section className="carte a-verifier-carte">
          <div className="titre-paquet">
            <h3 className="bleu">À vérifier</h3>
            <span>{plural(totals.review.length, 'photo')}</span>
          </div>
          <p className="doux">
            Presque aussi bonnes que la meilleure de leur pose : à vous de trancher. Touchez-en une, puis « À garder » ou
            « À supprimer ». Sans choix de votre part, elles sont gardées.
          </p>
          <div className="grille">{totals.review.map(({ item, pack }) => tile(item, pack))}</div>
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
        const keep = pack.pack.items.filter((item) => {
          const state = finalKeep(item, pack, choices);
          return state.keep && !state.review;
        }).length;
        const review = pack.pack.items.filter((item) => finalKeep(item, pack, choices).review).length;
        return (
          <section className="carte" key={pack.key}>
            <div className="titre-paquet">
              <h3>
                Paquet {i + 1} <span className="type">{mixed(pack) ? 'Mixte' : sceneLabel[pack.scene]}</span>
              </h3>
              <span>
                {formatShortTime(pack.pack.startAt)} · {keep} / {pack.pack.items.length} gardée{keep > 1 ? 's' : ''}
                {review > 0 && ` · ${review} à vérifier`}
              </span>
            </div>
            {mixed(pack) ? null : <p className="cherche">On cherche : {sceneGoal[pack.scene]}.</p>}
            {(i > 0 || pack.joined.length > 0) && (
              <div className="rattacher">
                {i > 0 && (
                  <button className="lien" onClick={() => onJoin(pack.key, true)}>
                    Même série que le paquet {i} : les réunir
                  </button>
                )}
                {pack.joined.length > 0 && (
                  <button className="lien" onClick={() => pack.joined.forEach((key) => onJoin(key, false))}>
                    Séparer à nouveau ({pack.joined.length + 1} paquets réunis)
                  </button>
                )}
              </div>
            )}
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
          <p className="doux">
            Toujours gardés, jamais proposés à la suppression : captures d’écran, images enregistrées, photos d’un document
            ou d’un écran, RAW et vidéos.
          </p>
          {asideShown.length > 0 && <div className="grille">{asideShown.map((item) => tile(item, null))}</div>}
          {day.setAside.some((item) => !session.thumbnails.has(item.id)) && (
            <ul className="liste-simple">
              {day.setAside
                .filter((item) => !session.thumbnails.has(item.id))
                .map((item) => {
                  const kind = asideKind(item);
                  return (
                    <li key={item.id}>
                      {item.fileName} · {kind ? asideLabel[kind] : item.format} · {formatSize(item.sizeBytes)}
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      )}

      {viewing !== null && entries[viewing] && (
        <Visionneuse
          entries={entries}
          start={viewing}
          previews={session.previews}
          originals={session.originals}
          thumbnails={session.thumbnails}
          choices={choices}
          numberOf={numberOf}
          onChoose={(entry, choice) => entry.pack && onChoose(entry.item, entry.pack, choice)}
          onComment={(entry, comment) => onComment(entry.item, comment)}
          onClose={() => setViewing(null)}
        />
      )}
    </main>
  );
}
