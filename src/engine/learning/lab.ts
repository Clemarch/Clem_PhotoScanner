// Labo d'apprentissage (jalon 7, utilisateur, 26/11) : plusieurs façons d'apprendre vos goûts, mises en concurrence
// honnêtement sur les poses validées dans le tri éclair. Pour chaque paire « gardée / supprimée » d'une même pose, un
// candidat a juste s'il met devant la photo gardée. Deux mesures, sans jamais tester une séance sur ce qu'elle a appris :
// - « chaque séance testée avec les autres » : justesse générale de chaque candidat ;
// - « courbe » : chaque séance testée avec ce qui a été appris AVANT elle seulement, dans l'ordre du temps (ce que l'app
//   aurait prédit ce jour-là) : la courbe montre si les prédictions s'améliorent au fil des séances.
// Rien ici ne décide : la formule reste aux commandes tant qu'un candidat ne la bat pas nettement (`config.lab`).
// Moteur pur.

import { config } from '../config';
import { FEATURE_NAMES, type ChoiceRecord } from '../types';
import { decodeEmbedding } from './embeddingCodec';
import { eyeVector, rankScore, trainRanker } from './ranker';
import { tooFast, type PoseValidation } from '../triage/calibration';
import { contextScores, contextStats, faceFeatures, faceNeutral, faceStats, rankingIdeas } from './context';

export interface LabPair {
  sessionId: string;
  keep: ChoiceRecord;
  drop: ChoiceRecord;
}

/** Un candidat apprend sur des paires et rend une note par photo (plus haut = à garder). */
export interface LabCandidate {
  id: string;
  label: string;
  /** Ce qu'il regarde, en une phrase (pour l'écran). */
  description: string;
  train: (pairs: readonly LabPair[]) => LabScorer;
}

/** Note d'une photo (plus haut = à garder). */
export type LabScorer = (r: ChoiceRecord) => number;

export interface Score {
  right: number;
  total: number;
}

export interface LabCandidateResult {
  id: string;
  label: string;
  description: string;
  /** Chaque séance testée avec un apprentissage fait sur les autres séances. */
  honest: Score;
  bySession: (Score & { sessionId: string })[];
  /** Chaque séance testée avec ce qui a été appris avant elle seulement (ordre du temps). */
  curve: (Score & { sessionId: string })[];
}

export interface LabResult {
  /** Séances qui ont des paires exploitables, dans l'ordre du temps. */
  sessions: string[];
  pairs: number;
  candidates: LabCandidateResult[];
  /** Candidat qui bat nettement la formule (`config.lab`), sinon null. */
  winner: string | null;
}

/** Paires « gardée / supprimée » des poses validées (mêmes règles que la justesse : validations trop rapides écartées). */
export function labPairs(validations: readonly PoseValidation[], records: readonly ChoiceRecord[], excluded: ReadonlySet<string> = new Set()): LabPair[] {
  const byKey = new Map(records.map((r) => [r.key, r]));
  // Une pose validée deux fois dans une séance : la dernière validation compte.
  const last = new Map<string, PoseValidation>();
  for (const v of validations) if (!excluded.has(v.sessionId)) last.set(v.id, v);
  const out: LabPair[] = [];
  for (const v of last.values()) {
    if (tooFast(v) || v.keys.length < 2) continue;
    for (const a of v.keys.filter((k) => v.kept.includes(k)))
      for (const b of v.keys.filter((k) => !v.kept.includes(k))) {
        const keep = byKey.get(a);
        const drop = byKey.get(b);
        if (keep && drop) out.push({ sessionId: v.sessionId, keep, drop });
      }
  }
  return out;
}

/** Au plus `max` paires, prises à intervalles réguliers : le calcul reste court sur l'iPhone. */
function sample<T>(list: readonly T[], max: number): T[] {
  if (list.length <= max) return [...list];
  const step = list.length / max;
  return Array.from({ length: max }, (_, i) => list[Math.floor(i * step)]!);
}

const featureVector = (r: ChoiceRecord): number[] => FEATURE_NAMES.map((n) => r.features[n] ?? 0.5);

/**
 * Logistique avec la formule comme point de départ : z = échelle × (note A − note B) + w · (xA − xB). Sans paires,
 * w = 0 et le candidat est exactement la formule ; il ne s'en écarte que si les paires le justifient.
 */
