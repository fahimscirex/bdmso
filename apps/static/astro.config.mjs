import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// The Astro app IS the static site now (build.mjs retired). It builds straight
// into the repo's dist/ - the directory the worker serves in production
// ([env.production.assets] in wrangler.toml). The admin/guardian SPAs build into
// dist/admin and dist/dashboard afterwards, so dist/ ends up as the full site.
// Assets (css/js/images/data/favicon/manifest) come from this app's public/,
// which symlinks the repo's public/ asset dirs.
export default defineConfig({
  site: "https://bdmso.org",
  outDir: "../../dist",
  // Static assets (css/js/images/data/downloads/favicon/manifest/robots) live in
  // the repo's public/ (assets-only now that build.mjs is gone). Point Astro
  // straight at it - real dirs copy reliably, unlike the old symlinked public/.
  publicDir: "../../public",
  // Emit /terms.html (not /terms/index.html) so URLs match the existing site.
  build: { format: "file" },
  integrations: [sitemap()],
  // Dev only: proxy /api to the worker running under `wrangler dev` (see
  // scripts/dev.mjs). Production routing is the worker itself; this just lets
  // `astro dev` serve the site while /api/* reaches the local worker + D1.
  vite: {
    // Do NOT wipe the shared dist/ on build - it also holds dist/admin and
    // dist/dashboard (the SPAs). Astro overwrites its own files; the SPA dirs
    // stay put so an incremental static rebuild never kills the dashboards.
    build: { emptyOutDir: false },
    server: { proxy: { "/api": `http://localhost:${process.env.WRANGLER_PORT || 8787}` } },
  },
});
