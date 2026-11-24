// Modèles du « nouvel œil » (105 Mo) : téléchargés par l'app elle-même à l'ouverture, une seule fois, avec une
// progression visible, vérifiés (taille et empreinte SHA-256), puis gardés sur l'iPhone (Cache Storage). Ils viennent
// de la même adresse que l'app, jamais d'un autre site. Tant qu'ils ne sont pas là, l'analyse marche sans eux.
// (Ils ne passent plus par la mise à jour de l'app : une mise à jour de 170 Mo échouait ou traînait — audit du 24/11.)

export interface ModelFile {
  file: string;
  bytes: number;
  sha256: string;
}

export const EYE_MODELS: readonly ModelFile[] = [
  { file: 'clip_vit_b32_int8.onnx', bytes: 88_648_877, sha256: '0ab0c1b3ace708e539633af1744d5a95247fe4e14d3e08ff197ef82a6cb9bd93' },
  { file: 'hsemotion_b0_va.onnx', bytes: 16_049_834, sha256: 'c43e056ad388d4a8dc911832b8291435b2af537f967e5870ebd731574ec7e812' },
];

/** Nom versionné : un modèle changé un jour aura un nouveau cache, l'ancien sera effacé. */
export const MODEL_CACHE = 'nouvel-oeil-v1';
const TOTAL = EYE_MODELS.reduce((n, m) => n + m.bytes, 0);

export const modelUrl = (base: string, file: string): string => new URL(file, base).href;
export const modelsBase = (): string => new URL('./models/onnx/', document.baseURI).href;

export interface ModelsState {
  ready: boolean;
  /** Octets déjà présents ou téléchargés, et total. */
  done: number;
  total: number;
  /** Dernière erreur de téléchargement (connexion coupée…), ou null. */
  error: string | null;
}

async function present(cache: Cache, base: string, m: ModelFile): Promise<boolean> {
  const hit = await cache.match(modelUrl(base, m.file));
  return !!hit && Number(hit.headers.get('content-length') ?? '0') === m.bytes;
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Erreur qu'un nouvel essai ne corrigerait pas (fichier abîmé, stockage plein) : inutile de retélécharger 88 Mo. */
class FinalError extends Error {}

/** État actuel, sans rien télécharger. Ne lève jamais d'erreur : un stockage inaccessible est rendu comme une erreur. */
export async function modelsState(): Promise<ModelsState> {
  if (typeof caches === 'undefined') return { ready: false, done: 0, total: TOTAL, error: 'stockage indisponible' };
  try {
    const cache = await caches.open(MODEL_CACHE);
    const base = modelsBase();
    let done = 0;
    for (const m of EYE_MODELS) if (await present(cache, base, m)) done += m.bytes;
    return { ready: done === TOTAL, done, total: TOTAL, error: null };
  } catch (e) {
    return { ready: false, done: 0, total: TOTAL, error: message(e) };
  }
}

/**
 * Télécharge les modèles manquants, un par un, avec la progression ; 3 essais par fichier en cas de coupure. Chaque
 * fichier n'est gardé que s'il est complet et intact (empreinte vérifiée). Renvoie l'état final, sans jamais lever
 * d'erreur.
 */
export async function ensureModels(onProgress: (state: ModelsState) => void): Promise<ModelsState> {
  if (typeof caches === 'undefined') return { ready: false, done: 0, total: TOTAL, error: 'stockage indisponible' };
  let done = 0;
  let error: string | null = null;
  try {
    // Anciennes versions des modèles : effacées.
    for (const name of await caches.keys()) if (name.startsWith('nouvel-oeil-') && name !== MODEL_CACHE) await caches.delete(name);
    const cache = await caches.open(MODEL_CACHE);
    const base = modelsBase();
    for (const m of EYE_MODELS) {
      if (await present(cache, base, m)) {
        done += m.bytes;
        onProgress({ ready: done === TOTAL, done, total: TOTAL, error });
        continue;
      }
      let ok = false;
      let retry = true;
      for (let attempt = 0; attempt < 3 && !ok && retry; attempt++) {
        try {
          // Seule exception à la règle « aucun appel réseau » : les modèles, depuis l'adresse de l'app elle-même.
          // eslint-disable-next-line no-restricted-globals -- téléchargement des modèles du nouvel œil (même adresse que l'app)
          const response = await fetch(modelUrl(base, m.file), { cache: 'no-store' });
          if (!response.ok || !response.body) throw new Error(`réponse ${response.status}`);
          const reader = response.body.getReader();
          // Mémoire iOS : un seul tampon de la taille du fichier, rempli au fur et à mesure (pas de copies en plus).
          const data = new Uint8Array(m.bytes);
          let got = 0;
          let shownAt = 0;
          for (;;) {
            const { done: end, value } = await reader.read();
            if (end) break;
            if (got + value.byteLength > m.bytes) {
              void reader.cancel();
              throw new FinalError(`fichier trop long (plus de ${m.bytes} octets)`);
            }
            data.set(value, got);
            got += value.byteLength;
            // Progression affichée au plus 5 fois par seconde : chaque mise à jour redessine l'app.
            const now = performance.now();
            if (now - shownAt > 200) {
              shownAt = now;
              onProgress({ ready: false, done: done + got, total: TOTAL, error: null });
            }
          }
          if (got !== m.bytes) throw new Error(`fichier incomplet (${got} octets sur ${m.bytes})`);
          if ((await sha256(data)) !== m.sha256) throw new FinalError('fichier abîmé (empreinte différente)');
          try {
            await cache.put(
              modelUrl(base, m.file),
              new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(m.bytes) } }),
            );
          } catch (e) {
            throw new FinalError(`stockage : ${message(e)}`);
          }
          ok = true;
          done += m.bytes;
          error = null;
        } catch (e) {
          error = message(e);
          if (e instanceof FinalError) retry = false;
        }
      }
      onProgress({ ready: false, done, total: TOTAL, error });
      if (!ok) break;
    }
  } catch (e) {
    error = message(e);
  }
  const state = { ready: done === TOTAL, done, total: TOTAL, error: done === TOTAL ? null : error };
  onProgress(state);
  return state;
}

/** Octets d'un modèle gardé sur l'iPhone (utilisable dans un fil séparé), ou null s'il manque. */
export async function readModel(base: string, file: string): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined') return null;
  const hit = await (await caches.open(MODEL_CACHE)).match(modelUrl(base, file));
  return hit ? new Uint8Array(await hit.arrayBuffer()) : null;
}