function trainOnFormula(
  pairs: readonly LabPair[],
  vec: (r: ChoiceRecord) => number[] | null,
  opts: { lambda: number; rate: number; iterations: number } = config.lab,
): LabScorer {
  const c = config.lab;
  const usable = pairs.flatMap((p) => {
    const a = vec(p.keep);
    const b = vec(p.drop);
    return a && b ? [{ base: p.keep.baseScore - p.drop.baseScore, d: a.map((v, i) => v - b[i]!) }] : [];
  });
  const dims = usable[0]?.d.length ?? 0;
  const w = new Array<number>(dims).fill(0);
  // Descente avec élan (convergence plus rapide quand les mesures sont nombreuses).
  const speed = new Array<number>(dims).fill(0);
  for (let it = 0; it < opts.iterations && usable.length > 0; it++) {
    const grad = new Array<number>(dims).fill(0);
    for (const u of usable) {
      let z = c.formulaScale * u.base;
      for (let i = 0; i < dims; i++) z += w[i]! * u.d[i]!;
      const g = -1 / (1 + Math.exp(z));
      for (let i = 0; i < dims; i++) grad[i]! += (g * u.d[i]!) / usable.length;
    }
    for (let i = 0; i < dims; i++) {
      speed[i] = 0.8 * speed[i]! + grad[i]! + opts.lambda * w[i]!;
      w[i]! -= opts.rate * speed[i]!;
    }
  }
  return (r: ChoiceRecord): number => {
    const x = vec(r);
    let s = c.formulaScale * r.baseScore;
    if (x) for (let i = 0; i < dims; i++) s += w[i]! * x[i]!;
    return s;
  };
}

/** Empreinte SigLIP 2 normalisée, ou null (photo pas encore regardée par le nouvel œil). */
function clipUnit(r: ChoiceRecord): Float32Array | null {
  const v = decodeEmbedding(r.clip);
  if (!v || v.length !== config.ranker.eyeDims) return null;
  const n = Math.hypot(...v) || 1;
  return Float32Array.from(v, (x) => x / n);
}

// La place dans la rafale n'entre dans aucun candidat (utilisateur, 27/11 : « c'est une corrélation, pas une
// causalité ») : l'app ne doit pas apprendre à garder la dernière photo d'une rafale parce qu'elle est la dernière.

