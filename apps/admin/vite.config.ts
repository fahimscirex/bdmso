import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Builds to <repo-root>/dist/admin/. Worker serves /admin/* via SPA fallback
// in worker/index.js (rewriteForAsset). Vite base must match the URL prefix
// so hashed assets resolve correctly in production.
//
// Dev server is on :5174 (guardian uses :5173). Both proxy /api to the
// Worker dev server on :8787.
export default defineConfig({
  plugins: [preact()],
  base: '/admin/',
  build: {
    outDir: `${import.meta.dirname}/../../dist/admin`,
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
