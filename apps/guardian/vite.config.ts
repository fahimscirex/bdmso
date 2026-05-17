import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Builds to <repo-root>/dist/dashboard/. The Worker serves this prefix via
// the ASSETS binding (wrangler.prod.toml uses dist/, wrangler.toml uses public/).
// In production, asset paths must be /dashboard/<file> so the Worker can
// resolve them. `base` handles that.
//
// import.meta.dirname is Node 20+ native; no need for @types/node here.
export default defineConfig({
  plugins: [preact()],
  base: '/dashboard/',
  build: {
    outDir: `${import.meta.dirname}/../../dist/dashboard`,
    emptyOutDir: true,
  },
  server: {
    // Override with VITE_PORT=NNNN and WRANGLER_PORT=NNNN to run on different
    // ports. Proxy points to the Worker dev server so cookies/auth flow naturally.
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      '/api': `http://localhost:${Number(process.env.WRANGLER_PORT) || 8787}`,
    },
  },
});
