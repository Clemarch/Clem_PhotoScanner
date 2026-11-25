import { Fragment, useMemo, useState } from 'react';
import { asideKind, type DayAnalysis, type MediaItem, type PackAnalysis } from '../../engine';
import type { Session } from '../session';
import { finalKeep, stateLook, type Choice, type Choices } from '../choices';
import { formatShortTime, formatSize, plural } from '../format';
import { asideLabel, sceneGoal, sceneLabel } from '../reasons';
import { Visionneuse, type ViewerEntry } from './Visionneuse';
import { dayEntries } from '../entries';
import type { LastRun } from '../../platform/storage/lastRun';
import { IconCoche, IconCroix, IconEtoile, IconFleche, IconPlus } from '../icons';
import { useScrolled } from '../useScrolled';
import { BarreOeil } from '../BarreOeil';
import type { EyeProgress } from '../session';

interface Props {
  session: Session;
  day: DayAnalysis;
  /** Écart de temps utilisé pour signaler une rafale coupée entre deux séances. */
  gap: number;
  /** Rattacher un paquet au précédent (true) ou annuler (false). */
  onJoin: (key: string, join: boolean) => void;
  /** Choisir de nouvelles photos (nouvelle séance). */
  onNewDay: (files: File[]) => void;
  choices: Choices;
  /** Séance triée juste avant celle-ci, pour signaler une rafale coupée entre deux séances. */
  previousRun: LastRun | null;
  onChoose: (item: MediaItem, pack: PackAnalysis, choice: Choice | null) => void;
  onComment: (item: MediaItem, comment: string) => void;
  /** Aller à l'onglet « Supprimer ». */
  onGoDelete: () => void;
  /** Tri éclair : poses encore à trancher, poses « sûres » non montrées, et total. */
  eclair: { pending: number; sure: number; total: number };
  onEclair: (which: 'suite' | 'sures' | 'tout') => void;
  /** Images retrouvées en re-choisissant les photos (séance reprise dont les images ne se relisent plus). */
  recovering: { done: number; total: number; found?: number } | null;
  onRecoverImages: (files: File[]) => void;
  /** Nouvel œil en arrière-plan sur cette séance (visible pendant qu'on trie). */
  eyeProgress: EyeProgress | null;
}

/** Le paquet mêle-t-il plusieurs types de photo (personnes et paysages, par exemple) ? */
const mixed = (pack: PackAnalysis): boolean => new Set(pack.sceneOf.values()).size > 1;

const longDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const dayOf = (ms: number | null) => (ms === null ? '' : new Date(ms).toDateString());

const HINT_KEY = 'photo-triage.astuce-tri';
const hintSeen = (): boolean => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};

