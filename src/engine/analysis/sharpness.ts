// Netteté globale : variance du Laplacien, mesurée case par case.
// Le Laplacien réagit aux contours fins ; une image floue en a peu, donc une variance faible.

type Bytes = Uint8Array | Uint8ClampedArray;

/** Convertit des pixels RGBA en niveaux de gris (0 à 255). */
export function rgbaToGray(rgba: Bytes, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
  }
  return gray;
}

/**
 * Netteté d'une image en niveaux de gris.
 * On mesure chaque case d'une grille, puis on fait la moyenne des cases les plus nettes :
 * ainsi un fond flou (mode Portrait, ciel uni) ne fait pas baisser la note d'un sujet net.
 */
export function sharpnessFromGray(
  gray: Bytes,
  width: number,
  height: number,
  gridSize: number,
  topFraction: number,
): number {
  if (width < 3 || height < 3) return 0;
  const grid = Math.max(1, Math.min(gridSize, Math.floor(Math.min(width, height) / 3)));
  const cells = grid * grid;
  const sum = new Float64Array(cells);
  const sumSq = new Float64Array(cells);
  const count = new Uint32Array(cells);

  for (let y = 1; y < height - 1; y++) {
    const cy = Math.min(grid - 1, Math.floor((y * grid) / height));
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      const c = cy * grid + Math.min(grid - 1, Math.floor((x * grid) / width));
      sum[c]! += lap;
      sumSq[c]! += lap * lap;
      count[c]!++;
    }
  }

  const variances: number[] = [];
  for (let c = 0; c < cells; c++) {
    const n = count[c]!;
    if (n === 0) continue;
    const mean = sum[c]! / n;
    variances.push(sumSq[c]! / n - mean * mean);
  }
  if (variances.length === 0) return 0;
  variances.sort((a, b) => b - a);
  const keep = Math.max(1, Math.round(variances.length * topFraction));
  let total = 0;
  for (let i = 0; i < keep; i++) total += variances[i]!;
  return total / keep;
}
