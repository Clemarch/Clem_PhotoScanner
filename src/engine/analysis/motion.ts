// Flou de bougé (27/11, point 67) : une photo prise en bougeant (traînées de lumière) garde des contours nets dans
// une seule direction ; la variance du Laplacien la croit nette. Ici, le « tenseur de structure » : on additionne les
// directions des contours de toute l'image. Une vraie scène a des contours dans toutes les directions (cohérence
// faible) ; un bougé les aligne tous (cohérence forte, partout). Moteur pur.

type Bytes = Uint8Array | Uint8ClampedArray;

export interface Motion {
  /** Alignement des contours sur toute l'image (0 : toutes directions, 1 : une seule). */
  coherence: number;
  /** Même mesure, moyennée case par case (un bougé aligne les contours partout, pas seulement sur un horizon). */
  local: number;
  /** Direction des traînées, en degrés (0 : horizontale, 90 : verticale), entre 0 et 180. */
  angleDeg: number;
}

/** Mesure faite sur une version réduite (~256 points de côté) : rapide, et insensible au bruit fin. */
export function measureMotion(gray: Bytes, width: number, height: number, cells = 8): Motion {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 256));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  if (w < 8 || h < 8) return { coherence: 0, local: 0, angleDeg: 0 };
  // Réduction par moyenne de blocs (pas un point sur N : le grain de la photo brouillerait les directions).
  const small = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < step; dy++) {
        const row = (y * step + dy) * width + x * step;
        for (let dx = 0; dx < step; dx++) sum += gray[row + dx]!;
      }
      small[y * w + x] = sum / (step * step);
    }
  const at = (x: number, y: number) => small[y * w + x]!;
  let jxx = 0;
  let jyy = 0;
  let jxy = 0;
  const cxx = new Float64Array(cells * cells);
  const cyy = new Float64Array(cells * cells);
  const cxy = new Float64Array(cells * cells);
  for (let y = 1; y < h - 1; y++) {
    const cy = Math.min(cells - 1, Math.floor((y * cells) / h));
    for (let x = 1; x < w - 1; x++) {
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      const xx = gx * gx;
      const yy = gy * gy;
      const xy = gx * gy;
      jxx += xx;
      jyy += yy;
      jxy += xy;
      const c = cy * cells + Math.min(cells - 1, Math.floor((x * cells) / w));
      cxx[c]! += xx;
      cyy[c]! += yy;
      cxy[c]! += xy;
    }
  }
  const coh = (xx: number, yy: number, xy: number) => (xx + yy > 0 ? Math.sqrt((xx - yy) ** 2 + 4 * xy * xy) / (xx + yy) : 0);
  // Cases presque unies (ciel, mur) écartées : leur direction ne veut rien dire.
  const energy = Array.from(cxx, (v, i) => v + cyy[i]!);
  const floor = Math.max(...energy) * 0.05;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < energy.length; i++)
    if (energy[i]! > floor && energy[i]! > 0) {
      sum += coh(cxx[i]!, cyy[i]!, cxy[i]!);
      n++;
    }
  // Direction des contours (gradient) ; les traînées lui sont perpendiculaires.
  const gradient = (0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180) / Math.PI;
  const angleDeg = (((gradient + 90) % 180) + 180) % 180;
  return { coherence: coh(jxx, jyy, jxy), local: n ? sum / n : 0, angleDeg };
}

/** Écart (degrés) entre une direction et l'horizontale ou la verticale la plus proche (0 à 45). */
export function offAxisDeg(angleDeg: number): number {
  const a = ((angleDeg % 90) + 90) % 90;
  return Math.min(a, 90 - a);
}
