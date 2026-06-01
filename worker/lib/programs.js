// Program catalog. The single source of truth is the D1 `programs` table
// (editable from the admin dashboard). loadCatalog(env) reads it once and
// returns a catalog object whose methods the routes call - so the ~20 call
// sites never touch raw columns or option shape, and a future schema/vocabulary
// change stays inside this file + lib/program-options.js.
//
// Use getCatalog(c) inside Hono handlers (memoised per request, one D1 read);
// use loadCatalog(env) where there is no Hono context (e.g. lib/email.js).

import {
  validateAndPrice,
  priceOf,
  labelsOf,
  computeDiff,
  isWithinEditWindow,
} from "./program-options.js";

// Stored pricing_json is { selection, choices:[{id,label,note,price}] }.
// Returns null for option-less programs (no/empty choices).
function parsePricing(json) {
  if (!json) return null;
  try {
    const p = JSON.parse(json);
    if (!p || !Array.isArray(p.choices) || p.choices.length === 0) return null;
    return p;
  } catch {
    return null;
  }
}

// Map the stored shape to the legacy client shape the registration form and
// guardian SPA still read ({ kind:'radio'|'checkbox', items:[{id,label,sub,price}] }).
// Remove once those clients adopt the new vocabulary.
function toClientConfig(cfg) {
  if (!cfg) return null;
  return {
    kind: cfg.selection === "single" ? "radio" : "checkbox",
    items: cfg.choices.map((c) => ({ id: c.id, label: c.label, sub: c.note || "", price: c.price })),
  };
}

// Read the programs table and build the catalog object.
export async function loadCatalog(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, fee_amount, pricing_json, registration_status,
            registration_opens, registration_closes, starts_on, hidden, repeatable
       FROM programs`
  ).all();
  const rows = results || [];

  const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
  const optionsBySlug = {};
  for (const r of rows) {
    const cfg = parsePricing(r.pricing_json);
    if (cfg) optionsBySlug[r.slug] = cfg;
  }

  // Plain maps kept for the few call sites that index directly. Prefer the
  // methods below for anything new.
  const names = Object.fromEntries(rows.map((r) => [r.slug, r.title]));
  const prices = Object.fromEntries(rows.map((r) => [r.slug, r.fee_amount ?? null]));

  return {
    names,
    prices,
    // is this a known program slug?
    has(slug) {
      return Object.prototype.hasOwnProperty.call(bySlug, slug);
    },
    nameFor(slug) {
      return names[slug] || slug;
    },
    // flat fee (BDT) or null ("on enquiry" / option-priced)
    priceFor(slug) {
      return prices[slug] ?? null;
    },
    programHasOptions(slug) {
      return !!optionsBySlug[slug];
    },
    // internal new-shape config (or null)
    getProgramOptions(slug) {
      return optionsBySlug[slug] || null;
    },
    // legacy-shape config for the SPA/registration form (or null)
    clientOptions(slug) {
      return toClientConfig(optionsBySlug[slug] || null);
    },
    validateAndPriceOptions(slug, ids) {
      return validateAndPrice(optionsBySlug[slug] || null, ids);
    },
    priceOptions(slug, ids) {
      return priceOf(optionsBySlug[slug] || null, ids);
    },
    getOptionLabels(slug, ids) {
      return labelsOf(optionsBySlug[slug] || null, ids);
    },
    computeOptionDiff(slug, fromIds, toIds) {
      return computeDiff(optionsBySlug[slug] || null, fromIds, toIds);
    },
    withinEditWindow(slug, todayISO = null) {
      const r = bySlug[slug];
      if (!r) return false;
      return isWithinEditWindow(r.registration_closes, todayISO);
    },
    registrationClosesFor(slug) {
      return bySlug[slug]?.registration_closes || null;
    },
    registrationStatusFor(slug) {
      return bySlug[slug]?.registration_status || null;
    },
    startsOnFor(slug) {
      return bySlug[slug]?.starts_on || null;
    },
    repeatable(slug) {
      return bySlug[slug]?.repeatable === 1;
    },
    // Enrollable iff known, not hidden, status 'open', and today within
    // [registration_opens, registration_closes]. Mirrors the old
    // registrationOpenFor (registration:false -> not 'open').
    registrationOpenFor(slug, todayISO = null) {
      const r = bySlug[slug];
      if (!r) return false;
      if (r.hidden) return false;
      if (r.registration_status !== "open") return false;
      const today = todayISO || new Date().toISOString().slice(0, 10);
      if (r.registration_opens && today < r.registration_opens) return false;
      if (r.registration_closes && today > r.registration_closes) return false;
      return true;
    },
    // Effective fee for a registration row: option-priced -> derived from the
    // stored options; else the flat fee; null = on enquiry.
    effectiveProgramPrice(reg) {
      if (this.programHasOptions(reg.registration_type)) {
        let opts = [];
        try { opts = JSON.parse(reg.program_options || "[]"); } catch { /* ignore */ }
        const priced = this.validateAndPriceOptions(reg.registration_type, opts);
        return priced.ok ? (priced.price ?? null) : null;
      }
      return this.priceFor(reg.registration_type);
    },
  };
}

// Memoised per-request accessor for Hono handlers. Loads the catalog at most
// once per request, then serves it synchronously to every call site.
export async function getCatalog(c) {
  let cat = c.get("catalog");
  if (!cat) {
    cat = await loadCatalog(c.env);
    c.set("catalog", cat);
  }
  return cat;
}
