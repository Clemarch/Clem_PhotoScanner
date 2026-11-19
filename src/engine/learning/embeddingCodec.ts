// Empreinte d'image compacte, pour l'enregistrer avec un choix : chaque valeur sur 8 bits (-127 à 127), en base64.
// La ressemblance (cosinus) ne dépend pas de l'échelle : pas besoin de garder le facteur de conversion.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2]!;
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : ALPHABET[c & 63]!;
  }
  return out;
}

function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let k = 0;
  for (const ch of clean) {
    value = (value << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[k++] = (value >> bits) & 255;
    }
  }
  return out.subarray(0, k);
}

/** Empreinte (nombres réels) → texte compact. Null si l'empreinte manque ou est nulle. */
export function encodeEmbedding(vector: readonly number[] | null): string | null {
  if (!vector || vector.length === 0) return null;
  const max = Math.max(...vector.map(Math.abs));
  if (!(max > 0)) return null;
  const bytes = new Uint8Array(vector.length);
  vector.forEach((v, i) => (bytes[i] = (Math.round((v / max) * 127) + 256) & 255));
  return toBase64(bytes);
}

/** Texte compact → valeurs entières (-127 à 127). Null si le texte est invalide. */
export function decodeEmbedding(text: string | null | undefined): Int8Array | null {
  if (!text) return null;
  const bytes = fromBase64(text);
  if (!bytes || bytes.length === 0) return null;
  return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/** Ressemblance (cosinus, -1 à 1) entre deux empreintes de même longueur ; null sinon. */
export function cosine(a: ArrayLike<number> | null, b: ArrayLike<number> | null): number | null {
  if (!a || !b || a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : null;
}
