import { useMemo, useState } from 'react';
import { accuracy, type ShadowComparison, FEATURE_NAMES, evaluateDay, preferencePairs, type ChoiceRecord, type PoseValidation, type DayAnalysis, type LearnedWeights } from '../../engine';
import type { EyeProgress, Session } from '../session';
import { BarreOeil } from '../BarreOeil';
import { tasteLine } from '../reasons';
import { agreementLine, buildReport, copyText, shareText, summarize } from '../report';
import { RapportsEnregistres } from '../RapportsEnregistres';
import { SauvegardeGouts } from '../SauvegardeGouts';
import { GuideRaccourci } from '../GuideRaccourci';
import { GuideAlbums } from '../GuideAlbums';
import type { SavedReport } from '../../platform/storage/reports';
import { formatDate, formatMs, plural } from '../format';
import { IconChevron, IconFermer, IconLabo, IconPartager } from '../icons';
import { useScrolled } from '../useScrolled';
import { Seances } from '../Seances';
import { EtatModeles } from '../EtatModeles';
import type { ModelsState } from '../../platform/storage/models';
import type { SessionSummary } from '../../platform/storage/sessionStore';
import { APP_VERSION } from '../version';
import { checkForUpdate } from '../../platform/update';

interface Props {
  /** Séance en cours (absente depuis l'accueil). */
  session: Session | null;
  day: DayAnalysis | null;
  records: ChoiceRecord[];
  learned: LearnedWeights;
  reports: SavedReport[];
  onRestore: (records: ChoiceRecord[], validations?: PoseValidation[]) => Promise<{ added: number; updated: number }>;
  onForget: () => void;
  validations: PoseValidation[];
  /** Séances hors statistiques, et l'interrupteur de chacune. */
  excluded: ReadonlySet<string>;
  onToggleCounted: (sessionId: string, count: boolean) => void;
  /** Comparaison du nouvel œil (calculée à part, au calme). */
  shadow: ShadowComparison | null;
  /** Modèles du nouvel œil : état du téléchargement, et « Réessayer » s'il a échoué. */
  models: ModelsState | null;
  onRetryModels: () => void;
  /** Nouvel œil en arrière-plan sur la séance en cours. */
  eyeProgress: EyeProgress | null;
  /** « Lancer le nouvel œil » : rend le nombre de photos lancées. */
  onLaunchEye: () => Promise<number>;
  seances: SessionSummary[];
  currentId: string | null;
  onReopen: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  /** Ouvert par-dessus l'accueil : bouton de fermeture. */
  onClose?: () => void;
  /** Ouvre le labo d'apprentissage. */
  onLabo?: () => void;
  /** Poses jamais vues dans le tri éclair, par séance (null : pas encore cherchées). */
  unseen: Map<string, number> | null;
  onFindUnseen: () => Promise<Map<string, number>>;
  onReviewUnseen: (sessionId: string) => void;
}

