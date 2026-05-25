// Program option logic. The option CONFIG now lives in the catalog
// (public/data/programs-detail.json) under each program's `options`
// field - this module only holds the validation + pricing logic that
// reads it. To add/change options, edit programs-detail.json.
//
// `kind` is "checkbox" (multi-select, sum prices) or "radio"
// (single-pick, exact price).

import CATALOG from "../../public/data/programs-detail.json";

const PROGRAMS_BY_SLUG = Object.fromEntries(
  CATALOG.filter((p) => p && p.slug).map((p) => [p.slug, p]),
);
const OPTIONS_BY_SLUG = Object.fromEntries(
  Object.entries(PROGRAMS_BY_SLUG)
    .filter(([, p]) => p.options)
    .map(([slug, p]) => [slug, p.options]),
);

export function programHasOptions(slug) {
  return !!OPTIONS_BY_SLUG[slug];
}

export function getProgramOptions(slug) {
  return OPTIONS_BY_SLUG[slug] || null;
}

export function getProgram(slug) {
  return PROGRAMS_BY_SLUG[slug] || null;
}

// Human-readable labels for a set of option ids, in catalog order so the
// receipt + audit log read consistently regardless of input order.
export function getOptionLabels(slug, ids) {
  const cfg = OPTIONS_BY_SLUG[slug];
  if (!cfg) return [];
  const idSet = new Set(Array.isArray(ids) ? ids : []);
  return cfg.items.filter((it) => idSet.has(it.id)).map((it) => it.label);
}

// Price of an arbitrary id list against a program's config. Used to price
// the "from" side of a diff where the stored ids must already be valid.
export function priceOptions(slug, ids) {
  const cfg = OPTIONS_BY_SLUG[slug];
  if (!cfg) return null;
  const idSet = new Set(Array.isArray(ids) ? ids : []);
  let total = 0;
  for (const it of cfg.items) if (idSet.has(it.id)) total += it.price;
  return total;
}

// True if today is on or before the option-edit deadline. Falls back to
// `registrationEnds` when `optionsEditableUntil` is not set; treats the
// program as always-editable when neither is set.
export function withinEditWindow(slug, todayISO = null) {
  const p = PROGRAMS_BY_SLUG[slug];
  if (!p) return false;
  const deadline = p.optionsEditableUntil || p.registrationEnds;
  if (!deadline) return true;
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return today <= deadline;
}

// Diff between two option id sets for the same program. Validates the new
// set; the old set is taken as-is (DB-held values are already valid).
// Returns { ok: false, error } on a bad `to`, otherwise:
// { ok: true, fromPrice, toPrice, delta, action: 'same'|'upgrade'|'downgrade', normalizedTo }
export function computeOptionDiff(slug, fromIds, toIds) {
  const validation = validateAndPriceOptions(slug, toIds);
  if (!validation.ok) return { ok: false, error: validation.error };
  const fromPrice = priceOptions(slug, fromIds) ?? 0;
  const toPrice   = validation.price ?? 0;
  const delta     = toPrice - fromPrice;
  const action    = delta === 0 ? "same" : delta > 0 ? "upgrade" : "downgrade";
  return {
    ok: true,
    fromPrice,
    toPrice,
    delta,
    action,
    normalizedTo: validation.normalized,
  };
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
