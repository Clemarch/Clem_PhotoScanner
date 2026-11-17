// Bords masqués : zone sombre et uniforme qui envahit l'image depuis un bord (montant de hublot, doigt sur
// l'objectif, ombre). On l'estime sur une grille de cases, en propageant depuis les bords.

import { config } from '../config';

export function measureObstruction(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): number {
  const cfg = config.obstruction;
  const gx = cfg.gridX;
  const gy = cfg.gridY;
  if (width < gx || height < gy) return 0;
  const sum = new Float64Array(gx * gy);
  const sq = new Float64Array(gx * gy);
  const count = new Uint32Array(gx * gy);
  // Un pixel sur deux suffit.
  for (let y = 0; y < height; y += 2) {
    const cy = Math.min(gy - 1, Math.floor((y * gy) / height));
    for (let x = 0; x < width; x += 2) {
      const c = cy * gx + Math.min(gx - 1, Math.floor((x * gx) / width));
      const v = gray[y * width + x]!;
      sum[c]! += v;
      sq[c]! += v * v;
      count[c]!++;
    }
  }
  const masked = new Uint8Array(gx * gy);
  for (let c = 0; c < gx * gy; c++) {
    const n = count[c]!;
    if (n === 0) continue;
    const mean = sum[c]! / n;
    const std = Math.sqrt(Math.max(0, sq[c]! / n - mean * mean));
    if (mean < cfg.darkBelow && std < cfg.flatBelow) masked[c] = 1;
  }
  // Propagation depuis les cases du bord.
  const seen = new Uint8Array(gx * gy);
  const stack: number[] = [];
  for (let x = 0; x < gx; x++) stack.push(x, (gy - 1) * gx + x);
  for (let y = 0; y < gy; y++) stack.push(y * gx, y * gx + gx - 1);
  let filled = 0;
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (seen[c] || !masked[c]) continue;
    seen[c] = 1;
    filled++;
    const x = c % gx;
    const y = Math.floor(c / gx);
    if (x > 0) stack.push(c - 1);
    if (x < gx - 1) stack.push(c + 1);
    if (y > 0) stack.push(c - gx);
    if (y < gy - 1) stack.push(c + gx);
  }
  return filled / (gx * gy);
}
