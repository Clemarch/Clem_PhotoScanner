import { describe, expect, it } from 'vitest';
import { contextIdeas, contextScores, contextStats, encodeEmbedding, faceFeatures, faceIdeas, faceStats, trainPairNet, type NetPair, labPairs, runLab, topIdeas, LAB_CANDIDATES, type ChoiceRecord, type PoseValidation } from '../../src/engine';

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

describe('vocabulaire de contexte du nouvel œil (jalon 8)', () => {
  it('chaque idée est lisible, et une photo « qui ressemble » à une idée la place en tête', async () => {
    const { VOCAB } = await import('../../src/engine/learning/vocab.generated');
    const { decodeEmbedding } = await import('../../src/engine');
    expect(contextIdeas().length).toBe(VOCAB.length);
    expect(contextIdeas().some((i) => i.id === 'meditation')).toBe(true);
    const j = contextIdeas().findIndex((i) => i.id === 'regard_ailleurs');
    const photo = { key: 'x|1', clip: encodeEmbedding(Array.from(decodeEmbedding(VOCAB[j]![3])!))! };
    // Autres « photos » : chacune ressemble à une autre idée du vocabulaire.
    const others = VOCAB.filter((_, i) => i !== j).map((v, i) => ({ key: `o${i}|1`, clip: encodeEmbedding(Array.from(decodeEmbedding(v[3])!))! }));
    const stats = contextStats([photo, ...others])!;
    expect(topIdeas(photo, stats, 3).map((t) => t.idea.id)).toContain('regard_ailleurs');
    const s = contextScores(photo)!;
    expect(s[j]).toBeGreaterThan(0.99);
    expect(contextScores({ key: 'sans|1', clip: undefined })).toBeNull();
  });

  it('candidats « contexte » et « visages » : sans empreinte, c’est la formule', () => {
    const { records, validations } = world(false);
    const pairs = labPairs(validations, records);
    const r = runLab(pairs, LAB_CANDIDATES.filter((c) => c.id === 'formule' || c.id === 'contexte' || c.id === 'visages'));
    for (const id of ['contexte', 'visages']) expect(r.candidates.find((c) => c.id === id)!.honest).toEqual({ right: 0, total: 45 });
  });
});

describe('nouvel œil sur les visages (jalon 8, point 63)', () => {
  it('le candidat « visages » apprend les yeux fermés quand la formule ne les voit pas', async () => {
    const { VOCAB } = await import('../../src/engine/learning/vocab.generated');
    const { decodeEmbedding } = await import('../../src/engine');
    const face = (id: string) => encodeEmbedding(Array.from(decodeEmbedding(VOCAB.find((v) => v[0] === id)![3])!))!;
    const open = face('v_yeux_ouverts');
    const closed = face('v_yeux_fermes');
    const records: ChoiceRecord[] = [];
    const validations: PoseValidation[] = [];
    for (const s of ['1', '2', '3'])
      for (let i = 0; i < 15; i++) {
        const a = `${s}-${i}-a`;
        const b = `${s}-${i}-b`;
        // La formule préfère la photo aux yeux fermés ; vous gardez celle aux yeux ouverts (même nombre de visages).
        records.push({ ...rec(a, null, 0.5), fclip: [open, open] }, { ...rec(b, null, 0.6), fclip: [open, closed] });
        validations.push(val(s, i, [a, b], [a]));
      }
    const r = runLab(labPairs(validations, records), LAB_CANDIDATES.filter((c) => c.id === 'formule' || c.id === 'visages'));
    expect(r.candidates.find((c) => c.id === 'formule')!.honest.right).toBe(0);
    expect(r.candidates.find((c) => c.id === 'visages')!.honest.right).toBe(45);
    expect(faceFeatures({ key: 'x|1', fclip: [open, closed] }, faceStats(records)!)!).toHaveLength(2 * faceIdeas().length);
  });

  it('une photo vue avant le passage « visages » est revue si elle a des visages, et ses choix sont complétés', async () => {
    const { needsEye, eyePatches, faceClipsOf } = await import('../../src/ui/choices');
    const box = { x: 0.4, y: 0.3, width: 0.2, height: 0.2 };
    const f = { box, areaRatio: 0.04, clip: unit(5) };
    const item = { id: 'i', fileName: 'a.jpg', capturedAt: 1, kind: 'photo', clip: unit(4), faces: [f], eyeV: undefined } as unknown as Parameters<typeof needsEye>[0];
    expect(needsEye(item)).toBe(true);
    expect(needsEye({ ...item, eyeV: 2 })).toBe(false);
    expect(needsEye({ ...item, faces: [] })).toBe(false);
    expect(faceClipsOf(item)).toHaveLength(1);
    const key = 'a.jpg|1';
    const old = { ...rec(key, unit(4), 0.5) };
    const patched = eyePatches([old], [item]);
    expect(patched).toHaveLength(1);
    expect(patched[0]!.fclip).toHaveLength(1);
    expect(patched[0]!.clip).toBe(old.clip);
    // Déjà complété : rien à refaire.
    expect(eyePatches([patched[0]!], [item])).toHaveLength(0);
  });
});

