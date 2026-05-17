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
    // Override with VITE_PORT=NNNN and WRANGLER_PORT=NNNN to run on different
    // ports (e.g. when :5174 or :8787 are in use, or to run several stacks
    // side by side).
    port: Number(process.env.VITE_PORT) || 5174,
    proxy: {
      '/api': `http://localhost:${Number(process.env.WRANGLER_PORT) || 8787}`,
    },
  },
});
