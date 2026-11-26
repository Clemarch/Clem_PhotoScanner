import { describe, expect, it } from 'vitest';
import { encodeEmbedding, labPairs, runLab, LAB_CANDIDATES, type ChoiceRecord, type PoseValidation } from '../../src/engine';

// Labo d'apprentissage (jalon 7) : candidats mis en concurrence honnêtement sur les poses validées.
const unit = (seed: number) => {
  const v = Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.37 + seed));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const styleA = unit(1);
const styleB = unit(2);
const rec = (key: string, clip: number[] | null, base: number): ChoiceRecord => ({
  key,
  packKey: 'p',
  choice: 'garder',
  features: {} as ChoiceRecord['features'],
  baseScore: base,
  at: 1,
  ...(clip ? { clip: encodeEmbedding(clip.map((x, i) => x + 0.02 * Math.cos(i + key.length)))!, emo: [0.5, 0.5, 0.5, 0.5, 0.2, 0.1] } : {}),
});
const val = (sessionId: string, i: number, keys: string[], kept: string[], ms = 3000): PoseValidation => ({
  id: `${sessionId}|${i}`,
  at: 1,
  sessionId,
  packKey: 'p',
  margin: 0.1,
  keys,
  proposed: [keys[keys.length - 1]!],
  kept,
  ms,
});

/** Trois séances où la formule se trompe toujours ; l'image (style A) dit la vérité. */
function world(withClip = true, perSession = 15) {
  const records: ChoiceRecord[] = [];
  const validations: PoseValidation[] = [];
  for (const s of ['1', '2', '3'])
    for (let i = 0; i < perSession; i++) {
      const a = `${s}-${i}-a`;
      const b = `${s}-${i}-b`;
      records.push(rec(a, withClip ? styleA : null, 0.5), rec(b, withClip ? styleB : null, 0.6));
      validations.push(val(s, i, [a, b], [a]));
    }
  return { records, validations };
}

describe('labo d’apprentissage (jalon 7)', () => {
  it('paires : dernière validation par pose, validations trop rapides et séances hors statistiques écartées', () => {
    const records = ['a', 'b', 'c'].map((k) => rec(k, null, 0.5));
    const v1 = val('s', 1, ['a', 'b', 'c'], ['a']);
    const v1bis = { ...v1, kept: ['a', 'b'] };
    const fast = { ...val('s', 2, ['a', 'b'], ['b'], 200), proposed: ['b'] };
    expect(labPairs([v1, v1bis, fast], records)).toHaveLength(2); // a>c, b>c
    expect(labPairs([v1], records, new Set(['s']))).toHaveLength(0);
  });

  it('la formule seule : mesure brute ; un candidat par l’image la bat quand elle se trompe', () => {
    const { records, validations } = world();
    const r = runLab(labPairs(validations, records));
    expect(r.sessions).toEqual(['1', '2', '3']);
    expect(r.pairs).toBe(45);
    const formule = r.candidates.find((c) => c.id === 'formule')!;
    const oeil = r.candidates.find((c) => c.id === 'oeil')!;
    expect(formule.honest).toEqual({ right: 0, total: 45 });
    expect(oeil.honest.right).toBe(45);
    // Courbe : la première séance n'a rien appris avant elle (= la formule), les suivantes progressent.
    expect(oeil.curve[0]).toMatchObject({ sessionId: '1', right: 0, total: 15 });
    expect(oeil.curve[2]!.right).toBe(15);
    // Pas assez de paires (45 < 300) : personne ne prend la place de la formule.
    expect(r.winner).toBeNull();
  });

  it('sans empreinte du nouvel œil, les candidats par l’image restent la formule', () => {
    const { records, validations } = world(false);
    const r = runLab(labPairs(validations, records));
    for (const id of ['oeil', 'voisins', 'hybride']) expect(r.candidates.find((c) => c.id === id)!.honest.right).toBe(0);
  });

  it('un vainqueur seulement s’il bat nettement la formule sur assez de paires', () => {
    const { records, validations } = world(true, 105);
    const r = runLab(labPairs(validations, records), LAB_CANDIDATES.filter((c) => c.id === 'formule' || c.id === 'oeil'));
    expect(r.pairs).toBe(315);
    expect(r.winner).toBe('oeil');
  }, 30000);
});