describe('réseau de neurones (jalon 8, point 64)', () => {
  it('apprend une règle en contexte qu’une addition ne sait pas faire : yeux fermés, mauvais sauf en méditation', () => {
    // x = [yeux fermés, méditation]. Vous gardez les yeux ouverts, sauf en méditation où vous gardez les yeux fermés.
    const pairs: NetPair[] = [];
    for (let i = 0; i < 60; i++) {
      const med = i % 2;
      const open = [0, med];
      const closed = [1, med];
      pairs.push(med ? { keep: closed, drop: open, base: 0 } : { keep: open, drop: closed, base: 0 });
    }
    const net = trainPairNet(pairs, { hidden: 4, epochs: 400, rate: 0.05, l2: 0.001, formulaScale: 8, seed: 1 });
    expect(net([0, 0])).toBeGreaterThan(net([1, 0]));
    expect(net([1, 1])).toBeGreaterThan(net([0, 1]));
    // Sans exemples : rien n'est ajouté à la formule.
    expect(trainPairNet([], { hidden: 4, epochs: 10, rate: 0.01, l2: 0.1, formulaScale: 8, seed: 1 })([1, 1])).toBe(0);
  });
});

describe('« Pourquoi ? » et « se valent » (point 65)', () => {
  it('une pose « qui se vaut » ne compte ni dans la justesse ni dans l’apprentissage, et voyage dans la sauvegarde', async () => {
    const { accuracy, encodeBackup, decodeBackup } = await import('../../src/engine');
    const records = ['a', 'b'].map((k) => rec(k, null, 0.5));
    const v = val('s', 1, ['a', 'b'], ['a']);
    expect(labPairs([v], records)).toHaveLength(1);
    expect(labPairs([{ ...v, tie: true }], records)).toHaveLength(0);
    expect(accuracy([{ ...v, tie: true }]).poses.total).toBe(0);
    const back = decodeBackup(JSON.parse(JSON.stringify(encodeBackup(records, 1, [{ ...v, tie: true, why: ['naturel', 'gens'], note: 'pouce levé', weak: true }])))).validations[0]!;
    expect(back.tie).toBe(true);
    expect(back.why).toEqual(['naturel', 'gens']);
    expect(back.note).toBe('pouce levé');
    expect(back.weak).toBe(true);
    // « Aucune n'est vraiment bonne » : le choix reste un jugement relatif, la pose sert à apprendre.
    expect(labPairs([{ ...v, weak: true }], records)).toHaveLength(1);
  });

  it('les 10 traits du visage : zéros sans visage, une valeur par trait (moyenne, pire) sinon', async () => {
    const { faceTraits, config } = await import('../../src/engine');
    const n = config.context.faceTraits.length;
    expect(faceTraits({ key: 'x|1' })).toEqual(new Array(2 * n + 1).fill(0));
    const t = faceTraits({ key: 'y|1', fclip: [encodeEmbedding(unit(3))!, encodeEmbedding(unit(4))!] });
    expect(t).toHaveLength(2 * n + 1);
    expect(t[2 * n]).toBe(1);
  });
});
