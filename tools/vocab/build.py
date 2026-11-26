"""Vocabulaire de contexte du nouvel œil (jalon 8, point 62) : convertit les phrases de `concepts.py` en nombres.

Lancé de mon côté une fois par changement du vocabulaire, jamais sur l'iPhone ni pendant la construction de l'app.
Il faut la partie « texte » du même modèle que l'app (SigLIP 2 base patch16-224, Apache-2.0, version ONNX
d'onnx-community : onnx/text_model_int8.onnx et tokenizer.json), et python avec onnxruntime, tokenizers et numpy :

    python tools/vocab/build.py <dossier du modèle texte>

Chaque idée : moyenne normalisée de ses formulations × gabarits (texte en minuscules, 64 jetons complétés, comme à
l'entraînement de SigLIP 2), puis 8 bits par valeur, même codage que les empreintes d'image (`embeddingCodec.ts`).
"""
import base64, os, sys
import numpy as np, onnxruntime as ort
from tokenizers import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from concepts import CONCEPTS, TEMPLATES  # noqa: E402

model_dir = sys.argv[1]
tok = Tokenizer.from_file(os.path.join(model_dir, 'tokenizer.json'))
text = ort.InferenceSession(os.path.join(model_dir, 'text_model_int8.onnx'))
EOS, PAD, LEN = 1, 0, 64


def encode(phrases):
    ids = []
    for p in phrases:
        e = tok.encode(p.lower()).ids
        if not e or e[-1] != EOS:
            e = e + [EOS]
        ids.append((e[:LEN] + [PAD] * LEN)[:LEN])
    out = text.run(['pooler_output'], {'input_ids': np.array(ids, dtype=np.int64)})[0]
    return out / np.linalg.norm(out, axis=1, keepdims=True)


def to_int8_base64(v):
    q = np.round(v / np.abs(v).max() * 127).astype(np.int64) & 255
    return base64.b64encode(bytes(q.tolist())).decode()


lines = []
for cid, label, family, descs in CONCEPTS:
    v = encode([t.format(d) for d in descs for t in TEMPLATES]).mean(0)
    v = v / np.linalg.norm(v)
    lines.append(f"  ['{cid}', {label!r}, '{family}', '{to_int8_base64(v)}'],".replace('"', "'") if "'" not in label else
                 f"  ['{cid}', \"{label}\", '{family}', '{to_int8_base64(v)}'],")

out = os.path.join(HERE, '..', '..', 'src', 'engine', 'learning', 'vocab.generated.ts')
with open(out, 'w') as f:
    f.write('// Fichier produit par tools/vocab/build.py (ne pas modifier à la main) : vocabulaire de contexte du nouvel œil.\n')
    f.write('// Chaque idée : identifiant, nom affiché, famille, direction SigLIP 2 du texte (768 valeurs sur 8 bits, base64).\n\n')
    f.write('export const VOCAB_MODEL = \'siglip2-base-patch16-224\';\n\n')
    f.write('export const VOCAB: readonly (readonly [id: string, label: string, family: string, vector: string])[] = [\n')
    f.write('\n'.join(lines) + '\n];\n')
print(len(lines), 'idées ->', os.path.normpath(out))
