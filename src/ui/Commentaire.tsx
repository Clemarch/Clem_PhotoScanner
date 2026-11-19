import { useEffect, useRef, useState } from 'react';

/** Raisons fréquentes, à toucher pour les ajouter sans taper (utilisable d'une main). */
const QUICK = [
  'Meilleur sourire',
  'Plus belle expression',
  'Mieux cadrée',
  'Yeux fermés',
  'Ne regarde pas',
  'Parle, bouche ouverte',
  'Floue',
  'Main ou pied coupé',
  'Personne gênante derrière',
  'Reflet',
  'Trop sombre',
  'Doublon',
];

interface Props {
  initial: string;
  title: string;
  onSave: (text: string) => void;
  onClose: () => void;
}

/**
 * Fenêtre de commentaire en haut de l'écran : la case reste visible au-dessus du clavier, sans avoir à faire défiler.
 */
export function Commentaire({ initial, title, onSave, onClose }: Props) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => area.current?.focus(), []);
  const add = (reason: string) =>
    setText((t) => {
      const base = t.trim();
      return base ? `${base}${/[.,;!?]$/.test(base) ? '' : ','} ${reason.toLowerCase()}` : reason;
    });

  return (
    <div className="feuille-fond" onClick={onClose}>
      <div className="feuille-com" role="dialog" aria-label="Commentaire" onClick={(e) => e.stopPropagation()}>
        <div className="feuille-haut">
          <button className="lien" onClick={onClose}>
            Annuler
          </button>
          <strong>{title}</strong>
          <button
            className="lien fort"
            onClick={() => {
              onSave(text.trim());
              onClose();
            }}
          >
            Enregistrer
          </button>
        </div>
        <textarea
          ref={area}
          className="commentaire"
          rows={3}
          value={text}
          placeholder="Pourquoi ? Ex. : la main est coupée en bas"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="puces">
          {QUICK.map((reason) => (
            <button key={reason} className="puce" onClick={() => add(reason)}>
              {reason}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
