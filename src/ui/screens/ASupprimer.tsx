import { useEffect, useMemo, useState } from 'react';
import type { DayAnalysis, MediaItem, PackAnalysis } from '../../engine';
import type { Session } from '../session';
import { finalKeep, stateLook, type Choice, type Choices } from '../choices';
import { dayEntries } from '../entries';
import { formatDate, formatTime, plural } from '../format';
import { Visionneuse } from './Visionneuse';
import { runShortcut, SHORTCUT_DAYS, SHORTCUT_NAME } from '../../platform/shortcut';
import { GuideRaccourci } from '../GuideRaccourci';

interface Props {
  session: Session;
  day: DayAnalysis;
  choices: Choices;
  onChoose: (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => void;
  onComment: (item: MediaItem, comment: string) => void;
}

const DONE_KEY = 'photo-triage.faits';

function loadDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveDone(done: Set<string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    // Mémoire seulement.
  }
}

/** Écran « À supprimer » : une carte de chaque paquet, dans l'ordre de l'app Photos, à reproduire avec « Sélectionner ». */
export function ASupprimer({ session, day, choices, onChoose, onComment }: Props) {
  const [done, setDone] = useState<Set<string>>(() => loadDone());
  const [viewing, setViewing] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => saveDone(done), [done]);

  const entries = useMemo(() => dayEntries(day), [day]);
  const positionOf = useMemo(() => new Map(entries.map((e, i) => [e.item.id, i])), [entries]);
  const numberOf = (id: string) => day.dayIndex.get(id) ?? null;

  const packs = day.packs.map((pack, i) => {
    const remove = pack.pack.items.filter((item) => !finalKeep(item, pack, choices).keep);
    return { pack, number: i + 1, remove };
  });
  const todo = packs.filter((p) => p.remove.length > 0);
  const totalRemove = todo.reduce((n, p) => n + p.remove.length, 0);
  const remaining = todo.filter((p) => !done.has(p.pack.key)).reduce((n, p) => n + p.remove.length, 0);
  const oldestAt = Math.min(...todo.flatMap((p) => p.remove.map((item) => item.capturedAt ?? Date.now())));
  const tooOld = Number.isFinite(oldestAt) && Date.now() - oldestAt > (SHORTCUT_DAYS - 0.5) * 86_400_000;
  const toReview = day.packs.reduce((n, pack) => n + pack.pack.items.filter((it) => finalKeep(it, pack, choices).review).length, 0);

  return (
    <main className="page">
      <header className="entete">
        <h2>Dans Photos</h2>
        <p className="doux">
          {totalRemove === 0
            ? 'Rien à supprimer.'
            : `${plural(totalRemove, 'photo')} à supprimer vous-même dans l’app Photos, ${plural(todo.length, 'paquet')}${remaining < totalRemove ? ` · encore ${remaining}` : ''}`}
        </p>
      </header>

      {toReview > 0 && (
        <p className="alerte">
          Encore {plural(toReview, 'photo')} « à vérifier » (pastille bleue <span className="bleu">?</span>) : tranchez-les
          d’abord dans l’onglet « 1. Trier ». Sans choix de votre part, elles sont gardées.
        </p>
      )}

      {remaining > 0 && (
        <section className="carte">
          <button
            className="bouton principal"
            onClick={() => {
              const pending = todo.filter((p) => !done.has(p.pack.key));
              runShortcut(pending.flatMap((p) => p.remove.map((item) => ({ fileName: item.fileName, at: item.instant ?? item.capturedAt }))));
              setDone((set) => new Set([...set, ...pending.map((p) => p.pack.key)]));
            }}
          >
            Supprimer les {remaining} photos
          </button>
          <p className="note">
            Ouvre le raccourci « {SHORTCUT_NAME} » : l’iPhone vous demande de confirmer, puis les photos partent dans
            « Supprimés récemment » (récupérables 30 jours). Les paquets sont ensuite marqués « Fait » ; touchez
            « rouvrir » si la suppression n’a pas eu lieu.
          </p>
          {tooOld && (
            <p className="alerte">
              Certaines photos ont plus de {SHORTCUT_DAYS} jours : le raccourci ne les trouvera pas. Supprimez-les à la
              main (plus bas), ou augmentez le nombre de jours dans le raccourci.
            </p>
          )}
          <GuideRaccourci />
        </section>
      )}

      {totalRemove > 0 && (
        <section className="carte mode-emploi">
          <button className="titre-aide" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
            <h3>Ou à la main, dans Photos</h3>
            <span>{help ? '▾' : '▸'}</span>
          </button>
          {help && (
            <>
              <ol>
                <li>Ouvrez l’app Photos et faites défiler jusqu’au jour et à l’heure du paquet (indiqués ci-dessous).</li>
                <li>
                  Touchez <strong>Sélectionner</strong> en haut à droite, puis touchez les photos marquées{' '}
                  <span className="rouge">✕</span> ici : elles sont dans le même ordre que dans Photos.
                </li>
                <li>
                  Touchez la <strong>corbeille</strong> en bas à droite, puis confirmez.
                </li>
                <li>
                  Revenez ici et touchez <strong>Fait dans Photos</strong> : le paquet se range.
                </li>
              </ol>
              <p className="note">
                Cette app ne supprime jamais rien : c’est vous qui supprimez, dans Photos. Les photos supprimées restent
                30 jours dans l’album « Supprimés récemment ».
              </p>
            </>
          )}
        </section>
      )}

      {todo.map(({ pack, number, remove }) => {
        const isDone = done.has(pack.key);
        const keep = pack.pack.items.length - remove.length;
        return (
          <section className={`carte carte-supprimer${isDone ? ' fait' : ''}`} key={pack.key}>
            <div className="titre-paquet">
              <h3>Paquet {number}</h3>
              <span>
                {formatDate(pack.pack.startAt)} · {formatTime(pack.pack.startAt)}
                {pack.pack.endAt !== pack.pack.startAt && ` → ${formatTime(pack.pack.endAt)}`}
              </span>
            </div>
            <p className="resume">
              <strong className="rouge">{remove.length} à supprimer</strong> · {keep} à garder
              {keep === 0 && ' (toutes ratées)'}
            </p>
            {!isDone && (
              <div className="grille carte-ordre">
                {pack.pack.items.map((item) => {
                  const state = finalKeep(item, pack, choices);
                  const del = !state.keep;
                  const look = stateLook(state);
                  const url = session.thumbnails.get(item.id);
                  return (
                    <button
                      key={item.id}
                      className={`vignette ${del ? 'a-supprimer' : 'a-garder'}`}
                      onClick={() => setViewing(positionOf.get(item.id) ?? 0)}
                    >
                      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
                      <span className="numero">{numberOf(item.id)}</span>
                      <span className={`etat ${look.css}`}>{look.mark}</span>
                      <span className="heure">{formatTime(item.capturedAt)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              className={`bouton ${isDone ? 'discret' : 'fait-bouton'}`}
              onClick={() =>
                setDone((set) => {
                  const next = new Set(set);
                  if (next.has(pack.key)) next.delete(pack.key);
                  else next.add(pack.key);
                  return next;
                })
              }
            >
              {isDone ? 'Fait ✓ · rouvrir' : 'Fait dans Photos'}
            </button>
          </section>
        );
      })}

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
