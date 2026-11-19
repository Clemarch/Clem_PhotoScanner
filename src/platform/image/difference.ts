// Carte des différences entre deux photos presque identiques (même pose), à partir de leurs aperçus.
// Les deux images sont réduites (256 px de large), leurs luminosités moyennes égalisées, puis alignées par un
// décalage (recherche de ± 6 % de l'image) ; on cherche ensuite les zones qui changent vraiment.

export interface DiffZone {
  /** Rectangle en fractions de l'image A (0 à 1). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Intensité du changement, de 0 à 1. */
  strength: number;
}

export interface ImageDiff {
  /** Décalage de B par rapport à A, en fractions de la largeur et de la hauteur. */
  dx: number;
  dy: number;
  /** Différence moyenne après alignement (0 à 1). */
  mean: number;
  zones: DiffZone[];
  /** False si les deux cadrages sont trop différents pour comparer pixel à pixel. */
  comparable: boolean;
}

const WIDTH = 256;
const GRID_X = 16;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image illisible'));
    img.src = url;
  });
}

/** Image réduite : luminosité (pour l'alignement) et couleurs (pour les différences), moyennes ramenées à 128 :
 *  une photo un peu plus claire ne passe pas pour « tout a changé ». */
function pixelsOf(img: HTMLImageElement, w: number, h: number): { gray: Float32Array; rgb: Float32Array } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  canvas.width = 0;
  canvas.height = 0;
  const n = w * h;
  const rgb = new Float32Array(n * 3);
  const sums = [0, 0, 0];
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) {
      rgb[i * 3 + c] = data[i * 4 + c]!;
      sums[c] = sums[c]! + data[i * 4 + c]!;
    }
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = rgb[i * 3 + c]! + 128 - sums[c]! / n;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) gray[i] = 0.299 * rgb[i * 3]! + 0.587 * rgb[i * 3 + 1]! + 0.114 * rgb[i * 3 + 2]!;
  return { gray, rgb };
}

/** Écart de couleur entre un pixel de A et un pixel de B (moyenne des trois canaux). */
const colorGap = (a: Float32Array, i: number, b: Float32Array, j: number): number =>
  (Math.abs(a[i * 3]! - b[j * 3]!) + Math.abs(a[i * 3 + 1]! - b[j * 3 + 1]!) + Math.abs(a[i * 3 + 2]! - b[j * 3 + 2]!)) / 3;

/** Différence moyenne entre A et B décalée de (dx, dy) pixels, échantillonnée d'un pixel sur `step`. */
function cost(a: Float32Array, b: Float32Array, w: number, h: number, dx: number, dy: number, step: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y += step)
    for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x += step) {
      sum += Math.abs(a[y * w + x]! - b[(y + dy) * w + x + dx]!);
      n++;
    }
  return n > 0 ? sum / n : Infinity;
}

export async function diffImages(urlA: string, urlB: string): Promise<ImageDiff> {
  const [imgA, imgB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);
  const ratioA = imgA.naturalHeight / imgA.naturalWidth;
  const ratioB = imgB.naturalHeight / imgB.naturalWidth;
  if (Math.abs(ratioA - ratioB) > 0.02) return { dx: 0, dy: 0, mean: 1, zones: [], comparable: false };
  const w = WIDTH;
  const h = Math.max(8, Math.round(WIDTH * ratioA));
  const pa = pixelsOf(imgA, w, h);
  const pb = pixelsOf(imgB, w, h);
  const a = pa.gray;
  const b = pb.gray;

  // Alignement : recherche grossière (pas de 2), puis fine autour du meilleur décalage.
  const range = Math.round(0.06 * w);
  let best = { dx: 0, dy: 0, c: cost(a, b, w, h, 0, 0, 3) };
  for (let dy = -range; dy <= range; dy += 2)
    for (let dx = -range; dx <= range; dx += 2) {
      const c = cost(a, b, w, h, dx, dy, 3);
      if (c < best.c) best = { dx, dy, c };
    }
  const coarse = best;
  best = { ...coarse, c: Infinity };
  for (let dy = coarse.dy - 2; dy <= coarse.dy + 2; dy++)
    for (let dx = coarse.dx - 2; dx <= coarse.dx + 2; dx++) {
      if (Math.abs(dx) > range || Math.abs(dy) > range) continue;
      const c = cost(a, b, w, h, dx, dy, 1);
      if (c < best.c) best = { dx, dy, c };
    }
  const mean = cost(a, b, w, h, best.dx, best.dy, 1);

  // Différence par case d'une grille de 16 colonnes ; zones = cases nettement au-dessus du niveau habituel.
  const cell = w / GRID_X;
  const gy = Math.max(1, Math.round(h / cell));
  const cells = new Float32Array(GRID_X * gy);
  const counts = new Uint16Array(GRID_X * gy);
  for (let y = Math.max(0, -best.dy); y < Math.min(h, h - best.dy); y++)
    for (let x = Math.max(0, -best.dx); x < Math.min(w, w - best.dx); x++) {
      const k = Math.min(gy - 1, Math.floor(y / (h / gy))) * GRID_X + Math.min(GRID_X - 1, Math.floor(x / cell));
      cells[k] = cells[k]! + colorGap(pa.rgb, y * w + x, pb.rgb, (y + best.dy) * w + x + best.dx);
      counts[k] = counts[k]! + 1;
    }
  const values = Array.from(cells, (v, k) => (counts[k]! > 0 ? v / counts[k]! : 0));
  const sorted = [...values].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(22, median * 2.5);
  const marked = values.map((v) => v >= threshold);

  // Regroupement des cases voisines en zones.
  const seen = new Uint8Array(values.length);
  const zones: DiffZone[] = [];
  for (let k = 0; k < values.length; k++) {
    if (!marked[k] || seen[k]) continue;
    const stack = [k];
    seen[k] = 1;
    let x0 = GRID_X, y0 = gy, x1 = -1, y1 = -1, peak = 0;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % GRID_X;
      const cy = Math.floor(c / GRID_X);
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      peak = Math.max(peak, values[c]!);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= GRID_X || ny >= gy) continue;
        const n = ny * GRID_X + nx;
        if (marked[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    zones.push({ x: x0 / GRID_X, y: y0 / gy, width: (x1 - x0 + 1) / GRID_X, height: (y1 - y0 + 1) / gy, strength: Math.min(1, peak / 80) });
  }
  zones.sort((p, q) => q.strength * q.width * q.height - p.strength * p.width * p.height);
  // Plus d'un tiers de l'image qui change : ce n'est plus « presque identique », on ne trace pas de zones.
  const changed = marked.filter(Boolean).length / marked.length;
  return { dx: best.dx / w, dy: best.dy / h, mean: mean / 255, zones: changed > 0.35 ? [] : zones.slice(0, 6), comparable: changed <= 0.35 };
}
