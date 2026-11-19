import type { Session } from './session';
import { asideKind, evaluateDay, embeddingSimilarity, mainFaces, photoKey, signatureDistance, type ChoiceRecord, type DayAnalysis, type Decision, type LearnedWeights, type PhotoScore, type SceneType, type Agreement } from '../engine';
import { formatDateTime, formatMs, formatOrientation, formatSize } from './format';

const color = (c: readonly number[] | null): string => (c ? c.map((v) => Math.round(v)).join(',') : '?');

const pct = (v: number | undefined): string => (v === undefined ? '?' : `${(v * 100).toFixed(1)}%`);

const avg = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export interface Summary {
  total: number;
  withDate: number;
  /** Photos (hors RAW et vidéos) sans date de prise de vue. */
  withoutDate: number;
  raw: number;
  errors: number;
  avgDecodeMs: number | null;
  maxDecodeMs: number | null;
  formats: Record<string, number>;
  methods: Record<string, number>;
  threads: Record<string, number>;
  avgFaceMs: number | null;
  photosWithFaces: number;
}

export function summarize(session: Session): Summary {
  const formats: Record<string, number> = {};
  const methods: Record<string, number> = {};
  const threads: Record<string, number> = {};
  const decodeTimes: number[] = [];
  const faceTimes: number[] = [];
  let photosWithFaces = 0;
  let withDate = 0;
  let withoutDate = 0;
  let raw = 0;
  let errors = 0;
  for (const { item, diagnostic } of session.results) {
    formats[item.format] = (formats[item.format] ?? 0) + 1;
    const aside = item.isRaw || item.kind !== 'photo';
    if (item.capturedAt !== null) withDate++;
    else if (!aside) withoutDate++;
    if (item.isRaw) raw++;
    if (diagnostic.error) errors++;
    if (diagnostic.decodeMs !== null) decodeTimes.push(diagnostic.decodeMs);
    if (diagnostic.faceMs !== null) faceTimes.push(diagnostic.faceMs);
    if (mainFaces(item.faces).length > 0) photosWithFaces++;
    if (diagnostic.decodeMethod) {
      methods[diagnostic.decodeMethod] = (methods[diagnostic.decodeMethod] ?? 0) + 1;
      threads[diagnostic.thread] = (threads[diagnostic.thread] ?? 0) + 1;
    }
  }
  return {
    total: session.results.length,
    withDate,
    withoutDate,
    raw,
    errors,
    avgDecodeMs: avg(decodeTimes),
    maxDecodeMs: decodeTimes.length ? Math.max(...decodeTimes) : null,
    formats,
    methods,
    threads,
    avgFaceMs: avg(faceTimes),
    photosWithFaces,
  };
}

const counts = (record: Record<string, number>): string =>
  Object.entries(record)
    .map(([key, n]) => `${key} ${n}`)
    .join(', ') || '—';

