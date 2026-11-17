import { useMemo, useState } from 'react';
import { config, groupIntoPacks, scorePack, type MediaItem, type PhotoScore } from '../../engine';
import type { Session } from '../session';
import { formatGap, formatShortTime, formatSize, formatTime, plural } from '../format';
import { reasonText } from '../reasons';

interface Selected {
  item: MediaItem;
  number: number | null;
  score: PhotoScore | null;
  packSize: number;
}

export function Paquets({ session }: { session: Session }) {
  const [gap, setGap] = useState<number>(config.grouping.packGapSeconds);
  const [selected, setSelected] = useState<Selected | null>(null);

  const items = useMemo(() => session.results.map((r) => r.item), [session]);
  const day = useMemo(() => groupIntoPacks(items, gap), [items, gap]);
  const numberOf = (id: string) => day.dayIndex.get(id) ?? null;

  const renderGrid = (list: MediaItem[], ranked: boolean) => {
    const scores = ranked ? scorePack(list) : null;
    return (
      <div className="grille">
        {list.map((item) => {
          const score = scores?.get(item.id) ?? null;
          const number = numberOf(item.id);
          const url = session.thumbnails.get(item.id);
          const best = score?.rank === 1 && list.length > 1;
          const flag = score?.reasons.find((r) => r.tone === 'veto') ?? score?.reasons.find((r) => r.tone === 'moins');
          return (
            <button
              key={item.id}
              className={`vignette${best ? ' meilleure' : ''}${score?.vetoed ? ' ecartee' : ''}`}
              onClick={() => setSelected({ item, number, score, packSize: list.length })}
            >
              {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
              {number !== null && <span className="numero">{number}</span>}
              {best && <span className="badge">meilleure</span>}
              {!best && flag && <span className={`drapeau ${flag.tone}`} />}
              {score && <span className="jauge" style={{ width: `${Math.round(score.score * 100)}%` }} />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <main className="page">
      <header className="entete">
        <h2>Paquets</h2>
        <p className="doux">
          {plural(day.packs.length, 'paquet')} · {plural(items.length - day.setAside.length, 'photo')}
        </p>
      </header>

      {session.faceError && (
        <p className="alerte">
          La recherche de visages n’a pas pu démarrer : les photos sont classées par netteté seulement. Copiez le
          rapport de l’onglet Diagnostic pour qu’on comprenne pourquoi.
        </p>
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
          onChange={(event) => setGap(Number(event.target.value))}
        />
      </section>

      {day.packs.map((pack, i) => (
        <section className="carte" key={pack.id}>
          <div className="titre-paquet">
            <h3>Paquet {i + 1}</h3>
            <span>
              {formatShortTime(pack.startAt)}
              {formatShortTime(pack.endAt) !== formatShortTime(pack.startAt) && ` → ${formatShortTime(pack.endAt)}`} ·{' '}
              {plural(pack.items.length, 'photo')}
            </span>
          </div>
          {renderGrid(pack.items, true)}
        </section>
      ))}

      {day.undated.length > 0 && (
        <section className="carte">
          <div className="titre-paquet">
            <h3>Sans date</h3>
            <span>{plural(day.undated.length, 'photo')}</span>
          </div>
          <p className="alerte">La date de prise de vue est absente : impossible de ranger ces photos dans un paquet.</p>
          {renderGrid(day.undated, false)}
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

      {selected && (
        <div className="voile" onClick={() => setSelected(null)}>
          <div className="feuille" onClick={(event) => event.stopPropagation()}>
            {session.thumbnails.get(selected.item.id) && (
              <img src={session.thumbnails.get(selected.item.id)} alt="" />
            )}
            <h3>
              {selected.number !== null ? `Photo n° ${selected.number}` : 'Photo'} · {formatTime(selected.item.capturedAt)}
            </h3>
            {selected.score && (
              <>
                <p className="classement">
                  {selected.packSize > 1
                    ? `${selected.score.rank === 1 ? 'Meilleure' : `${selected.score.rank}ᵉ`} sur ${selected.packSize} dans son paquet`
                    : 'Seule photo de son paquet'}
                  {selected.score.vetoed && ' · écartée'}
                  <span> · note {Math.round(selected.score.score * 100)} / 100</span>
                </p>
                <ul className="raisons">
                  {selected.score.reasons.map((reason) => (
                    <li key={reason.code} className={reason.tone}>
                      {reasonText(reason, numberOf)}
                    </li>
                  ))}
                  {selected.score.reasons.length === 0 && <li className="neutre">Rien de particulier à signaler</li>}
                </ul>
              </>
            )}
            <p className="note">
              {selected.item.fileName} · {selected.item.format} · {formatSize(selected.item.sizeBytes)}
            </p>
            <button className="bouton" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
