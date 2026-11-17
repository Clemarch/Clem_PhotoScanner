import type { Session } from './session';
import { config, groupIntoPacks, mainFaces, scorePack, type PhotoScore } from '../engine';
import { formatDateTime, formatMs, formatOrientation, formatSize } from './format';

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
export function buildReport(session: Session): string {
  const s = summarize(session);
  const d = session.device;
  const lines = [
    '=== Photo Triage — rapport de diagnostic ===',
    `Appareil : ${d.userAgent}`,
    `Écran : ${d.screen} · cœurs : ${d.cores ?? '?'} · installée : ${d.installed ? 'oui' : 'non'} · hors ligne prêt : ${d.offlineReady ? 'oui' : 'non'}`,
    `Fonctions : ${Object.entries(d.support).map(([k, v]) => `${k} ${v ? 'oui' : 'NON'}`).join(', ')}`,
    `Stockage : ${d.storageUsedMB?.toFixed(1) ?? '?'} / ${d.storageQuotaMB?.toFixed(0) ?? '?'} Mo`,
    '',
    `Fichiers : ${s.total} · avec date : ${s.withDate} · SANS date : ${s.withoutDate} · RAW mis de côté : ${s.raw} · erreurs : ${s.errors}`,
    `Types : ${counts(s.formats)}`,
    `Décodage : ${counts(s.methods)} · fil : ${counts(s.threads)}`,
    `Temps : total ${formatMs(session.totalMs)} · décodage moyen ${formatMs(s.avgDecodeMs)} · max ${formatMs(s.maxDecodeMs)}`,
    `Visages : ${session.faceError ? `INDISPONIBLE (${session.faceError})` : `${s.photosWithFaces} photos avec visage · recherche moyenne ${formatMs(s.avgFaceMs)}`}`,
    `Mémoire : ${session.heapAfterMB === null ? 'non mesurable sur ce navigateur' : `${session.heapBeforeMB?.toFixed(0)} → ${session.heapAfterMB.toFixed(0)} Mo`}`,
    `Écran maintenu allumé : ${session.wakeLock ? 'oui' : 'non'} · analyse ${session.cancelled ? 'ANNULÉE' : 'terminée'}`,
    '',
    'n° | nom | type (type déclaré) | taille | date de prise de vue | date du fichier | orientation | dimensions | décodage | netteté | erreur',
    '    puis : note, rang dans le paquet, raisons, et les mesures de chaque visage principal (de gauche à droite)',
  ];
  const day = groupIntoPacks(
    session.results.map((r) => r.item),
    config.grouping.packGapSeconds,
  );
  const scores = new Map<string, PhotoScore & { pack: string }>();
  day.packs.forEach((pack, i) => scorePack(pack.items).forEach((score, id) => scores.set(id, { ...score, pack: `P${i + 1}` })));
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
    if (score) {
      const faces = mainFaces(item.faces)
        .sort((a, b) => a.box.x + a.box.width / 2 - (b.box.x + b.box.width / 2))
        .map(
          (f) =>
            `[x ${(f.box.x + f.box.width / 2).toFixed(2)} yeux ${f.eyesOpen.toFixed(2)} regard ${f.gaze.toFixed(2)} expr ${f.expression.toFixed(2)} sourire ${f.smile.toFixed(2)} net ${f.sharpness.toFixed(0)} tête ${f.yawDeg.toFixed(0)}°/${f.pitchDeg.toFixed(0)}° écart-objectif ${f.offAxisHDeg.toFixed(0)}°/${f.offAxisVDeg.toFixed(0)}° yeux-dir ${f.eyeH.toFixed(2)}/${f.eyeV.toFixed(2)}${f.cut ? ' COUPÉ' : ''}]`,
        )
        .join(' ');
      lines.push(
        `    ${score.pack} note ${score.score.toFixed(2)} rang ${score.rank}${score.vetoed ? ' VETO' : ''} · visages ${score.faceCount}/${score.expectedFaces} (${g.faceCount ?? '?'} détectés, ${formatMs(g.faceMs)}) · ${score.reasons.map((r) => r.code).join(', ') || '—'} ${faces}`,
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
