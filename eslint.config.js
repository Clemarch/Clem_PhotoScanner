import tseslint from 'typescript-eslint';

const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'].map((name) => ({
  name,
  message: 'Aucun appel réseau : tout reste sur l’iPhone.',
}));

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'indexedDB'].map((name) => ({
  name,
  message: 'Le moteur (src/engine) ne touche pas au navigateur : passez par src/platform.',
}));

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'Aucun appel réseau.' },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS, ...BROWSER_GLOBALS],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/platform/**', '**/ui/**', 'react*', 'exifr'], message: 'Le moteur reste pur.' }] },
      ],
    },
  },
);
