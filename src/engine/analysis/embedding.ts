// Empreinte fine (vecteur produit par le modèle d'empreinte) : ressemblance entre deux photos.

/** Ressemblance (cosinus) entre deux empreintes : 1 = identiques, 0 = sans rapport. null si l'une manque. */
export function embeddingSimilarity(a: readonly number[] | null, b: readonly number[] | null): number | null {
  if (!a || !b || a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? null : dot / Math.sqrt(na * nb);
}
