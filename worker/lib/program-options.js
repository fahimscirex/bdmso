// Program option logic. The option CONFIG now lives in the catalog
// (public/data/programs-detail.json) under each program's `options`
// field - this module only holds the validation + pricing logic that
// reads it. To add/change options, edit programs-detail.json.
//
// `kind` is "checkbox" (multi-select, sum prices) or "radio"
// (single-pick, exact price).

import CATALOG from "../../public/data/programs-detail.json";

const OPTIONS_BY_SLUG = Object.fromEntries(
  CATALOG.filter((p) => p && p.options).map((p) => [p.slug, p.options]),
);

export function programHasOptions(slug) {
  return !!OPTIONS_BY_SLUG[slug];
}

export function getProgramOptions(slug) {
  return OPTIONS_BY_SLUG[slug] || null;
}

// Validate a list of option ids against the program's config. Returns
// { ok, price, normalized } - normalized is the sanitised id list so
// callers can store exactly what we accepted.
export function validateAndPriceOptions(slug, rawOptions) {
  const cfg = OPTIONS_BY_SLUG[slug];
  if (!cfg) return { ok: true, price: null, normalized: [] };
  const ids = Array.isArray(rawOptions) ? rawOptions.filter((x) => typeof x === "string") : [];
  const validIds = new Set(cfg.items.map((it) => it.id));

  if (cfg.kind === "radio") {
    if (ids.length !== 1) return { ok: false, error: `Please pick one ${cfg.label.toLowerCase()} option.` };
    if (!validIds.has(ids[0])) return { ok: false, error: "Invalid option." };
    const item = cfg.items.find((it) => it.id === ids[0]);
    return { ok: true, price: item.price, normalized: [item.id] };
  }

  if (cfg.kind === "checkbox") {
    if (ids.length === 0) return { ok: false, error: `Pick at least one ${cfg.label.toLowerCase()} option.` };
    const accepted = [];
    let price = 0;
    for (const id of ids) {
      const item = cfg.items.find((it) => it.id === id);
      if (!item || accepted.includes(item.id)) continue;
      accepted.push(item.id);
      price += item.price;
    }
    if (accepted.length === 0) return { ok: false, error: "Invalid option selection." };
    return { ok: true, price, normalized: accepted };
  }

  return { ok: false, error: "Unsupported option kind." };
}
