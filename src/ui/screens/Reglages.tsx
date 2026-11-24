import { useMemo, useState } from 'react';
import { accuracy, type ShadowComparison, FEATURE_NAMES, evaluateDay, preferencePairs, type ChoiceRecord, type PoseValidation, type DayAnalysis, type LearnedWeights } from '../../engine';
import type { Session } from '../session';
import { featureLabel } from '../reasons';
import { agreementLine, buildReport, copyText, shareText, summarize } from '../report';
import { RapportsEnregistres } from '../RapportsEnregistres';
import { SauvegardeGouts } from '../SauvegardeGouts';
import { GuideRaccourci } from '../GuideRaccourci';
import type { SavedReport } from '../../platform/storage/reports';
import { formatDateTime, formatMs, formatOrientation, formatSize } from '../format';
import { IconFermer, IconPartager } from '../icons';
import { useScrolled } from '../useScrolled';
import { Seances } from '../Seances';
import { EtatModeles } from '../EtatModeles';
import type { ModelsState } from '../../platform/storage/models';
import type { SessionSummary } from '../../platform/storage/sessionStore';
import { APP_VERSION } from '../version';

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
  /** Comparaison du nouvel œil (calculée à part, au calme). */
  shadow: ShadowComparison | null;
  /** Modèles du nouvel œil : état du téléchargement, et « Réessayer » s'il a échoué. */
  models: ModelsState | null;
  onRetryModels: () => void;
  /** Nouvel œil en arrière-plan sur la séance en cours. */
  eyeProgress: { done: number; total: number; finished?: boolean } | null;
  seances: SessionSummary[];
  currentId: string | null;
  onReopen: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  /** Ouvert par-dessus l'accueil : bouton de fermeture. */
  onClose?: () => void;
}

/** Réglages : sauvegarde des goûts, séances, raccourci, rapports, diagnostic et effacement (caché). */
export function Reglages({ session, day, records, learned, reports, onRestore, onForget, validations, shadow, models, onRetryModels, eyeProgress, seances, currentId, onReopen, onDeleteSession, onClose }: Props) {
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
      <Justesse validations={validations} shadow={shadow} sessionId={session?.id ?? null} />
      <EtatModeles models={models} onRetry={onRetryModels} />
      {eyeProgress && !eyeProgress.finished && (
        <p className="note marge">
          Nouvel œil : analyse en arrière-plan, {eyeProgress.done} / {eyeProgress.total} photos. Vous pouvez trier pendant ce
          temps.
        </p>
      )}

      <h2 className="titre-groupe">Séances</h2>
      <Seances seances={seances} currentId={currentId} onReopen={onReopen} onDelete={onDeleteSession} />

      <h2 className="titre-groupe">Raccourci de suppression</h2>
      <section className="groupe">
        <GuideRaccourci />
      </section>

      {session && day && <RapportEtDiagnostic session={session} day={day} records={records} learned={learned} validations={validations} shadow={shadow} />}
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
    </main>
  );
}

/** Justesse de l'app, mesurée honnêtement sur les poses validées dans le tri éclair (le chiffre qui doit monter). */
function Justesse({ validations, shadow, sessionId }: { validations: PoseValidation[]; shadow: ShadowComparison | null; sessionId: string | null }) {
  const all = accuracy(validations);
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
            {here.poses.total > 0 ? ` · cette séance : ${pct(here.photos)} % des photos` : ''}. Objectif : 80 %.
          </span>
        </div>
      </div>
      <p className="note">
        {shadow && shadow.tested > 0
          ? `Nouvel œil, en coulisse : il met la photo gardée devant dans ${Math.round((shadow.eye / shadow.tested) * 100)} % des cas, contre ${Math.round((shadow.formula / shadow.tested) * 100)} % pour la formule actuelle (${shadow.tested} comparaisons).`
          : 'Nouvel œil, en coulisse : il apprend de vos poses validées ; la comparaison avec la formule actuelle apparaîtra après 2 séances.'}
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
  shadow,
}: {
  session: Session;
  day: DayAnalysis;
  records: ChoiceRecord[];
  learned: LearnedWeights;
  validations: PoseValidation[];
  shadow: ShadowComparison | null;
}) {
  const summary = useMemo(() => summarize(session), [session]);
  const report = useMemo(() => buildReport(session, day, records, learned, validations, shadow), [session, day, records, learned, validations, shadow]);
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
                {learned[name]! > 0 ? 'Compte plus pour vous : ' : 'Compte moins pour vous : '}
                {featureLabel[name]}
              </li>
            ))}
          </ul>
        )}
        <details className="sous-repli">
          <summary>Détail par photo</summary>
          <ul className="fiches">
            {session.results.map(({ item, diagnostic }, i) => (
              <li key={item.id} className={item.capturedAt === null || diagnostic.error ? 'probleme' : ''}>
                <div className="fiche-titre">
                  <span className="numero-fiche">{i + 1}</span>
                  <span className="tronque">{item.fileName}</span>
                  <span className="etiquette">{item.format}</span>
                </div>
                <dl>
                  <dt>Prise de vue</dt>
                  <dd>{item.capturedAt === null ? '⚠ absente' : formatDateTime(item.capturedAt)}</dd>
                  <dt>Taille</dt>
                  <dd>
                    {formatSize(item.sizeBytes)}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                  </dd>
                  <dt>Orientation</dt>
                  <dd>{formatOrientation(item.orientation)}</dd>
                  <dt>Décodage</dt>
                  <dd>
                    {diagnostic.decodeMs === null ? (item.isRaw ? 'mis de côté (RAW)' : '—') : `${formatMs(diagnostic.decodeMs)} · ${diagnostic.decodeMethod}`}
                  </dd>
                  {diagnostic.error && (
                    <>
                      <dt>Erreur</dt>
                      <dd>{diagnostic.error}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </details>
        <details className="sous-repli">
          <summary>Rapport complet</summary>
          <textarea className="rapport" readOnly value={report} rows={10} />
        </details>
      </details>
    </>
  );
}
