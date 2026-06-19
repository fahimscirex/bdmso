// Mirror the optimized image SOURCE into the repo's public/ so literal
// /images/... paths resolve where Astro's <Img> optimizer can't be used.
//
// Single source of truth: apps/static/src/assets/images/
//   - The public marketing site optimizes from here via <Img> (-> dist/_astro).
//   - The admin SPA (plain <img>) and any literal /images/... path need the file
//     served raw, i.e. under public/images/ (served by wrangler dev / copied to
//     dist by Astro's publicDir at build).
//
// public/images/ is therefore GENERATED (gitignored) - never edit it by hand.
// Runs automatically at predev/prebuild (see package.json), or `pnpm sync:images`.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src  = join(root, "apps/static/src/assets/images");
const dest = join(root, "public/images");

await mkdir(dest, { recursive: true });
await cp(src, dest, {
  recursive: true,
  // Skip editor sidecar metadata (.comments/*.xml); copy the images themselves.
  filter: (s) => !s.includes(`${"/"}.comments`) && !s.endsWith(".xml"),
});
console.log("[sync-images] mirrored apps/static/src/assets/images -> public/images");
