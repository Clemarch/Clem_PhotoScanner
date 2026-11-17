// Copie le moteur de calcul de MediaPipe (fichiers WASM) dans public/, pour qu'il soit servi par l'app elle-même
// et jamais téléchargé depuis un autre site.
import { copyFileSync, mkdirSync } from 'node:fs';

const from = 'node_modules/@mediapipe/tasks-vision/wasm';
const to = 'public/models/wasm';
mkdirSync(to, { recursive: true });
for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(`${from}/${file}`, `${to}/${file}`);
console.log('Moteur MediaPipe copié dans public/models/wasm');