/** Formule + critères + émotions + vocabulaire de contexte sur l'image entière (jalon 8, point 62). */
function trainContext(pairs: readonly LabPair[]): LabScorer {
  const train = sample(pairs, config.context.maxTrainPairs);
  const stats = contextStats(train.flatMap((p) => [p.keep, p.drop]));
  const ideas = rankingIdeas();
  const vec = (r: ChoiceRecord): number[] => {
    const s = stats ? contextScores(r) : null;
    const emo = r.emo && r.emo.length === 6 ? r.emo : [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    return [
      ...FEATURE_NAMES.map((n) => r.features[n] ?? 0.5),
      ...emo,
      ...ideas.map((j) => (s && stats ? (s[j]! - stats.mean[j]!) / stats.sd[j]! : 0)),
    ];
  };
  return trainOnFormula(train, vec, config.context);
}

/** Formule + ce que le nouvel œil lit sur chaque visage recadré (point 63) : moyenne et pire visage de chaque idée. */
function trainFaces(pairs: readonly LabPair[]): LabScorer {
  const train = sample(pairs, config.context.maxTrainPairs);
  const stats = faceStats(train.flatMap((p) => [p.keep, p.drop]));
  return trainOnFormula(train, (r) => (stats ? faceFeatures(r, stats) : null) ?? faceNeutral(), config.context);
}

export const LAB_CANDIDATES: readonly LabCandidate[] = [
  {
    id: 'formule',
    label: 'Formule actuelle',
    description: 'Les notes de l’app (expression, regard, cadrage…), sans rien apprendre.',
    train: () => (r) => r.baseScore,
  },
  {
    id: 'gouts',
    label: 'Formule + vos goûts',
    description: 'La formule, corrigée par ce que vos choix disent de ses 18 critères.',
    train: (pairs) => trainOnFormula(sample(pairs, config.lab.maxTrainPairs), (r) => featureVector(r)),
  },
  {
    id: 'oeil',
    label: 'Nouvel œil seul',
    description: 'L’image entière (SigLIP 2) et les émotions des visages, appris sur vos choix.',
    train: (pairs) => {
      const usable = sample(
        pairs.flatMap((p) => {
          const keep = eyeVector(p.keep);
          const drop = eyeVector(p.drop);
          return keep && drop ? [{ keep, drop }] : [];
        }),
        config.lab.maxTrainPairs,
      );
      const model = usable.length > 0 ? trainRanker(usable) : null;
      // Photo pas encore regardée par l'œil, ou rien appris : la formule.
      return (r) => {
        const x = model ? eyeVector(r) : null;
        return x ? rankScore(model!, x) : config.lab.formulaScale * r.baseScore;
      };
    },
  },
  {
    id: 'hybride',
    label: 'Formule + nouvel œil',
    description: 'La formule comme point de départ, corrigée par l’image entière et les émotions.',
    train: (pairs) => trainOnFormula(sample(pairs, config.lab.maxTrainPairs), (r) => eyeVector(r)),
  },
  {
    id: 'voisins',
    label: 'Formule + photos semblables',
    description: 'La formule, plus le vote des photos passées qui ressemblent le plus (gardées ou supprimées).',
    train: (pairs) => {
      const memory: { e: Float32Array; keep: number }[] = [];
      const seen = new Set<string>();
      for (const p of pairs)
        for (const [r, keep] of [
          [p.keep, 1],
          [p.drop, -1],
        ] as const) {
          if (seen.has(r.key)) continue;
          seen.add(r.key);
          const e = clipUnit(r);
          if (e) memory.push({ e, keep });
        }
      const c = config.lab;
      return (r) => {
        const e = clipUnit(r);
        let vote = 0;
        if (e && memory.length) {
          const near = memory
            .map((m) => {
              let s = 0;
              for (let i = 0; i < e.length; i++) s += e[i]! * m.e[i]!;
              return { s, keep: m.keep };
            })
            .sort((a, b) => b.s - a.s)
            .slice(0, c.neighbors);
          const total = near.reduce((t, n) => t + Math.max(0, n.s), 0);
          vote = total > 0 ? near.reduce((t, n) => t + Math.max(0, n.s) * n.keep, 0) / total : 0;
        }
        return r.baseScore + c.neighborWeight * vote;
      };
    },
  },
  {
    id: 'contexte',
    label: 'Formule + contexte',
    description: `La formule, corrigée par ce que le nouvel œil lit dans l’image (regard, yeux, émotions, cadrage, lumière : plus de 100 idées).`,
    train: trainContext,
  },
  {
    id: 'visages',
    label: 'Formule + visages',
    description: 'La formule, corrigée par ce que le nouvel œil lit sur chaque visage recadré (yeux, regard, expression, netteté) : la moyenne et le visage le moins réussi.',
    train: trainFaces,
  },
];

function scorePairs(scorer: LabScorer, test: readonly LabPair[]): Score {
  let right = 0;
  for (const p of test) if (scorer(p.keep) > scorer(p.drop)) right++;
  return { right, total: test.length };
}

/** Met tous les candidats à l'épreuve. `candidates` : pour les tests. */
export function runLab(pairs: readonly LabPair[], candidates: readonly LabCandidate[] = LAB_CANDIDATES): LabResult {
  const sessions = [...new Set(pairs.map((p) => p.sessionId))].sort();
  const bySession = new Map(sessions.map((s) => [s, pairs.filter((p) => p.sessionId === s)]));
  // Une même photo dans deux séances (journée analysée deux fois) : retirée de l'apprentissage de la séance testée.
  const trainFor = (test: readonly LabPair[], pool: readonly LabPair[]) => {
    const keys = new Set(test.flatMap((p) => [p.keep.key, p.drop.key]));
    return pool.filter((p) => !keys.has(p.keep.key) && !keys.has(p.drop.key));
  };
  const results = candidates.map((cand): LabCandidateResult => {
    const honestBy: LabCandidateResult['bySession'] = [];
    const curve: LabCandidateResult['curve'] = [];
    sessions.forEach((s, k) => {
      const test = bySession.get(s)!;
      const others = pairs.filter((p) => p.sessionId !== s);
      honestBy.push({ sessionId: s, ...scorePairs(cand.train(trainFor(test, others)), test) });
      const before = sessions.slice(0, k).flatMap((t) => bySession.get(t)!);
      curve.push({ sessionId: s, ...scorePairs(cand.train(trainFor(test, before)), test) });
    });
    const honest = honestBy.reduce((a, b) => ({ right: a.right + b.right, total: a.total + b.total }), { right: 0, total: 0 });
    return { id: cand.id, label: cand.label, description: cand.description, honest, bySession: honestBy, curve };
  });
  const formula = results.find((r) => r.id === 'formule');
  const rate = (s: Score) => (s.total ? s.right / s.total : 0);
  const best = results
    .filter((r) => r.id !== 'formule')
    .sort((a, b) => rate(b.honest) - rate(a.honest))[0];
  const winner =
    formula && best && best.honest.total >= config.lab.minPairs && rate(best.honest) - rate(formula.honest) >= config.lab.minGain ? best.id : null;
  return { sessions, pairs: pairs.length, candidates: results, winner };
}
