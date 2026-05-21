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
    proxy: (() => {
      const worker = `http://localhost:${Number(process.env.WRANGLER_PORT) || 8787}`;
      // Forward the API + R2 + every marketing path back to the worker so
      // :5173 acts as a single dev origin (parents can nav dashboard →
      // /programs → /registration without origin-jumping). Vite still owns
      // /dashboard (the SPA) plus its internals (/@vite, /src, etc.).
      // Prod doesn't care - wrangler serves all of these on one origin.
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