export function Paquets({ session, day, gap, onJoin, onNewDay, choices, previousRun, onChoose, onComment, onGoDelete, eclair, onEclair, recovering, onRecoverImages, eyeProgress }: Props) {
  // Séance sur plusieurs jours : la date s'affiche au-dessus du premier paquet de chaque jour.
  const multiDay = new Set(day.packs.map((p) => dayOf(p.pack.startAt))).size > 1;
  // Photos dont l'image n'a pas pu être relue après une fermeture de l'app (séance reprise ou rouverte).
  const missing = session.results.filter((r) => r.item.kind === 'photo' && !r.item.isRaw && !r.diagnostic.error && !session.thumbnails.has(r.item.id)).length;
  const [viewing, setViewing] = useState<number | null>(null);
  const [hint, setHint] = useState(() => !hintSeen());
  const scrolled = useScrolled();
  const numberOf = (id: string) => day.dayIndex.get(id) ?? null;

  // Toutes les photos de la journée dans l'ordre, pour feuilleter d'un paquet à l'autre.
  // Fichiers mis de côté qui ont une image : captures d'écran, documents (les RAW et vidéos n'en ont pas).
  const asideShown = useMemo(() => day.setAside.filter((item) => session.thumbnails.has(item.id)), [day, session]);
  const entries = useMemo<ViewerEntry[]>(() => dayEntries(day, new Set(asideShown.map((item) => item.id))), [day, asideShown]);
  const positionOf = useMemo(() => new Map(entries.map((e, i) => [e.item.id, i])), [entries]);

  const totals = useMemo(() => {
    let keep = 0;
    let review = 0;
    let total = 0;
    let firstReview: number | null = null;
    day.packs.forEach((pack, i) => {
      for (const item of pack.pack.items) {
        total++;
        const state = finalKeep(item, pack, choices);
        if (state.review) {
          review++;
          firstReview ??= i;
        } else if (state.keep) keep++;
      }
    });
    return { keep, review, total, remove: total - keep - review, firstReview };
  }, [day, choices]);

  const first = day.packs[0]?.pack.startAt ?? null;
  const last = day.packs[day.packs.length - 1]?.pack.endAt ?? null;
  const when =
    first === null ? '' : dayOf(first) === dayOf(last) ? longDate.format(first) : `${shortDate.format(first)} → ${shortDate.format(last!)}`;
  const summary = `${totals.keep} gardée${totals.keep > 1 ? 's' : ''} · ${totals.remove} à supprimer`;

  const tile = (item: MediaItem, pack: PackAnalysis | null, big = false) => {
    const number = numberOf(item.id);
    const url = session.thumbnails.get(item.id);
    const state = pack ? finalKeep(item, pack, choices) : null;
    const best = pack?.decisions.get(item.id)?.code === 'meilleure' && pack.pack.items.length > 1 && state?.keep && !state.review;
    const look = state ? stateLook(state) : null;
    const classes = ['vignette', look?.css ?? '', big ? 'grande' : ''].filter(Boolean).join(' ');
    return (
      <button key={item.id} className={classes} onClick={() => setViewing(positionOf.get(item.id) ?? 0)} aria-label={`Photo ${number ?? ''}, ${look?.label ?? 'mise de côté'}`}>
        {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
        {number !== null && <span className="numero">{number}</span>}
        {best && (
          <span className="etoile" aria-label="la meilleure de sa pose">
            <IconEtoile size={11} />
          </span>
        )}
        {state && (
          <span className={`etat ${look!.css}${state.byUser ? ' vous' : ''}`}>
            {state.review ? '?' : state.keep ? <IconCoche size={12} /> : <IconCroix size={11} />}
          </span>
        )}
      </button>
    );
  };

  return (
    <main className="page">
      <div className={`barre-haut${scrolled ? ' visible' : ''}`} aria-hidden={!scrolled}>
        <strong>Tri</strong>
        <span>{summary}</span>
      </div>

      <header className="grand-titre">
        <div className="grand-titre-ligne">
          <h1>Tri</h1>
          <label className="capsule">
            <IconPlus size={15} /> Nouvelle séance
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
        <p className="sous-titre">
          {when && <span className="majuscule">{when}</span>}
          {when && ' · '}
          {plural(day.packs.length, 'paquet')} · {plural(totals.total, 'photo')}
        </p>
      </header>

      {totals.total > 0 && (
        <div className="resume" role="status">
          <span className="resume-case vert">
            <strong>{totals.keep}</strong> gardée{totals.keep > 1 ? 's' : ''}
          </span>
          <span className="resume-case rouge">
            <strong>{totals.remove}</strong> à supprimer
          </span>
          {totals.review > 0 && (
            <button
              className="resume-case bleu"
              onClick={() => document.getElementById(`paquet-${(totals.firstReview ?? 0) + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <strong>{totals.review}</strong> à vérifier
            </button>
          )}
        </div>
      )}

      {eclair.total > 0 && (
        <section className="carte-eclair">
          <h3>⚡ Tri éclair</h3>
          {eclair.pending > 0 ? (
            <>
              <p className="doux">
                {plural(eclair.pending, 'pose')} à trancher, une par écran, environ {Math.max(1, Math.round((eclair.pending * 4) / 60))} min. La
                proposition de l’app est déjà cochée : vous touchez seulement ce qui ne va pas.
              </p>
              <button className="bouton principal grand" onClick={() => onEclair('suite')}>
                {eclair.pending + eclair.sure < eclair.total ? 'Continuer' : 'Commencer'}
              </button>
            </>
          ) : (
            <p className="doux">Toutes les poses sont tranchées ✓</p>
          )}
          {eclair.sure > 0 && (
            <button className="lien" onClick={() => onEclair('sures')}>
              + {plural(eclair.sure, 'pose sûre', 'poses sûres')} non montrée{eclair.sure > 1 ? 's' : ''} (l’app y a fait ses preuves) : voir
            </button>
          )}
          {eclair.pending === 0 && (
            <button className="lien" onClick={() => onEclair('tout')}>
              Tout revoir
            </button>
          )}
        </section>
      )}

      <BarreOeil progress={eyeProgress} />

      {totals.total > 0 && (
        <p className="legende" aria-label="Légende">
          <span>
            <i className="etoile-l">
              <IconEtoile size={9} />
            </i>
            meilleure de sa pose
          </span>
          <span>
            <i className="garder">
              <IconCoche size={9} />
            </i>
            gardée
          </span>
          <span>
            <i className="verifier">?</i>prise par erreur ?
          </span>
          <span>
            <i className="supprimer">
              <IconCroix size={8} />
            </i>
            à supprimer
          </span>
        </p>
      )}

      {hint && (
        <div className="astuce">
          <p>
            Touchez une photo pour la voir en grand et changer la décision si besoin. Ce que vous ne touchez pas, vous
            l’acceptez. Les photos marquées <span className="bleu">?</span> ont peut-être été prises par erreur : à vous de
            trancher (sans choix, elles sont gardées).
          </p>
          <button
            className="lien fort"
            onClick={() => {
              setHint(false);
              try {
                localStorage.setItem(HINT_KEY, '1');
              } catch {
                // Mémoire seulement.
              }
            }}
          >
            Compris
          </button>
        </div>
      )}

      {missing > 0 || (recovering && recovering.found === undefined) ? (
        <ImagesManquantes missing={missing} recovering={recovering} onFiles={onRecoverImages} />
      ) : recovering?.found !== undefined ? (
        <p className="info">Images retrouvées : tout est de nouveau visible, et le zoom montre la photo d’origine.</p>
      ) : session.reopened ? (
        <p className="info">Séance rouverte. Vos choix sont repris. Le zoom montre l’aperçu, pas la photo d’origine.</p>
      ) : session.restored ? (
        <p className="info">
          Séance reprise là où vous l’aviez laissée : vos choix et commentaires sont conservés. Seule différence : le zoom
          montre l’aperçu, pas la photo d’origine.
        </p>
      ) : null}

      {session.faceError && (
        <p className="alerte">
          La recherche de visages ou d’objets n’a pas pu démarrer : le classement est moins fiable. Envoyez-moi le rapport
          (Réglages › Envoyer à Claude).
        </p>
      )}

      {day.packs.map((pack, i) => {
        const states = pack.pack.items.map((item) => finalKeep(item, pack, choices));
        const keep = states.filter((s) => s.keep && !s.review).length;
        const review = states.filter((s) => s.review).length;
        const remove = states.filter((s) => !s.keep).length;
        const newDay = multiDay && (i === 0 || dayOf(day.packs[i - 1]!.pack.startAt) !== dayOf(pack.pack.startAt));
        const start = pack.pack.startAt;
        const end = pack.pack.endAt;
        const overlaps = previousRun && start !== null && start >= previousRun.firstAt && start <= previousRun.lastAt;
        const follows = previousRun && start !== null && start > previousRun.lastAt && start - previousRun.lastAt <= gap * 1000;
        const precedes = previousRun && end !== null && end < previousRun.firstAt && previousRun.firstAt - end <= gap * 1000;
        return (
          <Fragment key={pack.key}>
            {newDay && start !== null && <h2 className="jour">{longDate.format(start)}</h2>}
            <section className={`paquet${review > 0 ? ' a-trancher' : ''}`} id={`paquet-${i + 1}`}>
              <header className="paquet-tete">
                <div>
                  <h3>
                    Paquet {i + 1} <span className="type">{mixed(pack) ? 'Mixte' : sceneLabel[pack.scene]}</span>
                  </h3>
                  <p className="paquet-meta">
                    {formatShortTime(start)}
                    {end !== null && start !== null && end - start >= 60_000 && ` → ${formatShortTime(end)}`} ·{' '}
                    {plural(pack.pack.items.length, 'photo')}
                    {pack.poses.length > 1 && ` · ${pack.poses.length} poses`}
                  </p>
                </div>
                <div className="paquet-compte">
                  <span className="pastille-compte vert" aria-label={`${keep} gardée(s)`}>
                    <IconCoche size={11} /> {keep}
                  </span>
                  {review > 0 && (
                    <span className="pastille-compte bleu" aria-label={`${review} à vérifier`}>
                      ? {review}
                    </span>
                  )}
                  {remove > 0 && (
                    <span className="pastille-compte rouge" aria-label={`${remove} à supprimer`}>
                      <IconCroix size={10} /> {remove}
                    </span>
                  )}
                </div>
              </header>
              {!mixed(pack) && <p className="cherche">On cherche : {sceneGoal[pack.scene]}.</p>}
              {review > 0 && (
                <p className="a-trancher-note">
                  {review > 1 ? `${review} photos peut-être prises par erreur` : 'Une photo peut-être prise par erreur'} (pastille{' '}
                  <span className="bleu">?</span>) : gardez ou supprimez. Sans choix, {review > 1 ? 'elles sont gardées' : 'elle est gardée'}.
                </p>
              )}
              {overlaps && (
                <p className="alerte">
                  Ce paquet a déjà été vu lors de la séance précédente (jusqu’à {formatShortTime(previousRun.lastAt)}) : vos
                  choix d’alors sont repris.
                </p>
              )}
              {(follows || precedes) && (
                <p className="alerte">
                  Ce paquet touche la séance précédente : une rafale a peut-être été coupée en deux. Vérifiez qu’une même
                  pose n’est pas gardée deux fois.
                </p>
              )}
              {pack.poses.map((pose) => (
                <div className="pose" key={pose.id}>
                  {pack.poses.length > 1 && (
                    <span className="pose-lettre">
                      Pose {pose.label}
                      {mixed(pack) && ` · ${sceneLabel[pack.sceneOf.get(pose.items[0]!.id) ?? pack.scene]}`}
                    </span>
                  )}
                  <div className="grille">
                    {pose.items.map((item) =>
                      tile(item, pack, pose.items.length >= 3 && pack.decisions.get(item.id)?.code === 'meilleure' && finalKeep(item, pack, choices).keep),
                    )}
                  </div>
                </div>
              ))}
              {(i > 0 || pack.joined.length > 0) && (
                <div className="rattacher">
                  {i > 0 && (
                    <button className="lien" onClick={() => onJoin(pack.key, true)}>
                      Même scène que le paquet {i} : réunir
                    </button>
                  )}
                  {pack.joined.length > 0 && (
                    <button className="lien" onClick={() => pack.joined.forEach((key) => onJoin(key, false))}>
                      Séparer ({pack.joined.length + 1} paquets réunis)
                    </button>
                  )}
                </div>
              )}
            </section>
          </Fragment>
        );
      })}

      {day.undated.length > 0 && (
        <section className="paquet">
          <header className="paquet-tete">
            <h3>Sans date</h3>
            <span className="paquet-meta">{plural(day.undated.length, 'photo')}</span>
          </header>
          <p className="cherche">La date de prise de vue est absente : impossible de ranger ces photos dans un paquet.</p>
          <div className="grille">{day.undated.map((item) => tile(item, null))}</div>
        </section>
      )}

      {day.setAside.length > 0 && (
        <section className="paquet">
          <header className="paquet-tete">
            <h3>Mis de côté</h3>
            <span className="paquet-meta">{plural(day.setAside.length, 'fichier')}</span>
          </header>
          <p className="cherche">
            Toujours gardés : captures d’écran, images enregistrées, photos d’un document ou d’un écran, RAW et vidéos.
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

      {totals.remove > 0 && (
        <button className="flottant" onClick={onGoDelete}>
          Supprimer {plural(totals.remove, 'photo')} <IconFleche size={17} />
        </button>
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

/** Séance reprise dont des images ne se relisent plus : re-choisir les mêmes photos les refait (sans refaire l'analyse). */
function ImagesManquantes({
  missing,
  recovering,
  onFiles,
}: {
  missing: number;
  recovering: { done: number; total: number; found?: number } | null;
  onFiles: (files: File[]) => void;
}) {
  if (recovering && recovering.found === undefined)
    return (
      <p className="info">
        Images en cours de récupération : {recovering.done} / {recovering.total}…
      </p>
    );
  return (
    <div className="alerte-bloc info">
      <p>
        <strong>{missing > 1 ? `${missing} images ne se sont pas rechargées.` : 'Une image ne s’est pas rechargée.'}</strong> Vos choix
        sont intacts. Pour revoir les photos : touchez le bouton ci-dessous et choisissez les mêmes photos qu’au départ.
        L’analyse n’est pas refaite, cela prend quelques secondes.
      </p>
      {recovering?.found === 0 && (
        <p className="note">Aucune des photos choisies ne correspond à cette séance : vérifiez que ce sont bien les mêmes.</p>
      )}
      <label className="bouton principal">
        Retrouver les images
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) onFiles(files);
          }}
        />
      </label>
    </div>
  );
}
