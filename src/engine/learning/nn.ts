// Petit réseau de neurones pour classer deux photos d'une même pose (jalon 8, étape 5, point 64). Écrit à la main,
// sans bibliothèque : une couche cachée (tanh) et un lien direct. Il part de la formule et n'apprend qu'une correction :
// note = échelle × note de la formule + réseau(x). Sans exemples, c'est la formule. Résultats reproductibles (graine).
// Moteur pur.

export interface NetOptions {
  /** Neurones de la couche cachée. */
  hidden: number;
  /** Passes sur toutes les paires, pas d'apprentissage (Adam), frein contre l'apprentissage par cœur. */
  epochs: number;
  rate: number;
  l2: number;
  /** Poids de la note de la formule (même échelle que les autres candidats du Labo). */
  formulaScale: number;
  seed: number;
}

export interface NetPair {
  keep: readonly number[];
  drop: readonly number[];
  /** Note de la formule : gardée − supprimée. */
  base: number;
}

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même réseau. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Net {
  /** Correction apportée à la formule pour une photo (ses mesures `x`). */
  (x: readonly number[]): number;
}

/** Entraîne le réseau sur des paires « gardée / supprimée » (perte logistique sur l'écart des deux notes). */
export function trainPairNet(pairs: readonly NetPair[], opts: NetOptions): Net {
  const dims = pairs[0]?.keep.length ?? 0;
  const H = opts.hidden;
  if (pairs.length === 0 || dims === 0) return () => 0;
  const rnd = random(opts.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  // Paramètres : W (H × dims), c (H), v (H), u (dims, lien direct).
  const W = Float64Array.from({ length: H * dims }, () => gauss() / Math.sqrt(dims));
  const c = new Float64Array(H);
  const v = Float64Array.from({ length: H }, () => gauss() * 0.01);
  const u = new Float64Array(dims);
  const params = [W, c, v, u];
  const m = params.map((p) => new Float64Array(p.length));
  const s = params.map((p) => new Float64Array(p.length));
  const grads = params.map((p) => new Float64Array(p.length));
  const hA = new Float64Array(H);
  const hB = new Float64Array(H);

  const hiddenOf = (x: readonly number[], out: Float64Array) => {
    for (let j = 0; j < H; j++) {
      let z = c[j]!;
      const row = j * dims;
      for (let i = 0; i < dims; i++) z += W[row + i]! * x[i]!;
      out[j] = Math.tanh(z);
    }
  };
  const outputOf = (x: readonly number[], h: Float64Array) => {
    let y = 0;
    for (let j = 0; j < H; j++) y += v[j]! * h[j]!;
    for (let i = 0; i < dims; i++) y += u[i]! * x[i]!;
    return y;
  };

  const b1 = 0.9;
  const b2 = 0.999;
  for (let epoch = 1; epoch <= opts.epochs; epoch++) {
    for (const g of grads) g.fill(0);
    for (const p of pairs) {
      hiddenOf(p.keep, hA);
      hiddenOf(p.drop, hB);
      const z = opts.formulaScale * p.base + outputOf(p.keep, hA) - outputOf(p.drop, hB);
      // d(perte)/dz pour perte = log(1 + e^-z), moyennée sur les paires.
      const g = -1 / (1 + Math.exp(z)) / pairs.length;
      const [gW, gc, gv, gu] = grads as [Float64Array, Float64Array, Float64Array, Float64Array];
      for (let i = 0; i < dims; i++) gu[i]! += g * (p.keep[i]! - p.drop[i]!);
      for (let j = 0; j < H; j++) {
        gv[j]! += g * (hA[j]! - hB[j]!);
        const dA = g * v[j]! * (1 - hA[j]! * hA[j]!);
        const dB = -g * v[j]! * (1 - hB[j]! * hB[j]!);
        gc[j]! += dA + dB;
        const row = j * dims;
        for (let i = 0; i < dims; i++) gW[row + i]! += dA * p.keep[i]! + dB * p.drop[i]!;
      }
    }
    params.forEach((p, k) => {
      const g = grads[k]!;
      const mk = m[k]!;
      const sk = s[k]!;
      for (let i = 0; i < p.length; i++) {
        const gi = g[i]! + opts.l2 * p[i]!;
        mk[i] = b1 * mk[i]! + (1 - b1) * gi;
        sk[i] = b2 * sk[i]! + (1 - b2) * gi * gi;
        const mh = mk[i]! / (1 - b1 ** epoch);
        const sh = sk[i]! / (1 - b2 ** epoch);
        p[i]! -= (opts.rate * mh) / (Math.sqrt(sh) + 1e-8);
      }
    });
  }
  return (x) => {
    const h = new Float64Array(H);
    hiddenOf(x, h);
    return outputOf(x, h);
  };
}
