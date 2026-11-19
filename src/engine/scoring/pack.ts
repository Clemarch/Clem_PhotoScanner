// Note chaque photo par rapport aux autres de son paquet, et explique pourquoi.
// Principe : le contenu (expression, visage masqué, arrière-plan, objets, couleurs, cadrage) classe les photos ;
// la technique (netteté, yeux) ne sert qu'à repérer un défaut, jamais à préférer une photo « plus nette ».
// Ce qui est recherché dépend du type de photo (selfie, portrait, groupe, paysage, coucher de soleil).

import { config } from '../config';
import { analyzeContent, compareFaces, countSubjects, holdsSubjectObject, recurringPersons, subjectPersons } from '../analysis/content';
import { mainFaces } from '../analysis/faces';
import { tiltDefect, tiltReliable } from '../analysis/framing';
import { classifyPack, exposureBalance, seenFromPlane } from '../analysis/scene';
import { learnedAdjustment, meanFeatures } from '../learning/preferences';
import type { FaceMetrics, Features, LearnedWeights, MediaItem, PhotoScore, Reason, SceneType } from '../types';

/** Valeur haute de référence, sans se laisser tromper par une mesure isolée anormalement élevée. */
function reference(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted.length >= 3 ? sorted[1]! : sorted[0]!;
}

const centerX = (face: FaceMetrics): number => face.box.x + face.box.width / 2;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ratioTo = (value: number, best: number): number => (best > 0 ? clamp01(value / best) : 1);

/** Netteté rapportée à la référence du paquet, transformée en « absence de défaut » : 1 dès qu'elle est suffisante. */
function sharpEnough(ratio: number): number {
  const { sharpEnough: enough, sharpFloor: floor } = config.scoring;
  return clamp01((ratio - floor) / (enough - floor));
}