/** Rapport en texte, à copier puis coller dans la conversation avec Claude. Ne contient aucune image. */
export function buildReport(session: Session, day: DayAnalysis, records: readonly ChoiceRecord[], learned: LearnedWeights): string {
  const s = summarize(session);
  const d = session.device;
  const lines = [
    '=== Photo Triage — rapport de diagnostic ===',
    `Appareil : ${d.userAgent}`,
    `Écran : ${d.screen} · cœurs : ${d.cores ?? '?'} · installée : ${d.installed ? 'oui' : 'non'} · hors ligne prêt : ${d.offlineReady ? 'oui' : 'non'}`,
    `Fonctions : ${Object.entries(d.support).map(([k, v]) => `${k} ${v ? 'oui' : 'NON'}`).join(', ')}`,
    `Stockage : ${d.storageUsedMB?.toFixed(1) ?? '?'} / ${d.storageQuotaMB?.toFixed(0) ?? '?'} Mo · durable : ${d.persisted === null ? '?' : d.persisted ? 'oui' : 'NON'}`,
    '',
    `Fichiers : ${s.total} · avec date : ${s.withDate} · SANS date : ${s.withoutDate} · RAW mis de côté : ${s.raw} · erreurs : ${s.errors}`,
    `Mis de côté : ${counts(Object.fromEntries([...day.setAside.reduce((m, it) => m.set(asideKind(it) ?? '?', (m.get(asideKind(it) ?? '?') ?? 0) + 1), new Map<string, number>())]))}`,
    `Types : ${counts(s.formats)}`,
    `Décodage : ${counts(s.methods)} · fil : ${counts(s.threads)}`,
    `Temps : total ${formatMs(session.totalMs)} · décodage moyen ${formatMs(s.avgDecodeMs)} · max ${formatMs(s.maxDecodeMs)}`,
    `Silhouette, empreinte, scène et gestes : ${avg(session.results.flatMap((r) => (r.diagnostic.modelsMs === null ? [] : [r.diagnostic.modelsMs]))) === null ? 'non analysés' : `analyse moyenne ${formatMs(avg(session.results.flatMap((r) => (r.diagnostic.modelsMs === null ? [] : [r.diagnostic.modelsMs]))))}`}`,
    `Objets : ${avg(session.results.flatMap((r) => (r.diagnostic.objectMs === null ? [] : [r.diagnostic.objectMs]))) === null ? 'non détectés' : `recherche moyenne ${formatMs(avg(session.results.flatMap((r) => (r.diagnostic.objectMs === null ? [] : [r.diagnostic.objectMs]))))}`}`,
    `Visages : ${session.faceError ? `INDISPONIBLE (${session.faceError})` : `${s.photosWithFaces} photos avec visage · recherche moyenne ${formatMs(s.avgFaceMs)}`}`,
    `Mémoire : ${session.heapAfterMB === null ? 'non mesurable sur ce navigateur' : `${session.heapBeforeMB?.toFixed(0)} → ${session.heapAfterMB.toFixed(0)} Mo`}`,
    `Écran maintenu allumé : ${session.wakeLock ? 'oui' : 'non'} (${session.wakeLockInfo}) · analyse ${session.cancelled ? 'ANNULÉE' : 'terminée'}`,
    '',
    'n° | nom | type (type déclaré) | taille | date de prise de vue | date du fichier | orientation | dimensions | décodage | netteté | erreur',
    '    puis : note, rang dans le paquet, raisons, et les mesures de chaque visage principal (de gauche à droite)',
  ];
  const scores = new Map<string, PhotoScore & { pack: string; scene: SceneType; decision: Decision | undefined; similarPrev: number; embedPrev: number | null }>();
  day.packs.forEach((pack, i) => {
    pack.pack.items.forEach((it, k) => {
      const score = pack.scores.get(it.id)!;
      const prev = pack.pack.items[k - 1];
      scores.set(it.id, {
        ...score,
        pack: `P${i + 1}`,
        scene: pack.sceneOf.get(it.id) ?? pack.scene,
        decision: pack.decisions.get(it.id),
        similarPrev: prev ? signatureDistance(prev.signature, it.signature) : NaN,
        embedPrev: prev ? embeddingSimilarity(prev.embedding, it.embedding) : null,
      });
    });
  });
  const choiceOf = new Map(records.map((r) => [r.key, r.choice]));
  const commentOf = new Map(records.filter((r) => r.comment).map((r) => [r.key, r.comment!.replace(/\s+/g, ' ')]));
  lines.splice(
    lines.length - 2,
    0,
    `Paquets : ${day.packs.map((p, i) => `P${i + 1} ${new Set(p.sceneOf.values()).size > 1 ? `mixte (${[...new Set(p.sceneOf.values())].join('+')})` : p.scene} (${p.pack.items.length} photos, ${p.poses.length} pose${p.poses.length > 1 ? 's' : ''}, ${[...p.decisions.values()].filter((d) => d.keep && !d.review).length} gardées par l'app${[...p.decisions.values()].some((d) => d.review) ? `, ${[...p.decisions.values()].filter((d) => d.review).length} à vérifier` : ''})`).join(' · ') || '—'}`,
    agreementLine(evaluateDay(day, records)),
    `Vos choix enregistrés : ${records.length} · goûts appris : ${
      Object.entries(learned)
        .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
        .join(', ') || 'aucun'
    }`,
    '',
  );
  session.results.forEach(({ item, diagnostic: g }, i) => {
    lines.push(
      [
        i + 1,
        item.fileName,
        `${item.format} (${g.mimeType})`,
        formatSize(item.sizeBytes),
        item.capturedAt === null ? 'ABSENTE' : formatDateTime(item.capturedAt),
        formatDateTime(g.fileModifiedAt),
        formatOrientation(item.orientation),
        `${item.width && item.height ? `${item.width}x${item.height}` : '?'} f${item.focal35 ?? '?'}`,
        g.decodeMs === null ? '—' : `${formatMs(g.decodeMs)} ${g.decodeMethod}/${g.thread}`,
        item.sharpness === null ? '—' : item.sharpness.toFixed(0),
        g.error ?? '',
      ].join(' | '),
    );
    const score = scores.get(item.id);
    const aside = asideKind(item);
    if (aside) lines.push(`    MIS DE CÔTÉ (${aside}) · scène ${(item.labels ?? []).slice(0, 3).map((l) => `${l.name} ${l.score.toFixed(2)}`).join(', ') || '?'}`);
    if (score) {
      const faces = mainFaces(item.faces)
        .sort((a, b) => a.box.x + a.box.width / 2 - (b.box.x + b.box.width / 2))
        .map(
          (f) =>
            `[x ${(f.box.x + f.box.width / 2).toFixed(2)} yeux ${f.eyesOpen.toFixed(2)} regard ${f.gaze.toFixed(2)} expr ${f.expression.toFixed(2)} sourire ${f.smile.toFixed(2)} parle ${f.talking.toFixed(2)} moue ${f.pout.toFixed(2)} net ${f.sharpness.toFixed(0)} tête ${f.yawDeg.toFixed(0)}°/${f.pitchDeg.toFixed(0)}° écart-objectif ${f.offAxisHDeg.toFixed(0)}°/${f.offAxisVDeg.toFixed(0)}° yeux-dir ${f.eyeH.toFixed(2)}/${f.eyeV.toFixed(2)}${f.cut ? ' COUPÉ' : ''} couleur ${color(f.upperColor)}/${color(f.lowerColor)}/${color(f.bodyColor)}]`,
        )
        .join(' ');
      const objects = (item.objects ?? []).map((o) => `${o.label} ${o.score.toFixed(2)}`).join(', ') || 'aucun';
      lines.push(
        `    ${score.pack} ${score.scene} pose ${score.decision?.pose ?? '?'} · app : ${score.decision ? `${score.decision.review ? 'À VÉRIFIER' : score.decision.keep ? 'GARDER' : 'supprimer'} (${score.decision.code}${score.decision.keptIds?.length ? ` après ${score.decision.keptIds.map((id) => day.dayIndex.get(id)).join('+')}` : ''})` : '?'} · vous : ${choiceOf.get(photoKey(item)) ?? '—'}${commentOf.get(photoKey(item)) ? ` « ${commentOf.get(photoKey(item))} »` : ''} · écart photo précédente ${Number.isFinite(score.similarPrev) ? score.similarPrev.toFixed(3) : '—'} ressemblance ${score.embedPrev === null ? '—' : score.embedPrev.toFixed(3)}`,
      );
      lines.push(
        `    note ${score.score.toFixed(2)} (base ${score.baseScore.toFixed(2)} appris ${score.learned >= 0 ? '+' : ''}${score.learned.toFixed(2)}) rang ${score.rank}${score.vetoed ? ' VETO' : ''} · couleurs ${item.color ? `vivacité ${item.color.colorfulness.toFixed(2)} chaud ${(item.color.warmFraction * 100).toFixed(0)}%×${item.color.warmStrength.toFixed(2)} contraste ${item.color.contrast.toFixed(2)} lum ${item.color.mean.toFixed(2)}` : '?'} · visages ${score.faceCount}/${score.expectedFaces} (2e recherche +${g.faceRetry}) · visages ${score.faceCount}/${score.expectedFaces} (${g.faceCount ?? '?'} détectés, ${formatMs(g.faceMs)}) · ${score.reasons.map((r) => r.code).join(', ') || '—'} · masquage ${score.occlusion.toFixed(2)} devant ${score.front.toFixed(2)} lum-visage ${score.faceBrightness.toFixed(2)} arrière-plan ${score.background.toFixed(2)} gêne ${score.distraction} · silhouette ${item.segmentation ? `peau au bord ${(item.segmentation.edgeBodySkin * 100).toFixed(1)}% (+${(score.extraEdgeSkin * 100).toFixed(1)}) peau visages ${item.segmentation.faceSkin.map((v) => (v === null ? '?' : `${(v * 100).toFixed(0)}%`)).join('/')}` : '?'} · scène ${(item.labels ?? []).slice(0, 3).map((l) => `${l.name} ${l.score.toFixed(2)}`).join(', ') || '?'} · bords masqués ${item.obstruction === null ? '?' : `${(item.obstruction * 100).toFixed(0)}% (+${(score.extraObstruction * 100).toFixed(0)})`}${score.failed ? ' · RATÉE' : ''} · penché ${item.tiltDeg?.toFixed(1) ?? '?'}° (force ${item.tiltStrength?.toFixed(2) ?? '?'}) · expo brûlé ${pct(item.exposure?.highlights)} bouché ${pct(item.exposure?.shadows)} moy ${item.exposure?.mean.toFixed(0) ?? '?'} · gestes : ${item.hands === null ? '—' : item.hands.map((h) => `${h.gesture} ${h.score.toFixed(2)}`).join(', ') || 'aucun'} · objets : ${objects} ${faces}`,
      );
    }
  });
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les navigateurs qui refusent l'accès direct au presse-papiers.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/**
 * Ouvre la feuille de partage d'iOS avec le texte (par exemple vers l'app Claude, Notes, Mail). Rien n'est envoyé
 * par l'app elle-même : c'est l'utilisateur qui choisit la destination. Renvoie false si le partage est indisponible.
 */
export async function shareText(text: string, title: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false;
  try {
    await navigator.share({ title, text });
    return true;
  } catch {
    return false;
  }
}

const ratio = (n: number, total: number) => `${n}/${total} (${total ? Math.round((n / total) * 100) : 0} %)`;

/** Accord entre l'app et vos choix : brut (gonflé), honnête, et avec les goûts de l'image (simulation). */
export function agreementLine(a: Agreement): string {
  if (a.total === 0) return 'Accord avec vos choix : aucun choix sur cette séance';
  return (
    `Accord avec vos choix : brut ${ratio(a.raw, a.total)} · honnête (sans vos choix du même paquet) ${ratio(a.honest, a.total)}` +
    ` · avec goûts de l'image, en test : ${a.withTaste === null ? `pas encore (${a.tasteChoices} choix avec empreinte, 20 nécessaires)` : `${ratio(a.withTaste, a.total)} (${a.tasteChoices} choix avec empreinte)`}`
  );
}
