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
    proxy: (() => {
      const worker = `http://localhost:${Number(process.env.WRANGLER_PORT) || 8787}`;
      // Same single-dev-origin trick as the guardian app - forward the
      // marketing surface back to the worker so admins can preview posts
      // / programs at :5174/blog/<slug> without origin-jumping.
      // Vite still owns /admin and its internals (/@vite, /src, etc.).
      const pass = [
        '/api', '/r2',
        '/programs', '/registration', '/blog', '/posts',
        '/about', '/team', '/results', '/resources', '/media',
        '/sponsorship', '/news', '/data', '/images', '/css', '/js',
        '/downloads', '/favicon.ico', '/robots.txt', '/sitemap.xml',
      ];
      return Object.fromEntries(pass.map((p) => [p, worker]));
    })(),
    // Leading-dot entries are wildcard-subdomain matches. Needed because
    // dev is reached through an extprod.indevs.in reverse-proxy tunnel
    // and Vite's DNS-rebinding protection (default since v5) otherwise
    // refuses non-localhost Host headers.
    allowedHosts: ['.extprod.indevs.in'],
  },
});
