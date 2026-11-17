import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Politique de sécurité : le navigateur lui-même refuse tout appel vers un autre site.
// Appliquée seulement à la version publiée (le mode développement a besoin de scripts en ligne).
const CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  // 'wasm-unsafe-eval' autorise seulement l'exécution du moteur de calcul embarqué (WebAssembly).
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'photo-triage-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Chemins relatifs : l'app marche quelle que soit l'adresse où elle est hébergée.
  base: './',
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      workbox: {
        // Le modèle de visages et son moteur sont mis en cache avec l'app : tout marche hors ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,wasm,task}'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
      },
      manifest: {
        name: 'Photo Triage',
        short_name: 'Photo Triage',
        description: 'Trie les photos d’une journée, entièrement sur l’iPhone.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0f12',
        theme_color: '#0e0f12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
