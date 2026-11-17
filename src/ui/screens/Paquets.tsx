import { useMemo, useState } from 'react';
import { config, groupIntoPacks, relativeSharpness, type MediaItem, type Pack } from '../../engine';
import type { Session } from '../session';
import { formatGap, formatShortTime, formatSize, formatTime, plural } from '../format';

interface Selected {
  item: MediaItem;
  number: number | null;
  label: string;
  detail: string;
}

export function Paquets({ session }: { session: Session }) {
  const [gap, setGap] = useState<number>(config.grouping.packGapSeconds);
  const [selected, setSelected] = useState<Selected | null>(null);

  const items = useMemo(() => session.results.map((r) => r.item), [session]);
  const day = useMemo(() => groupIntoPacks(items, gap), [items, gap]);

  const renderGrid = (list: MediaItem[], pack: Pack | null) => {
    const relative = relativeSharpness(list);
    return (
      <div className="grille">
        {list.map((item) => {
          const rel = relative.get(item.id);
          const number = day.dayIndex.get(item.id) ?? null;
          const url = session.thumbnails.get(item.id);
          const best = pack !== null && rel?.rank === 1 && list.length > 1;
          const detail = rel
            ? rel.rank === 1
              ? list.length > 1
                ? 'La plus nette de son paquet.'
                : 'Seule photo de son paquet.'
              : `Netteté : ${Math.round(rel.ratio * 100)} % de la meilleure du paquet (${rel.rank}ᵉ sur ${list.length}).`
            : 'Netteté non mesurée.';
          return (
            <button
              key={item.id}
              className={`vignette${best ? ' meilleure' : ''}`}
              onClick={() => setSelected({ item, number, label: formatTime(item.capturedAt), detail })}
            >
              {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="vide">{item.format}</span>}
              {number !== null && <span className="numero">{number}</span>}
              {best && <span className="badge">nette</span>}
              {rel && <span className="jauge" style={{ width: `${Math.round(rel.ratio * 100)}%` }} />}
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
          {renderGrid(pack.items, pack)}
        </section>
      ))}

      {day.undated.length > 0 && (
        <section className="carte">
          <div className="titre-paquet">
            <h3>Sans date</h3>
            <span>{plural(day.undated.length, 'photo')}</span>
          </div>
          <p className="alerte">La date de prise de vue est absente : impossible de ranger ces photos dans un paquet.</p>
          {renderGrid(day.undated, null)}
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
              {selected.number !== null ? `Photo n° ${selected.number}` : 'Photo'} · {selected.label}
            </h3>
            <p>{selected.detail}</p>
            <p className="doux">
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
