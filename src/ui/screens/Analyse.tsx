interface Props {
  done: number;
  total: number;
  currentName: string;
  onCancel: () => void;
}

export function Analyse({ done, total, currentName, onCancel }: Props) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <main className="analyse">
      <p className="compteur">
        {done}
        <span> / {total}</span>
      </p>
      <div className="barre" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${percent}%` }} />
      </div>
      <p className="doux tronque">{currentName || 'Préparation…'}</p>
      <p className="note">Gardez l’app ouverte pendant l’analyse.</p>
      <button className="bouton discret" onClick={onCancel}>
        Arrêter
      </button>
    </main>
  );
}
