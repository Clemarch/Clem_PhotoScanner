import { useMemo, useState } from 'react';
import { FEATURE_NAMES, evaluateDay, preferencePairs, type ChoiceRecord, type DayAnalysis, type LearnedWeights } from '../../engine';
import type { Session } from '../session';
import { featureLabel } from '../reasons';
import { agreementLine, buildReport, copyText, shareText, summarize } from '../report';
import { RapportsEnregistres } from '../RapportsEnregistres';
import { SauvegardeGouts } from '../SauvegardeGouts';
import type { SavedReport } from '../../platform/storage/reports';
import { formatDateTime, formatMs, formatOrientation, formatSize } from '../format';

interface Props {
  session: Session;
  day: DayAnalysis;
  records: ChoiceRecord[];
  learned: LearnedWeights;
  reports: SavedReport[];
  onRestore: (records: ChoiceRecord[]) => Promise<{ added: number; updated: number }>;
  onForget: () => void;
}

export function Diagnostic({ session, day, records, learned, reports, onRestore, onForget }: Props) {
  const summary = useMemo(() => summarize(session), [session]);
  const report = useMemo(() => buildReport(session, day, records, learned), [session, day, records, learned]);
  const pairs = useMemo(() => preferencePairs(records).length, [records]);
  const agreement = useMemo(() => evaluateDay(day, records), [day, records]);
  const learnedList = FEATURE_NAMES.filter((name) => learned[name] !== undefined).sort(
    (a, b) => Math.abs(learned[b]!) - Math.abs(learned[a]!),
  );
  const [copied, setCopied] = useState<'non' | 'oui' | 'echec'>('non');
  const dateOk = summary.withoutDate === 0 && summary.withDate > 0;

  return (
    <main className="page">
      <header className="entete">
        <h2>Diagnostic</h2>
        <p className="doux">Ce que l’iPhone nous donne réellement.</p>
      </header>

      <section className={`carte verdict ${dateOk ? 'ok' : 'ko'}`}>
        <h3>{dateOk ? 'Date de prise de vue : lue' : 'Date de prise de vue : absente sur certaines photos'}</h3>
        <p>
          {summary.withDate} avec date · {summary.withoutDate} sans date · {summary.errors} erreur
          {summary.errors > 1 ? 's' : ''} de décodage
        </p>
      </section>

      <section className="carte apprentissage">
        <h3>Vos goûts</h3>
        <p className="doux">
          {records.length === 0
            ? 'Aucun choix enregistré. Dans la visionneuse, touchez « Garder » ou « Supprimer » pour apprendre à l’app ce que vous préférez.'
            : `${records.length} choix enregistrés sur cet iPhone, ${pairs} comparaison${pairs > 1 ? 's' : ''} utilisable${pairs > 1 ? 's' : ''} (une photo gardée contre une supprimée, dans le même paquet).`}
        </p>
        <p className="note">{agreementLine(agreement)}</p>
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
        {records.length > 0 && (
          <button
            className="bouton discret"
            onClick={() => {
              if (window.confirm('Oublier tous vos choix ? L’app reviendra à ses réglages de départ.')) onForget();
            }}
          >
            Oublier mes choix
          </button>
        )}
        <p className="note">Vos choix restent sur cet iPhone. Seules des mesures sont enregistrées, jamais les photos.</p>
      </section>

      <section className="carte chiffres">
        <div>
          <strong>{summary.total}</strong>
          <span>fichiers</span>
        </div>
        <div>
          <strong>{formatMs(session.totalMs)}</strong>
          <span>au total</span>
        </div>
        <div>
          <strong>{formatMs(summary.avgDecodeMs)}</strong>
          <span>décodage moyen</span>
        </div>
        <div>
          <strong>{session.heapAfterMB === null ? 'n/d' : `${session.heapAfterMB.toFixed(0)} Mo`}</strong>
          <span>mémoire</span>
        </div>
      </section>
      {session.heapAfterMB === null && (
        <p className="note marge">
          Safari ne permet pas de mesurer la mémoire. Le vrai test : l’analyse va-t-elle au bout sans que l’app se
          ferme ?
        </p>
      )}

      <button
        className="bouton principal"
        onClick={async () => {
          setCopied((await copyText(report)) ? 'oui' : 'echec');
        }}
      >
        {copied === 'oui' ? 'Rapport copié ✓' : 'Copier le rapport'}
      </button>
      <button
        className="bouton"
        onClick={async () => {
          const result = await shareText(report, 'Rapport Photo Triage');
          if (result === 'impossible') setCopied((await copyText(report)) ? 'oui' : 'echec');
        }}
      >
        Partager le rapport (vers l’app Claude…)
      </button>
      <RapportsEnregistres reports={reports} />
      <SauvegardeGouts records={records} onRestore={onRestore} />
      {copied === 'echec' && (
        <p className="alerte">Copie impossible : sélectionnez le texte ci-dessous à la main.</p>
      )}
      <p className="note marge">
        Le rapport ne contient que du texte (noms, dates, mesures), aucune image. Collez-le dans la conversation avec
        Claude.
      </p>

      <section className="carte">
        <div className="titre-paquet">
          <h3>Détail par photo</h3>
        </div>
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
                  {diagnostic.decodeMs === null
                    ? item.isRaw
                      ? 'mis de côté (RAW)'
                      : '—'
                    : `${formatMs(diagnostic.decodeMs)} · ${diagnostic.decodeMethod}`}
                </dd>
                <dt>Mémoire estimée</dt>
                <dd>{diagnostic.estimatedDecodedMB === null ? '—' : `${diagnostic.estimatedDecodedMB.toFixed(0)} Mo décodée`}</dd>
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
      </section>

      <section className="carte">
        <div className="titre-paquet">
          <h3>Rapport complet</h3>
        </div>
        <textarea className="rapport" readOnly value={report} rows={10} />
      </section>
    </main>
  );
}
