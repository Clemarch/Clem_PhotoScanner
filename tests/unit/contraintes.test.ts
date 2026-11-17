// Vérifie automatiquement deux contraintes non négociables :
// 1. aucun appel réseau dans le code de l'app ;
// 2. le moteur (src/engine) ne dépend ni du navigateur, ni de platform, ni de ui.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Retire les commentaires pour ne juger que le code. */
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sources = listFiles('src')
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .map((path) => ({ path: relative('.', path), code: stripComments(readFileSync(path, 'utf8')) }));

const NETWORK = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /sendBeacon/,
  /importScripts/,
  /https?:\/\//,
];

describe('contraintes non négociables', () => {
  it('trouve bien les fichiers source', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('aucun appel réseau ni adresse externe dans src/', () => {
    const offenders = sources.flatMap(({ path, code }) =>
      NETWORK.filter((pattern) => pattern.test(code)).map((pattern) => `${path} : ${pattern}`),
    );
    expect(offenders).toEqual([]);
  });

  it('la bibliothèque de visages (MediaPipe) est figée sur une version sans envoi de statistiques', () => {
    // À partir de la version 1.0, MediaPipe envoie des statistiques d'usage à Google.
    // On reste sur une version exacte qui ne contient aucune adresse externe.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toMatch(/^0\.10\.\d+$/);
    const bundle = readFileSync('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', 'utf8');
    expect(bundle.match(/https?:\/\/[^"'\s)]+/g) ?? []).toEqual([]);
    expect(/XMLHttpRequest|WebSocket|sendBeacon/.test(bundle)).toBe(false);
  });

  it('le moteur n’importe ni platform, ni ui, ni bibliothèque externe', () => {
    const offenders = sources
      .filter(({ path }) => path.startsWith(join('src', 'engine')))
      .flatMap(({ path, code }) =>
        [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]
          .map((match) => match[1]!)
          .filter((target) => !target.startsWith('.') || /platform|ui/.test(target))
          .map((target) => `${path} → ${target}`),
      );
    expect(offenders).toEqual([]);
  });

  it('le moteur ne touche pas au navigateur', () => {
    const browser = /\b(window|document|navigator|localStorage|indexedDB|createImageBitmap|OffscreenCanvas)\b/;
    const offenders = sources
      .filter(({ path }) => path.startsWith(join('src', 'engine')))
      .filter(({ code }) => browser.test(code))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
