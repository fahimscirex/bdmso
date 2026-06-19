import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone admin SPA built with React + shadcn/ui. Dev server on :5175 so it
// can run alongside the existing Preact admin (:5174) and guardian (:5173).
// Proxies /api to the Worker dev server on :8787 - same single-origin trick as
// the other apps - so the typed API client can be wired to the real backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served under /admin by the Worker (replaces the old Preact admin). Builds
  // to <repo-root>/dist/admin so the worker's existing /admin/* SPA fallback
  // serves it unchanged.
  base: '/admin/',
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    outDir: `${import.meta.dirname}/../../dist/admin`,
    emptyOutDir: true,
    // Don't eagerly <link rel=modulepreload> the heavy async vendor chunks from
    // the entry HTML - the default did so on EVERY route (e.g. ~113KB gz of
    // charts on /registrations, which never renders a chart). They still load on
    // demand on the routes that import them.
    modulePreload: {
      resolveDependencies: (_file, deps) =>
        deps.filter((d) => !/(vendor-charts|vendor-table|calendar)/.test(d)),
    },
    rollupOptions: {
      output: {
        // Isolate the heavy libraries into their own async chunks so they load
        // only on the pages that use them (charts: dashboard/reports/payments;
        // table: every list page). react/react-dom get a stable vendor chunk so
        // they cache across deploys instead of riding the changing entry chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
          if (id.includes('@tanstack')) return 'vendor-table';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5175,
    proxy: {
      '/api': `http://localhost:${Number(process.env.WRANGLER_PORT) || 8787}`,
      // Image previews/uploads resolve through the worker (repo-backed assets).
      '/admin-img': `http://localhost:${Number(process.env.WRANGLER_PORT) || 8787}`,
    },
  },
});
