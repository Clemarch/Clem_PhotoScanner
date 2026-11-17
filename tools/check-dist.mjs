// Vérifie la version publiée : politique de sécurité présente, aucune ressource chargée depuis un autre site.
import { existsSync, readFileSync } from 'node:fs';

const problems = [];
const html = readFileSync('dist/index.html', 'utf8');

if (!/Content-Security-Policy/.test(html) || !/connect-src 'self'/.test(html))
  problems.push("index.html : la politique de sécurité (connect-src 'self') est absente");
if (/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html))
  problems.push('index.html : une ressource est chargée depuis un autre site');
for (const file of ['sw.js', 'manifest.webmanifest', 'apple-touch-icon.png'])
  if (!existsSync(`dist/${file}`)) problems.push(`dist/${file} est absent`);

if (problems.length) {
  console.error('Vérification de dist/ : ÉCHEC\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Vérification de dist/ : OK (politique de sécurité présente, aucune ressource externe)');
