// Browser-side program option helpers. The option config now comes from the D1
// catalog (worker /api/catalog), shared with program-catalog.js. Call
// `await initProgramOptions()` once before reading PROGRAM_OPTIONS / using the
// helpers below - the registration form does this during its init.
//
// PROGRAM_OPTIONS is a live object that initProgramOptions() populates in place
// (it is not reassigned), so existing `import { PROGRAM_OPTIONS }` consumers see
// the data once init resolves.

import { loadCatalog } from './program-catalog.js';

export const PROGRAM_OPTIONS = {};
let ready = null;

// Populate PROGRAM_OPTIONS from the catalog's per-program `options`. Idempotent
// + cached for the page.
export function initProgramOptions() {
  if (!ready) {
    ready = loadCatalog().then((catalog) => {
      for (const k of Object.keys(PROGRAM_OPTIONS)) delete PROGRAM_OPTIONS[k];
      for (const p of catalog) if (p && p.options) PROGRAM_OPTIONS[p.slug] = p.options;
      return PROGRAM_OPTIONS;
    });
  }
  return ready;
}

export function programHasOptions(slug) {
  return !!PROGRAM_OPTIONS[slug];
}

export function computeOptionsTotal(slug, ids) {
  const cfg = PROGRAM_OPTIONS[slug];
  if (!cfg) return null;
  let total = 0;
  for (const id of ids) {
    const item = cfg.items.find((it) => it.id === id);
    if (item) total += item.price;
  }
  return total;
}
