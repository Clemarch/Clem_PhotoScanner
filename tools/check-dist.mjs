// Vérifie la version publiée : politique de sécurité présente, aucune ressource chargée depuis un autre site.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const problems = [];
const html = readFileSync('dist/index.html', 'utf8');

if (!/Content-Security-Policy/.test(html) || !/connect-src 'self'/.test(html))
  problems.push("index.html : la politique de sécurité (connect-src 'self') est absente");
if (/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html))
  problems.push('index.html : une ressource est chargée depuis un autre site');
// Aucun script de l'app ne doit mentionner un service de mesure d'audience ou de statistiques.
// (« type.googleapis.com/… » est un simple nom de format interne à MediaPipe, pas une adresse appelée.)
const TRACKERS = /(?<!type\.)googleapis\.com|google-analytics|googletagmanager|doubleclick|sentry\.io|\/v1\/log/;
for (const file of readdirSync('dist/assets').filter((name) => name.endsWith('.js')))
  if (TRACKERS.test(readFileSync(`dist/assets/${file}`, 'utf8')))
    problems.push(`assets/${file} : contient l'adresse d'un service de statistiques`);
for (const file of [
  'sw.js',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'models/face_landmarker.task',
  'models/efficientdet_lite0.tflite',
  'models/wasm/vision_wasm_internal.wasm',
])
  if (!existsSync(`dist/${file}`)) problems.push(`dist/${file} est absent`);

if (problems.length) {
  console.error('Vérification de dist/ : ÉCHEC\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Vérification de dist/ : OK (politique de sécurité présente, aucune ressource externe)');
