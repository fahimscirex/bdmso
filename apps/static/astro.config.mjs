import { defineConfig } from "astro/config";

// First slice of the static-site migration (see PLAN.md). During the port the
// Astro app and the legacy build.mjs output coexist; this app is not deployed
// yet. Assets (css/js/images) are symlinked from the repo's public/ via this
// app's public/ dir so ported pages render against the real stylesheet and the
// existing site.js chrome.
export default defineConfig({
  site: "https://bdmso.org",
  // Emit /terms.html (not /terms/index.html) so URLs match the current site
  // exactly during coexistence.
  build: { format: "file" },
});