/** Réglages : sauvegarde des goûts, séances, raccourci, rapports, diagnostic et effacement (caché). */
export function Reglages({ session, day, records, learned, reports, onRestore, onForget, validations, excluded, onToggleCounted, shadow, models, onRetryModels, eyeProgress, onLaunchEye, seances, currentId, onReopen, onDeleteSession, onClose, onLabo, unseen, onFindUnseen, onReviewUnseen }: Props) {
  const scrolled = useScrolled();
  return (
    <main className={`page${onClose ? ' par-dessus' : ''}`}>
      <div className={`barre-haut${scrolled ? ' visible' : ''}`} aria-hidden={!scrolled}>
        <strong>Réglages</strong>
      </div>
      <header className="grand-titre">
        <div className="grand-titre-ligne">
          <h1>Réglages</h1>
          {onClose && (
            <button className="rond" onClick={onClose} aria-label="Fermer">
              <IconFermer size={16} />
            </button>
          )}
        </div>
      </header>

      <h2 className="titre-groupe">Mes goûts</h2>
      <SauvegardeGouts records={records} onRestore={onRestore} validations={validations} />
      <Justesse validations={validations} excluded={excluded} shadow={shadow} sessionId={session?.id ?? null} />
      {onLabo && (
        <section className="groupe">
          <button className="ligne-info ligne-bouton" onClick={onLabo}>
            <span className="icone-ronde">
              <IconLabo size={18} />
            </span>
            <div>
              <strong>Labo d’apprentissage</strong>
              <span className="note bloc">Progrès séance par séance, candidats en concurrence, vos goûts</span>
            </div>
            <IconChevron size={14} className="chevron" />
          </button>
        </section>
      )}
      <EtatModeles models={models} onRetry={onRetryModels} />
      <BarreOeil progress={eyeProgress} onLaunch={onLaunchEye} />

      <h2 className="titre-groupe">Séances</h2>
      <JamaisVues unseen={unseen} seances={seances} onFind={onFindUnseen} onReview={onReviewUnseen} />
      <Seances seances={seances} currentId={currentId} onReopen={onReopen} onDelete={onDeleteSession} excluded={excluded} onToggleCounted={onToggleCounted} />

      <h2 className="titre-groupe">Raccourci de suppression</h2>
      <section className="groupe">
        <GuideRaccourci />
      </section>

      <h2 className="titre-groupe">Album « À trier »</h2>
      <section className="groupe">
        <GuideAlbums />
      </section>

      {session && day && <RapportEtDiagnostic session={session} day={day} records={records} learned={learned} validations={validations} excluded={excluded} shadow={shadow} />}
      {!session && <h2 className="titre-groupe">Envoyer à Claude</h2>}
      <RapportsEnregistres reports={reports} />

      <details className="groupe repli avance">
        <summary>
          <span>Avancé</span>
        </summary>
        <p className="note">
          Efface tous vos choix de cet iPhone : l’app oublie vos goûts et revient à ses réglages de départ. Votre fichier
          de sauvegarde dans iCloud Drive n’est pas touché.
        </p>
        <button
          className="bouton discret rouge"
          disabled={records.length === 0}
          onClick={() => {
            if (!window.confirm(`Oublier vos ${records.length} choix ?`)) return;
            if (!window.confirm('Vraiment ? Sans sauvegarde, ils seront perdus.')) return;
            onForget();
          }}
        >
          Oublier mes choix
        </button>
      </details>

      <p className="note centre">Photo Triage · {APP_VERSION}</p>
      <button
        className="lien centre-bloc"
        onClick={() => {
          checkForUpdate(true);
          window.alert('Recherche lancée. Si une nouvelle version existe, un encadré « Nouvelle version prête » apparaît en haut de l’écran d’ici une minute.');
        }}
      >
        Rechercher une mise à jour
      </button>
    </main>
  );
}

/** Justesse de l'app, mesurée honnêtement sur les poses validées dans le tri éclair (le chiffre qui doit monter). */
function Justesse({ validations, excluded, shadow, sessionId }: { validations: PoseValidation[]; excluded: ReadonlySet<string>; shadow: ShadowComparison | null; sessionId: string | null }) {
  // Séances hors statistiques écartées du total ; la séance ouverte reste mesurée.
  const all = accuracy(validations.filter((v) => !excluded.has(v.sessionId)));
  if (all.poses.total === 0) return null;
  const here = accuracy(validations.filter((v) => v.sessionId === sessionId));
  const pct = (a: { right: number; total: number }) => Math.round((a.right / a.total) * 100);
  return (
    <section className="groupe">
      <div className="ligne-info">
        <span className="icone-ronde vert-fond">%</span>
        <div>
          <strong>
            Justesse de l’app : {pct(all.photos)} % des photos, {pct(all.poses)} % des poses
          </strong>
          <span className="note bloc">
            Sur {all.poses.total} poses que vous avez validées dans le tri éclair
            {here.poses.total > 0 ? ` · cette séance : ${pct(here.photos)} % des photos${sessionId && excluded.has(sessionId) ? ' (hors statistiques)' : ''}` : ''}. Objectif : 80 %.
          </span>
        </div>
      </div>
      <p className="note">
        {shadow && shadow.tested > 0
          ? `Nouvel œil, en coulisse : il met la photo gardée devant dans ${Math.round((shadow.eye / shadow.tested) * 100)} % des cas, contre ${Math.round((shadow.formula / shadow.tested) * 100)} % pour la formule actuelle (${shadow.tested} comparaisons).`
          : `Nouvel œil, en coulisse : il apprend de vos poses validées ; la comparaison avec la formule actuelle apparaîtra quand 2 séances auront des poses validées qu’il a regardées (aujourd’hui : ${shadow?.sessions ?? 0}).`}
      </p>
    </section>
  );
}

