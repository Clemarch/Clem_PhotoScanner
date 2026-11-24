import { useEffect, useMemo, useState } from 'react';
import type { DayAnalysis, MediaItem, PackAnalysis } from '../../engine';
import type { Session } from '../session';
import { finalKeep, stateLook, type Choice, type Choices } from '../choices';
import { dayEntries } from '../entries';
import { formatDate, formatTime, plural } from '../format';
import { Visionneuse } from './Visionneuse';
import { albumsEnabled, KEPT_ALBUM, runShortcut, shortcutCount, shortcutText, SHORTCUT_BATCH, SHORTCUT_NAME } from '../../platform/shortcut';
import { GuideRaccourci } from '../GuideRaccourci';
import { IconCoche, IconCorbeille, IconCroix } from '../icons';
import { useScrolled } from '../useScrolled';

interface Props {
  session: Session;
  day: DayAnalysis;
  choices: Choices;
  onChoose: (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => void;
  onComment: (item: MediaItem, comment: string) => void;
  /** Paquets traités : les photos laissées telles quelles comptent comme accords avec l'app. */
  onConfirm: (packs: PackAnalysis[]) => void;
  /** Paquets rouverts : leurs accords silencieux sont retirés. */
  onUnconfirm: (packs: PackAnalysis[]) => void;
  /** Tous les paquets sont traités : la séance se termine (utilisateur, 20/11). */
  onFinished: () => void;
  /** Poses pas encore vérifiées dans le tri éclair (leurs photos suivent le choix de l'app), et comment les vérifier. */
  unverified: number;
  onVerify: () => void;
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

// Séance dont les photos gardées sont déjà parties vers l'album « Triées » (survit au changement d'onglet).
const KEPT_KEY = 'photo-triage.triees-envoyees';
function keptSentFor(): string | null {
  try {
    return localStorage.getItem(KEPT_KEY);
  } catch {
    return null;
  }
}
function saveKeptSent(sessionId: string | null): void {
  try {
    if (sessionId) localStorage.setItem(KEPT_KEY, sessionId);
    else localStorage.removeItem(KEPT_KEY);
  } catch {
    // Mémoire seulement.
  }
}

const asPhoto = (item: MediaItem) => ({ fileName: item.fileName, at: item.instant ?? item.capturedAt });
/** Le raccourci retrouve la photo (nom et heure connus) ? */
const findable = (item: MediaItem) => shortcutCount([asPhoto(item)]) === 1;

/** Écran « Supprimer » : envoie la liste au raccourci « Photo Triage », par lots de 49 au plus. */
export function ASupprimer({ session, day, choices, onChoose, onComment, onConfirm, onUnconfirm, onFinished, unverified, onVerify }: Props) {
  const [done, setDone] = useState<Set<string>>(() => loadDone());
  const [viewing, setViewing] = useState<number | null>(null);
  // Photos déjà envoyées au raccourci pendant cette visite (lots de 49 au plus).
  const [sent, setSent] = useState<Set<string>>(new Set());
  const scrolled = useScrolled();
  useEffect(() => saveDone(done), [done]);
  // Albums (24/11) : les photos gardées partent avec le premier lot, pour l'album « Triées ».
  const markKept = albumsEnabled();
  const [keptSent, setKeptSentState] = useState(() => keptSentFor() === session.id);
  const setKeptSent = (on: boolean) => {
    setKeptSentState(on);
    saveKeptSent(on ? session.id : null);
  };

  const entries = useMemo(() => dayEntries(day), [day]);
  const positionOf = useMemo(() => new Map(entries.map((e, i) => [e.item.id, i])), [entries]);
  const numberOf = (id: string) => day.dayIndex.get(id) ?? null;

  const packs = day.packs.map((pack, i) => {
    const remove = pack.pack.items.filter((item) => !finalKeep(item, pack, choices).keep);
    return { pack, number: i + 1, remove };
  });
  const todo = packs.filter((p) => p.remove.length > 0);
  const totalRemove = todo.reduce((n, p) => n + p.remove.length, 0);
  const pendingPacks = todo.filter((p) => !done.has(p.pack.key));
  const pendingAll = pendingPacks.flatMap((p) => p.remove).filter((item) => !sent.has(item.id));
  // Seules les photos datées partent au raccourci ; les autres se suppriment à la main (plus bas).
  const pendingItems = pendingAll.filter(findable);
  const manual = pendingAll.filter((item) => !findable(item));
  // iOS refuse qu'un raccourci supprime 50 photos ou plus d'un coup (protection gardée par l'utilisateur, 19/11) :
  // envoi par lots de 49 au plus.
  const batchItems = pendingItems.slice(0, SHORTCUT_BATCH);
  const pendingPhotos = batchItems.map(asPhoto);
  const sendable = shortcutCount(pendingPhotos);
  // Photos gardées de la séance (tout sauf ce qui part à la suppression ; photos illisibles exclues : elles reviendront).
  const removeIds = new Set(packs.flatMap((p) => p.remove.map((it) => it.id)));
  const keptPhotos = markKept
    ? session.results.filter((r) => !r.diagnostic.error && !removeIds.has(r.item.id) && findable(r.item)).map((r) => asPhoto(r.item))
    : [];
  const keptNow = keptSent ? [] : keptPhotos;
  const batchDone = Math.ceil(sent.size / SHORTCUT_BATCH);
  const batches = batchDone + Math.ceil(pendingItems.length / SHORTCUT_BATCH);

  const markDone = (keys: string[]) => {
    const fresh = keys.filter((key) => !done.has(key));
    if (fresh.length === 0) return;
    setDone((set) => new Set([...set, ...fresh]));
    onConfirm(day.packs.filter((p) => fresh.includes(p.key)));
    // Tous les paquets à supprimer sont traités : la séance est terminée.
    if (todo.every((p) => done.has(p.pack.key) || fresh.includes(p.pack.key))) onFinished();
  };

  const send = () => {
    runShortcut(pendingPhotos, keptNow);
    if (keptNow.length > 0) setKeptSent(true);
    const nowSent = new Set([...sent, ...batchItems.map((it) => it.id)]);
    setSent(nowSent);
    // Un paquet est « fait » quand toutes ses photos à supprimer sont parties. S'il en reste à supprimer à la main
    // (sans date), il attend que l'utilisateur touche « Fait ».
    markDone(pendingPacks.filter((p) => p.remove.every((it) => nowSent.has(it.id))).map((p) => p.pack.key));
  };

  const reopen = (keys: string[]) => {
    setDone((set) => new Set([...set].filter((key) => !keys.includes(key))));
    onUnconfirm(day.packs.filter((p) => keys.includes(p.key)));
  };

  const allSent = totalRemove > 0 && pendingItems.length === 0 && manual.length === 0;
  const onlyManual = totalRemove > 0 && pendingItems.length === 0 && manual.length > 0;

  return (
    <main className="page">
      <div className={`barre-haut${scrolled ? ' visible' : ''}`} aria-hidden={!scrolled}>
        <strong>Supprimer</strong>
      </div>
      <header className="grand-titre">
        <h1>Supprimer</h1>
        <p className="sous-titre">Dans l’app Photos, par votre raccourci « {SHORTCUT_NAME} ».</p>
      </header>

      {unverified > 0 && pendingAll.length > 0 && (
        <section className="alerte alerte-bloc">
          <p>
            <strong>
              {unverified} pose{unverified > 1 ? 's' : ''} pas encore vérifiée{unverified > 1 ? 's' : ''}
            </strong>{' '}
            : leurs photos à supprimer suivent le choix de l’app, sans que vous l’ayez validé. Vérifiez-les d’abord (tri
            éclair), ou supprimez quand même si le choix de l’app vous va.
          </p>
          <button className="bouton principal" onClick={onVerify}>
            Les vérifier maintenant
          </button>
        </section>
      )}

      {totalRemove === 0 ? (
        <section className="carte heros">
          <span className="heros-icone vert">
            <IconCoche size={30} />
          </span>
          <h2>Rien à supprimer</h2>
          <p className="doux">Toutes les photos de la séance sont gardées.</p>
          {keptPhotos.length > 0 &&
            (keptSent ? (
              <p className="note">Envoyées au raccourci pour l’album « {KEPT_ALBUM} ».</p>
            ) : (
              <button
                className="bouton principal"
                onClick={() => {
                  runShortcut([], keptPhotos);
                  setKeptSent(true);
                }}
              >
                Ranger les {plural(keptPhotos.length, 'photo')} dans « {KEPT_ALBUM} »
              </button>
            ))}
        </section>
      ) : allSent ? (
        <section className="carte heros">
          <span className="heros-icone vert">
            <IconCoche size={30} />
          </span>
          <h2>C’est fait</h2>
          <p className="doux">
            {sent.size > 0
              ? `${plural(sent.size, 'photo')} envoyée${sent.size > 1 ? 's' : ''} au raccourci. `
              : 'Tous les paquets sont marqués « Fait ». '}
            Les photos supprimées restent 30 jours dans Photos › Albums › « Supprimés récemment ».
          </p>
          <button
            className="lien"
            onClick={() => {
              setSent(new Set());
              setKeptSent(false);
              reopen(todo.map((p) => p.pack.key));
            }}
          >
            Recommencer l’envoi
          </button>
        </section>
      ) : onlyManual ? (
        <section className="carte heros">
          <span className="heros-icone rouge">
            <IconCorbeille size={30} />
          </span>
          <p className="heros-chiffre">{manual.length}</p>
          <p className="doux">photo{manual.length > 1 ? 's' : ''} à supprimer à la main</p>
          <p className="note">Le raccourci ne peut pas les retrouver : ouvrez « Détail par paquet » plus bas.</p>
        </section>
      ) : (
        <section className="carte heros">
          <span className="heros-icone rouge">
            <IconCorbeille size={30} />
          </span>
          <p className="heros-chiffre">{pendingItems.length}</p>
          <p className="doux">photo{pendingItems.length > 1 ? 's' : ''} à supprimer</p>
          {batches > 1 && (
            <div className="lots" aria-label={`Lot ${batchDone + 1} sur ${batches}`}>
              {Array.from({ length: batches }, (_, k) => (
                <span key={k} className={k < batchDone ? 'fait' : k === batchDone ? 'actuel' : ''} />
              ))}
            </div>
          )}
          <button className="bouton danger" onClick={send}>
            {batches > 1 ? `Supprimer le lot ${batchDone + 1} sur ${batches} (${sendable})` : `Supprimer ${plural(sendable, 'photo')}`}
          </button>
          <p className="note">
            Le raccourci montre d’abord les photos trouvées : vérifiez qu’il y en a <strong>{sendable}</strong>, touchez
            « Terminé », puis confirmez.
            {batches > 1 && ' L’iPhone n’en accepte que 49 à la fois : revenez ici après chaque lot.'}
            {keptNow.length > 0 &&
              ` Il range aussi les ${plural(keptNow.length, 'photo')} gardée${keptNow.length > 1 ? 's' : ''} dans l’album « ${KEPT_ALBUM} » (comptez une minute de plus).`}
          </p>
          <details className="note">
            <summary>Liste envoyée (pour vérifier)</summary>
            <pre className="liste-envoyee">{shortcutText(pendingPhotos, keptNow)}</pre>
          </details>
        </section>
      )}

      {manual.length > 0 && (
        <p className="alerte">
          {plural(manual.length, 'photo')} sans heure de prise de vue : le raccourci ne peut pas la retrouver sans risque
          d’erreur. Supprimez-la à la main (plus bas, « À la main »).
        </p>
      )}

      <section className="groupe">
        <GuideRaccourci />
      </section>

      {todo.length > 0 && (
        <details className="groupe repli">
          <summary>
            <span>Détail par paquet</span>
            <span className="doux">{plural(todo.length, 'paquet')}</span>
          </summary>
          <p className="note">
            À la main (photos d’un autre appareil, GoPro, ou sans date) : dans Photos, touchez « Sélectionner », touchez les
            photos marquées <span className="rouge">✕</span> ci-dessous (même ordre), puis la corbeille. Revenez ensuite
            toucher « Fait ».
          </p>
          {todo.map(({ pack, number, remove }) => {
            const isDone = done.has(pack.key);
            const keep = pack.pack.items.length - remove.length;
            return (
              <div className={`detail-paquet${isDone ? ' fait' : ''}`} key={pack.key}>
                <div className="paquet-tete">
                  <div>
                    <h3>Paquet {number}</h3>
                    <p className="paquet-meta">
                      {formatDate(pack.pack.startAt)} · {formatTime(pack.pack.startAt)}
                      {pack.pack.endAt !== pack.pack.startAt && ` → ${formatTime(pack.pack.endAt)}`}
                    </p>
                  </div>
                  <button
                    className={`capsule petite${isDone ? ' vert' : ''}`}
                    onClick={() => {
                      if (isDone) reopen([pack.key]);
                      else markDone([pack.key]);
                    }}
                  >
                    {isDone ? (
                      <>
                        <IconCoche size={12} /> Fait
                      </>
                    ) : (
                      'Fait'
                    )}
                  </button>
                </div>
                <p className="paquet-meta">
                  <span className="rouge">{remove.length} à supprimer</span> · {keep} à garder
                  {keep === 0 && ' (toutes ratées)'}
                </p>
                {!isDone && (
                  <div className="grille">
                    {pack.pack.items.map((item) => {
                      const state = finalKeep(item, pack, choices);
                      const look = stateLook(state);
                      const url = session.thumbnails.get(item.id);
                      return (
                        <button
                          key={item.id}
                          className={`vignette ${look.css}`}
                          onClick={() => setViewing(positionOf.get(item.id) ?? 0)}
                        >
                          {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
                          <span className="numero">{numberOf(item.id)}</span>
                          <span className={`etat ${look.css}`}>
                            {state.review ? '?' : state.keep ? <IconCoche size={12} /> : <IconCroix size={11} />}
                          </span>
                          <span className="heure">{formatTime(item.capturedAt)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </details>
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