/** Nombre de visages qu'on s'attend à voir : la médiane (basse) du paquet. */
function expectedFaceCount(counts: number[]): number {
  if (counts.length === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

export interface PackScoring {
  /** Type majoritaire du paquet, et type de chaque photo (décidé par groupe de pose). */
  scene: SceneType;
  sceneOf: Map<string, SceneType>;
  scores: Map<string, PhotoScore>;
}

export function scorePack(
  items: readonly MediaItem[],
  learned: LearnedWeights = {},
  groups?: readonly (readonly MediaItem[])[],
): Map<string, PhotoScore> {
  return scorePackDetailed(items, learned, groups).scores;
}

/** Ce qui se juge à l'échelle d'un groupe de pose : le type de photo, les personnes attendues et leur place. */
interface GroupContext {
  items: readonly MediaItem[];
  expected: number;
  scene: SceneType;
  anyFaceRef: number;
  completeCount: number;
  slotRef: number[];
  slotX: number[];
  /** Ouverture des yeux de chaque personne sur les photos de ce groupe (triées) : soleil de face ou grand sourire,
   *  certains ont les yeux plissés sur toutes les photos. */
  slotEyes: number[][];
  changesOf: Map<string, { occlusion: number[]; front: number[]; brightness: number[] }>;
  knownSubjects: ReturnType<typeof subjectPersons>;
  /** Un objet qui fait partie du sujet (planche, vélo, chien) touche les personnes sur au moins une photo du groupe. */
  holdsSubject: boolean;
  sharpest: MediaItem | null;
  bestAesthetic: number;
}

/**
 * `groups` : les groupes de pose du paquet. Le type de photo et les visages attendus se décident par groupe
 * (un paquet peut mêler des photos de personnes et des paysages) ; les comparaisons de netteté, de couleurs et
 * d'arrière-plan restent faites sur tout le paquet.
 */
export function scorePackDetailed(
  items: readonly MediaItem[],
  learned: LearnedWeights = {},
  groups: readonly (readonly MediaItem[])[] = [items],
): PackScoring {
  const cfg = config.scoring;
  const r = cfg.reasons;
  const c = config.content;

  // Visages rangés de gauche à droite : d'une photo à l'autre, la même place désigne la même personne.
  const facesOf = new Map<string, FaceMetrics[]>(
    items.map((item) => [item.id, mainFaces(item.faces).sort((a, b) => centerX(a) - centerX(b))]),
  );
  const otherFacesOf = (item: MediaItem): FaceMetrics[] => {
    const main = new Set(facesOf.get(item.id));
    return (item.faces ?? []).filter((face) => !main.has(face) && face.areaRatio >= config.faces.minAreaRatio);
  };
  const nearestSlot = (ctx: GroupContext, face: FaceMetrics): number =>
    ctx.slotX.reduce((best, x, k) => (Math.abs(x - centerX(face)) < Math.abs(ctx.slotX[best]! - centerX(face)) ? k : best), 0);

  const contextOf = new Map<string, GroupContext>();
  const contexts: GroupContext[] = [];
  for (const group of groups) {
    const expected = expectedFaceCount(group.filter((item) => item.faces !== null).map((item) => facesOf.get(item.id)!.length));
    const completeItems = group.filter((item) => expected > 0 && facesOf.get(item.id)!.length === expected);
    // Masquage, objet devant, luminosité : chaque personne comparée à elle-même sur les photos où tout le monde est visible.
    const changes = compareFaces(completeItems.map((item) => facesOf.get(item.id)!));
    const ctx: GroupContext = {
      items: group,
      expected,
      scene: classifyPack(group, expected, (item) => facesOf.get(item.id)!),
      // Netteté de référence de chaque personne, et sa place habituelle (pour savoir qui est qui quand un visage manque).
      anyFaceRef: reference(group.flatMap((item) => facesOf.get(item.id)!).map((face) => face.sharpness)),
      completeCount: completeItems.length,
      slotRef: Array.from({ length: expected }, (_, slot) =>
        reference(completeItems.map((item) => facesOf.get(item.id)![slot]!.sharpness)),
      ),
      slotX: Array.from({ length: expected }, (_, slot) => {
        const xs = completeItems.map((item) => centerX(facesOf.get(item.id)![slot]!)).sort((x, y) => x - y);
        return xs.length ? xs[Math.floor(xs.length / 2)]! : (slot + 0.5) / Math.max(1, expected);
      }),
      changesOf: new Map(
        completeItems.map((item, i) => [
          item.id,
          { occlusion: changes.occlusion[i]!, front: changes.front[i]!, brightness: changes.brightness[i]! },
        ]),
      ),
      // Places occupées par les sujets dans ce groupe : personnes dont on voit le visage, et personnes qui reviennent
      // au même endroit sur la plupart des photos (vues de dos).
      knownSubjects: [
        ...group.flatMap((item) => subjectPersons(facesOf.get(item.id)!, item.objects)),
        ...recurringPersons(group.map((item) => item.objects)),
      ],
      // Décidé sur tout le groupe : le détecteur rate parfois la planche sur une photo, où elle passerait pour un
      // objet devant la personne.
      holdsSubject: group.some((item) => holdsSubjectObject(facesOf.get(item.id)!, item.objects)),
      sharpest: group.reduce<MediaItem | null>(
        (best, item) => ((item.sharpness ?? -1) > (best?.sharpness ?? -1) ? item : best),
        null,
      ),
      bestAesthetic: 0,
      slotEyes: [],
    };
    const eyesBySlot: number[][] = Array.from({ length: expected }, () => []);
    for (const item of group) {
      const faces = facesOf.get(item.id)!;
      if (expected === 0 || faces.length === 0 || (faces.length !== expected && completeItems.length === 0)) continue;
      faces.forEach((face, i) => eyesBySlot[faces.length === expected ? i : nearestSlot(ctx, face)]!.push(face.eyesOpen));
    }
    ctx.slotEyes = eyesBySlot.map((values) => [...values].sort((a, b) => a - b));
    contexts.push(ctx);
    for (const item of group) contextOf.set(item.id, ctx);
  }
  // Coucher de soleil ou paysage : c'est la scène qui compte, pas la pose. On en décide sur toutes les photos
  // sans personne du paquet (une version plus sombre du même coucher de soleil reste un coucher de soleil).
  const sceneless = contexts.filter((ctx) => ctx.expected === 0);
  if (sceneless.length > 0) {
    const landscapeScene = classifyPack(sceneless.flatMap((ctx) => [...ctx.items]), 0, () => []);
    for (const ctx of sceneless) ctx.scene = landscapeScene;
  }

  // Note typique d'un visage dans un groupe : sert pour une photo où la personne est là mais son visage invisible
  // (de dos, tête tournée). On ne sait pas s'il est réussi : on ne le suppose pas parfait.
  const typicalFace = new Map<GroupContext, number>();
  const typicalFaceScore = (ctx: GroupContext): number => {
    const cached = typicalFace.get(ctx);
    if (cached !== undefined) return cached;
    const w = ctx.expected >= 2 ? cfg.groupFaceWeights : cfg.faceWeights;
    const values = ctx.items
      .map((item) => facesOf.get(item.id)!)
      .filter((faces) => faces.length > 0)
      .map((faces) => Math.min(...faces.map((f) => w.eyes * f.eyesOpen + w.gaze * f.gaze + w.expression * f.expression + w.sharpness)))
      .sort((x, y) => x - y);
    const value = values.length ? values[Math.floor((values.length - 1) / 2)]! : 1;
    typicalFace.set(ctx, value);
    return value;
  };

  // Peau de visage (silhouette) : chaque personne comparée à elle-même sur les photos où tout le monde est visible.
  // Un objet ou une main devant le visage en fait baisser la part.
  const faceSkinOf = (item: MediaItem, face: FaceMetrics): number | null => {
    const index = item.faces?.indexOf(face) ?? -1;
    return index >= 0 ? (item.segmentation?.faceSkin[index] ?? null) : null;
  };
  const skinRef = new Map<GroupContext, (number | null)[]>();
  const faceSkinDrop = (item: MediaItem, ctx: GroupContext, slot: number, face: FaceMetrics): number | null => {
    if (!skinRef.has(ctx)) {
      const complete = ctx.items.filter((it) => ctx.expected > 0 && facesOf.get(it.id)!.length === ctx.expected);
      skinRef.set(
        ctx,
        Array.from({ length: ctx.expected }, (_, k) => {
          const values = complete
            .map((it) => faceSkinOf(it, facesOf.get(it.id)![k]!))
            .filter((v): v is number => v !== null)
            .sort((x, y) => x - y);
          return values.length >= config.content.occlusionMinPhotos ? values[Math.floor(values.length / 2)]! : null;
        }),
      );
    }
    const ref = skinRef.get(ctx)![slot];
    const value = faceSkinOf(item, face);
    if (ref == null || value === null || ref <= 0) return null;
    const sg = config.segmentation;
    return clamp01(((ref - value) / ref - sg.faceSkinDropFrom) / (sg.faceSkinDropFull - sg.faceSkinDropFrom));
  };

  // Une photo absente des groupes fournis forme son propre groupe (sécurité).
  const ctxOf = (item: MediaItem): GroupContext => contextOf.get(item.id) ?? contexts[0]!;

  // Netteté de référence de l'image : sur tout le paquet.
  const techRef = reference(items.map((item) => item.sharpness ?? 0));

  // Arrière-plan et objets : jugés par rapport à la photo la plus dégagée du paquet,
  // pour ne pas pénaliser ce qui est présent partout (la plage derrière, un sac porté sur toutes les photos).
  const contentOf = new Map(
    items.map((item) => [item.id, analyzeContent(facesOf.get(item.id)!, otherFacesOf(item), item.objects, ctxOf(item).knownSubjects)]),
  );
  const contents = [...contentOf.values()];
  const minBackground = Math.min(...contents.map((x) => x.background));
  const minDistractions = Math.min(...contents.map((x) => x.distractions.length));
  const exposed = items.filter((item) => item.exposure !== null);
  const minHighlights = Math.min(...exposed.map((item) => item.exposure!.highlights));
  const minShadows = Math.min(...exposed.map((item) => item.exposure!.shadows));

  // Esthétique : chaque mesure rapportée à la meilleure du paquet.
  const colored = items.filter((item) => item.color !== null);
  const bestWarm = Math.max(0, ...colored.map((item) => item.color!.warmFraction * item.color!.warmStrength));
  const bestContrast = Math.max(0, ...colored.map((item) => item.color!.contrast));
  const bestColorful = Math.max(0, ...colored.map((item) => item.color!.colorfulness));
  const bestBalance = Math.max(0, ...items.map((item) => exposureBalance(item) ?? 0));
  const aestheticWeightsOf = (scene: SceneType) => {
    const a = config.scene.aesthetic;
    if (scene === 'coucher') return a.coucher;
    if (scene === 'nourriture') return a.nourriture;
    if (scene === 'paysage' || scene === 'animal' || scene === 'document') return a.paysage;
    return a.personnes;
  };
  const aestheticParts = (item: MediaItem) => {
    if (!item.color) return null;
    const balance = exposureBalance(item) ?? 0;
    return {
      warm: ratioTo(item.color.warmFraction * item.color.warmStrength, bestWarm),
      contrast: ratioTo(item.color.contrast, bestContrast),
      colorful: ratioTo(item.color.colorfulness, bestColorful),
      balance: clamp01(1 - (bestBalance - balance)),
    };
  };
  const aestheticOf = (item: MediaItem): number => {
    const parts = aestheticParts(item);
    if (!parts) return 1;
    const w = aestheticWeightsOf(ctxOf(item).scene);
    const total = w.warm + w.contrast + w.colorful + w.balance;
    return (w.warm * parts.warm + w.contrast * parts.contrast + w.colorful * parts.colorful + w.balance * parts.balance) / total;
  };
  for (const ctx of contexts) ctx.bestAesthetic = Math.max(0, ...ctx.items.map(aestheticOf));

  const rawRatioOf = (item: MediaItem): number => (techRef > 0 ? Math.min(1, (item.sharpness ?? 0) / techRef) : 1);

  // Main, bras ou jambe coupés : peau du corps qui touche le bord, comparée à la photo du même groupe de pose qui en
  // a le moins (sur un selfie, le bras qui tient le téléphone touche le bord sur toutes les photos).
  const minEdgeSkin = new Map<GroupContext, number>();
  for (const ctx of contexts) {
    const values = ctx.items.filter((item) => item.segmentation !== null).map((item) => item.segmentation!.edgeBodySkin);
    minEdgeSkin.set(ctx, values.length ? Math.min(...values) : Infinity);
  }
  // Photos prises d'un avion : seule situation où des bords sombres et uniformes signalent un hublot qui gêne.
  const fromPlane = items.some(seenFromPlane);
  // Bords masqués : comparés à la photo la plus dégagée du paquet.
  const obstructed = items.filter((item) => item.obstruction !== null);
  const minObstruction = Math.min(...obstructed.map((item) => item.obstruction!), Infinity);
  // Inclinaison : comparée à la photo la plus droite du paquet (parmi les mesures fiables).
  const reliableTilts = items.filter((item) => tiltReliable(item.tiltDeg, item.tiltStrength)).map((item) => Math.abs(item.tiltDeg!));
  const straightest = reliableTilts.length ? Math.min(...reliableTilts) : 0;

  const scores: PhotoScore[] = items.map((item) => {
    const faces = facesOf.get(item.id)!;
    const ctx = ctxOf(item);
    const { expected, sharpest, bestAesthetic } = ctx;
    const reasons: Reason[] = [];
    const rawRatio = rawRatioOf(item);
    const aesthetic = aestheticOf(item);
    const parts = aestheticParts(item);
    let technique: number;
    let faceScore: number | null = null;
    let vetoed = false;
    let occlusion = 0;
    let front = 0;
    let faceBrightness = 1;
    let expressionF = 1;
    let smileF = 0;
    let poseF = 0;
    let gazeF = 1;
    let faceSharpF = 1;
    let gestureF = 0;

    if (expected > 0) {
      technique = sharpEnough(rawRatio);
      const present = countSubjects(faces, item.objects, ctx.knownSubjects);
      if (faces.length === 0) {
        faceScore = present >= expected ? typicalFaceScore(ctx) * (1 - cfg.unanalyzedFacePenalty) : 0;
        reasons.push(present >= expected ? { code: 'visage-non-analyse', tone: 'moins' } : { code: 'aucun-visage', tone: 'moins' });
      } else {
        const w = expected >= 2 ? cfg.groupFaceWeights : cfg.faceWeights;
        const ratios = faces.map((face, slot) => {
          const ref =
            faces.length === expected ? ctx.slotRef[slot]! : ctx.completeCount > 0 ? ctx.slotRef[nearestSlot(ctx, face)]! : ctx.anyFaceRef;
          return ref > 0 ? face.sharpness / ref : 1;
        });
        const change = ctx.changesOf.get(item.id);
        // Masquage : d'après la silhouette (peau du visage) quand elle est disponible, sinon d'après les couleurs.
        const colorOccl = change?.occlusion ?? faces.map(() => 0);
        const occl = faces.map((face, slot) => {
          const seg = faces.length === expected ? faceSkinDrop(item, ctx, slot, face) : null;
          return seg ?? colorOccl[slot] ?? 0;
        });
        occlusion = Math.max(0, ...occl);
        // Objet qui fait partie du sujet (planche de surf, vélo, chien) : ce qui passe devant n'est pas un défaut.
        front = ctx.holdsSubject ? 0 : Math.max(0, ...(change?.front ?? [0]));
        faceBrightness = Math.min(1, ...(change?.brightness ?? [1]));
        const quality = faces.map(
          (face, i) =>
            (w.eyes * face.eyesOpen + w.gaze * face.gaze + w.expression * face.expression + w.sharpness * sharpEnough(ratios[i]!)) *
            (1 - c.occlusionPenalty * occl[i]!),
        );
        const worst = Math.min(...quality);
        const mean = quality.reduce((a, b) => a + b, 0) / quality.length;
        faceScore = cfg.worstFaceWeight * worst + cfg.meanFaceWeight * mean;
        expressionF = Math.min(...faces.map((f) => f.expression));
        smileF = Math.min(...faces.map((f) => f.smile));
        poseF = Math.max(...faces.map((f) => f.pout));
        gazeF = Math.min(...faces.map((f) => f.gaze));
        faceSharpF = Math.min(...ratios.map(sharpEnough));
        // La netteté qui compte est celle des visages, pas celle de l'arrière-plan (utilisateur, 19/11).
        technique = faceSharpF;

        // Visages manquants : caché, ou simplement non analysé si la personne est bien là (tête tournée…).
        const missing = Math.max(0, expected - faces.length);
        if (missing > 0) {
          const unanalyzed = Math.min(missing, Math.max(0, present - faces.length));
          const hidden = missing - unanalyzed;
          faceScore *= 1 - (cfg.missingFacePenalty * hidden + cfg.unanalyzedFacePenalty * unanalyzed) / expected;
          if (hidden > 0) reasons.push({ code: 'visage-cache', tone: 'moins', count: faces.length, expected });
          if (unanalyzed > 0) reasons.push({ code: 'visage-non-analyse', tone: 'moins' });
        }
        // Yeux fermés jugés par personne (utilisateur, 19/11 : soleil de face, tout le monde plisse les yeux) :
        // quelqu'un qui a les yeux plissés sur la plupart des photos n'est pas compté comme ayant cligné.
        // Ouverture habituelle = médiane sur les AUTRES photos de la personne (la photo jugée n'y compte pas) : deux
        // clignements sur trois ou quatre photos ne font pas passer quelqu'un pour un plisseur d'yeux.
        const usualEyes = (face: FaceMetrics, i: number): number => {
          const values = ctx.slotEyes[faces.length === expected ? i : nearestSlot(ctx, face)] ?? [];
          // Il faut assez de photos de la personne pour connaître ses yeux « habituels ».
          if (values.length < cfg.squintMinPhotos) return 1;
          const self = values.indexOf(face.eyesOpen);
          const others = self >= 0 ? [...values.slice(0, self), ...values.slice(self + 1)] : values;
          return others[Math.floor(others.length / 2)] ?? 1;
        };
        // Seul sur la photo, tête baissée ou levée par rapport à l'objectif : regard ailleurs, permis ; les paupières y
        // paraissent fermées. Écart à l'objectif, pas inclinaison brute : un selfie pris d'en haut, tête levée vers le
        // téléphone, regarde l'objectif et un clignement y reste un clignement.
        const lookingAway = (face: FaceMetrics) => expected === 1 && Math.abs(face.offAxisVDeg) >= cfg.lookAwayPitchDeg;
        const shut = faces.map((face) => face.eyesOpen < cfg.eyesClosedBelow && !lookingAway(face));
        const squinter = faces.map((face, i) => usualEyes(face, i) < cfg.squintUsualBelow);
        if (shut.some((closed, i) => closed && !squinter[i])) {
          vetoed = true;
          reasons.push({ code: 'yeux-fermes', tone: 'veto' });
        } else if (shut.some(Boolean)) reasons.push({ code: 'yeux-plisses', tone: 'moins' });
        if (faces.some((face) => face.cut)) {
          vetoed = true;
          reasons.push({ code: 'visage-coupe', tone: 'veto' });
        }
        if (occlusion >= r.occlusionFrom) reasons.push({ code: 'visage-masque', tone: 'moins' });
        if (front >= r.frontFrom) reasons.push({ code: 'devant', tone: 'moins' });
        if (faceBrightness < c.darkFaceBelow) reasons.push({ code: 'visage-sombre', tone: 'moins' });
        const talking = faces.some((face) => face.talking >= r.talkingFrom);
        if (talking) reasons.push({ code: 'parle', tone: 'moins' });
        if (!talking && faces.some((face) => face.pout >= r.poseFrom)) reasons.push({ code: 'pose', tone: 'plus' });
        if (!talking && faces.every((face) => face.smile >= r.smileFrom)) reasons.push({ code: 'sourire', tone: 'plus' });
        if (ratios.some((ratio) => ratio < r.faceBlurBelow)) reasons.push({ code: 'visage-flou', tone: 'moins' });
        if (expected >= 2 && faces.some((face) => face.gaze < cfg.groupGazeBelow))
          reasons.push({ code: 'regard-ailleurs', tone: 'moins' });
      }
      // Geste voulu (V, pouce levé) : une pose, comme un sourire.
      const g = config.gestures;
      if ((item.hands ?? []).some((h) => h.score >= g.minScore && g.intended.includes(h.gesture))) {
        gestureF = 1;
        reasons.push({ code: 'geste', tone: 'plus' });
      }
    } else {
      // Paquet sans visage (paysage, coucher de soleil) : la netteté départage en douceur, l'esthétique compte d'abord.
      technique = Math.sqrt(rawRatio);
      if (ctx.items.length > 1 && sharpest && sharpest.id !== item.id && rawRatio < r.lessSharpBelow)
        reasons.push({ code: 'moins-nette', tone: 'moins', refId: sharpest.id });
    }

    // Couleurs et exposition : raisons comparées à la meilleure du paquet.
    if (ctx.items.length > 1 && parts) {
      if (bestAesthetic > 0 && aesthetic >= bestAesthetic - 1e-9 && expected === 0) reasons.push({ code: 'couleurs-vives', tone: 'plus' });
      else if (aesthetic < config.scene.dullBelow * bestAesthetic) reasons.push({ code: 'couleurs-ternes', tone: 'moins' });
    }

    const base =
      faceScore === null
        ? config.scoring.landscapeWeights.technique * technique + config.scoring.landscapeWeights.aesthetic * aesthetic
        : (() => {
            const pw = cfg.photoWeights;
            return (pw.faces * faceScore + pw.technique * technique + pw.aesthetic * aesthetic) / (pw.faces + pw.technique + pw.aesthetic);
          })();

    // Pénalités de contenu et de cadrage.
    const content = contentOf.get(item.id)!;
    const extraBackground = content.background - minBackground;
    const landscape = expected === 0;
    const backgroundPenalty = Math.min(
      c.backgroundPenaltyMax,
      c.backgroundPenalty * extraBackground * (landscape ? c.backgroundLandscapeFactor : 1),
    );
    if (extraBackground >= (landscape ? c.backgroundLandscapeFrom : r.backgroundFrom))
      reasons.push({ code: 'arriere-plan', tone: 'moins' });

    const extraObjects = content.distractions.length - minDistractions;
    const objectPenalty = Math.min(c.objectPenaltyMax, c.objectPenalty * extraObjects);
    if (extraObjects > 0) reasons.push({ code: 'objet', tone: 'moins', labels: [...new Set(content.distractions)] });

    const tilt = tiltDefect(item.tiltDeg, item.tiltStrength, straightest);
    if (tilt > 0) reasons.push({ code: 'horizon', tone: 'moins', degrees: Math.abs(item.tiltDeg ?? 0) });

    // Membres coupés (silhouette) et bords masqués (hublot).
    const sg = config.segmentation;
    const edgeRef = minEdgeSkin.get(ctx)!;
    const extraEdgeSkin =
      item.segmentation !== null && Number.isFinite(edgeRef) ? Math.max(0, item.segmentation.edgeBodySkin - edgeRef) : 0;
    const limbDefect = clamp01((extraEdgeSkin - sg.edgeSkinFrom) / (sg.edgeSkinFull - sg.edgeSkinFrom));
    if (limbDefect > 0) reasons.push({ code: 'membre-coupe', tone: 'moins' });
    const o = config.obstruction;
    const extraObstruction =
      fromPlane && expected === 0 && item.obstruction !== null && Number.isFinite(minObstruction)
        ? Math.max(0, item.obstruction - minObstruction)
        : 0;
    const obstructionDefect = clamp01((extraObstruction - o.from) / (o.full - o.from));
    if (obstructionDefect > 0) reasons.push({ code: 'bords-masques', tone: 'moins' });

    // Photo ratée en elle-même : défaut rédhibitoire, ou très floue sans personne à juger.
    const veryBlurry = expected === 0 && item.sharpness !== null && item.sharpness < cfg.absoluteBlurBelow;
    if (veryBlurry) reasons.push({ code: 'tres-floue', tone: 'veto' });

    // Exposition : pixels brûlés ou bouchés en plus de la photo la mieux exposée du paquet.
    const e = config.exposure;
    const ramp = (value: number) => clamp01((value - e.clippedFrom) / (e.clippedFull - e.clippedFrom));
    const over = item.exposure ? ramp(item.exposure.highlights - minHighlights) : 0;
    const under = item.exposure ? ramp(item.exposure.shadows - minShadows) : 0;
    if (over > 0) reasons.push({ code: 'surexposee', tone: 'moins' });
    if (under > 0) reasons.push({ code: 'sous-exposee', tone: 'moins' });

    // Photo probablement prise par erreur (pied, sol en marchant) : ni visage ni personne, floue et très penchée.
    const ac = cfg.accident;
    const accidental =
      faces.length === 0 &&
      !(item.objects ?? []).some((o) => o.label === 'person' && o.score >= 0.5) &&
      item.sharpness !== null &&
      item.sharpness < ac.maxSharpness &&
      item.tiltDeg !== null &&
      Math.abs(item.tiltDeg) >= ac.minTiltDeg &&
      (item.tiltStrength ?? 0) >= ac.minTiltStrength;
    if (accidental) reasons.push({ code: 'erreur-probable', tone: 'moins' });

    const dark = clamp01((c.darkFaceBelow - faceBrightness) / (c.darkFaceBelow - c.darkFaceFull));
    const baseScore =
      (accidental ? 1 - ac.penalty : 1) *
      base *
      (1 - backgroundPenalty) *
      (1 - objectPenalty) *
      (1 - config.framing.tiltPenalty * tilt) *
      (1 - c.frontPenalty * front) *
      (1 - c.darkFacePenalty * dark) *
      (1 - e.penalty * Math.max(over, under)) *
      (1 - sg.edgePenalty * limbDefect) *
      (1 - o.penalty * obstructionDefect) *
      (1 + config.gestures.bonus * gestureF);

    const features: Features = {
      expression: expressionF,
      sourire: smileF,
      pose: poseF,
      regard: gazeF,
      netteteVisage: faceSharpF,
      masquage: occlusion,
      devant: front,
      arrierePlan: clamp01(extraBackground),
      objets: clamp01(extraObjects / 2),
      penchee: tilt,
      membres: limbDefect,
      bords: obstructionDefect,
      couleurs: parts?.colorful ?? 1,
      chaud: parts?.warm ?? 1,
      contraste: parts?.contrast ?? 1,
      equilibre: parts?.balance ?? 1,
      nettete: rawRatio,
      geste: gestureF,
    };

    return {
      id: item.id,
      ...(accidental ? { accidental: true } : {}),
      score: baseScore,
      rank: 0,
      vetoed,
      reasons,
      faceCount: faces.length,
      expectedFaces: expected,
      faceScore,
      technique,
      background: content.background,
      distraction: content.distractions.length,
      occlusion,
      front,
      faceBrightness,
      baseScore,
      learned: 0,
      features,
      failed: vetoed || veryBlurry,
      extraEdgeSkin,
      extraObstruction,
    };
  });

  // Goûts appris : ajustement centré sur la moyenne du paquet (départage, sans relever le paquet entier).
  if (Object.keys(learned).length > 0) {
    const reference = meanFeatures(scores.map((score) => score.features));
    for (const score of scores) {
      score.learned = learnedAdjustment(score.features, learned, reference);
      score.score = score.baseScore + score.learned;
    }
  }

  // Si toutes les photos du paquet sont ratées, elles peuvent toutes être supprimées (choix de l'utilisateur, 17/11) :
  // le veto n'est plus levé.

  // Classement ; à note égale, la plus nette passe devant.
  const rawRatio = new Map(items.map((item) => [item.id, rawRatioOf(item)]));
  [...scores]
    .sort(
      (a, b) =>
        Number(a.vetoed) - Number(b.vetoed) ||
        b.score - a.score ||
        rawRatio.get(b.id)! - rawRatio.get(a.id)!,
    )
    .forEach((score, i) => {
      score.rank = i + 1;
    });

  // Type du paquet : celui du plus grand nombre de photos.
  const counts = new Map<SceneType, number>();
  for (const item of items) counts.set(ctxOf(item).scene, (counts.get(ctxOf(item).scene) ?? 0) + 1);
  const scene = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'paysage';
  return {
    scene,
    sceneOf: new Map(items.map((item) => [item.id, ctxOf(item).scene])),
    scores: new Map(scores.map((score) => [score.id, score])),
  };
}
