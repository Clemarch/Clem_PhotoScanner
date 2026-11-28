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
      {/* 28/11 : en mode économie d'énergie, iOS verrouille l'écran au bout de 30 s et refuse de le garder allumé. */}
      <p className="note">
        L’écran se verrouille tout seul ? En <strong>mode économie d’énergie</strong>, l’iPhone le verrouille au bout de 30 s :
        coupez-le le temps de l’analyse (Centre de contrôle, icône de la pile). S’il se verrouille quand même, déverrouillez :
        l’analyse reprend d’elle-même.
      </p>
      <button className="bouton discret" onClick={onCancel}>
        Arrêter
      </button>
    </main>
  );
}