function RapportEtDiagnostic({
  session,
  day,
  records,
  learned,
  validations,
  excluded,
  shadow,
}: {
  session: Session;
  day: DayAnalysis;
  records: ChoiceRecord[];
  learned: LearnedWeights;
  validations: PoseValidation[];
  excluded: ReadonlySet<string>;
  shadow: ShadowComparison | null;
}) {
  const summary = useMemo(() => summarize(session), [session]);
  const report = useMemo(() => buildReport(session, day, records, learned, validations, shadow, excluded), [session, day, records, learned, validations, shadow, excluded]);
  const pairs = useMemo(() => preferencePairs(records).length, [records]);
  const agreement = useMemo(() => evaluateDay(day, records), [day, records]);
  const learnedList = FEATURE_NAMES.filter((name) => learned[name] !== undefined).sort((a, b) => Math.abs(learned[b]!) - Math.abs(learned[a]!));
  const [copied, setCopied] = useState<'non' | 'oui' | 'echec'>('non');
  const dateOk = summary.withoutDate === 0 && summary.withDate > 0;

  return (
    <>
      <h2 className="titre-groupe">Envoyer à Claude</h2>
      <section className="groupe">
        <p className="note">{agreementLine(agreement)}</p>
        <div className="rapports-actions">
          <button
            className="bouton principal"
            onClick={async () => {
              const result = await shareText(report, 'Rapport Photo Triage');
              if (result === 'impossible') setCopied((await copyText(report)) ? 'oui' : 'echec');
            }}
          >
            <IconPartager size={17} /> Partager
          </button>
          <button className="bouton" onClick={async () => setCopied((await copyText(report)) ? 'oui' : 'echec')}>
            {copied === 'oui' ? 'Copié ✓' : 'Copier'}
          </button>
        </div>
        {copied === 'echec' && <p className="alerte">Copie impossible : ouvrez « Rapport complet » plus bas et sélectionnez le texte.</p>}
        <p className="note">Texte seulement (noms, dates, mesures), aucune image. « Partager », puis choisissez l’app Claude.</p>
      </section>

      <details className="groupe repli">
        <summary>
          <span>Diagnostic</span>
          <span className={dateOk ? 'vert' : 'rouge'}>{dateOk ? 'tout va bien' : 'dates manquantes'}</span>
        </summary>
        <p>
          {summary.withDate} avec date · {summary.withoutDate} sans date · {summary.errors} erreur{summary.errors > 1 ? 's' : ''} de
          décodage · {formatMs(session.totalMs)} au total · décodage moyen {formatMs(summary.avgDecodeMs)}
        </p>
        <p className="note">
          {records.length} choix enregistrés sur cet iPhone ({records.filter((r) => r.implicit).length} laissés tels quels),{' '}
          {pairs} comparaison{pairs > 1 ? 's' : ''} utilisable{pairs > 1 ? 's' : ''}.
        </p>
        {learnedList.length > 0 && (
          <ul className="gouts">
            {learnedList.map((name) => (
              <li key={name} className={learned[name]! > 0 ? 'plus' : 'moins'}>
                {tasteLine(name, learned[name]!)}
              </li>
            ))}
          </ul>
        )}
        <details className="sous-repli">
          <summary>Rapport complet</summary>
          <textarea className="rapport" readOnly value={report} rows={10} />
        </details>
      </details>
    </>
  );
}

/**
 * Poses jamais vues dans le tri éclair (utilisateur, 27/11 : rafales jamais comparées, « considérées comme traitées »).
 * La recherche reprend chaque séance gardée ; « Revoir » la rouvre et lance le tri éclair sur ces poses.
 */
function JamaisVues({
  unseen,
  seances,
  onFind,
  onReview,
}: {
  unseen: Map<string, number> | null;
  seances: SessionSummary[];
  onFind: () => Promise<Map<string, number>>;
  onReview: (sessionId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const total = unseen ? [...unseen.values()].reduce((a, b) => a + b, 0) : 0;
  const when = (s: SessionSummary) => (s.firstAt ? `photos du ${formatDate(s.firstAt)}` : 'sans date');
  return (
    <section className="groupe">
      <strong>Poses jamais vues</strong>
      <p className="note">
        Poses de vos séances gardées qui ne sont jamais passées par le tri éclair (rafales comprises), dont une photo au moins
        est encore gardée. Revoyez-les : l’app propose, vous validez ; rien n’est supprimé sans vous.
      </p>
      {unseen === null ? (
        <button
          className="bouton"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onFind();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Recherche…' : 'Chercher les poses jamais vues'}
        </button>
      ) : total === 0 ? (
        <p className="note">Aucune : toutes les poses de vos séances ont été vues ✓</p>
      ) : (
        <ul className="seances">
          {seances
            .filter((s) => unseen.has(s.sessionId))
            .map((s) => (
              <li key={s.sessionId} className="ligne-info">
                <div>
                  <strong>{plural(unseen.get(s.sessionId)!, 'pose')} jamais vue{unseen.get(s.sessionId)! > 1 ? 's' : ''}</strong>
                  <span className="note bloc">Séance {when(s)}</span>
                </div>
                <button className="bouton" onClick={() => onReview(s.sessionId)}>
                  Revoir
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
