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
