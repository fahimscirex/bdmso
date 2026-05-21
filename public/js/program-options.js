// Browser-side program option helpers. The option CONFIG comes from
// program-options-data.js, which is GENERATED at build time from
// public/data/programs-detail.json - the single editable source. To
// add or change options, edit that JSON, not this file.

import { PROGRAM_OPTIONS } from './program-options-data.js';

export { PROGRAM_OPTIONS };

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
