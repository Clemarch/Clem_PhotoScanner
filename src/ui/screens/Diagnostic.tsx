import { useMemo, useState } from 'react';
import type { Session } from '../session';
import { buildReport, copyText, summarize } from '../report';
import { formatDateTime, formatMs, formatOrientation, formatSize } from '../format';

export function Diagnostic({ session }: { session: Session }) {
  const summary = useMemo(() => summarize(session), [session]);
  const report = useMemo(() => buildReport(session), [session]);
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
