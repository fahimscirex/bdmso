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
  deriveRegState,
  deriveCohortStage,
} from "./program-options.js";
import {
  validateAndPriceSelection,
  priceOfSelection,
  labelsOfSelection,
  computeSelectionDiff,
  pickPrimaryCohort,
} from "./enrollment.js";

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

// Compact dd/mm/yyyy range for a run's sub-line (e.g. "26/06/2026" or
// "26/06 - 03/07/2026"). Dates are stored ISO; display is en-GB per the
// project's no-American-dates convention. Empty when the run has no dates.
function runDateRange(run) {
  const fmt = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return y ? `${d}/${m}/${y}` : "";
  };
  const s = fmt(run.starts_on);
  const e = fmt(run.ends_on);
  if (s && e && s !== e) return `${s.slice(0, 5)} - ${e}`;
  return s || e || "";
}

// Read the programs table and build the catalog object.
export async function loadCatalog(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, fee_amount, pricing_json, registration_status,
            registration_opens, registration_closes, starts_on, hidden, repeatable,
            always_open, enroll_by_run
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

  // Run-pricing index: for each program, its cohorts as pickable runs. A run's
  // price is its price_override else the program's flat fee; `enrolling` is the
  // derived stage so only currently-open runs are selectable at signup. All
  // cohorts are loaded (not just enrolling) so labels/prices still resolve for
  // existing registrations whose runs have since moved to running/ended.
  const runsBySlug = {};
  const { results: cohortRows } = await env.DB.prepare(
    `SELECT cohort_key, program_slug, label, starts_on, ends_on,
            status, enroll_opens, enroll_closes, price_override, choice_group
       FROM cohorts`
  ).all();
  for (const c of (cohortRows || [])) {
    const fee = prices[c.program_slug] ?? null;
    const price = c.price_override != null ? c.price_override : fee;
    const enrolling = deriveCohortStage(
      c.status, c.enroll_opens, c.enroll_closes, c.starts_on, c.ends_on,
    ) === "enrolling";
    (runsBySlug[c.program_slug] ||= []).push({
      key: c.cohort_key, label: c.label, price, enrolling,
      // camelCase fields are the shape enrollment.js consumes; starts_on/ends_on
      // stay for runDateRange/clientRuns below.
      choiceGroup: c.choice_group || null, startsOn: c.starts_on || null,
      starts_on: c.starts_on || null, ends_on: c.ends_on || null,
    });
  }

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
    // Run-priced program? (programs.enroll_by_run = 1). When true, program_options
    // holds cohort_keys and pricing/labels go through the runs methods below, not
    // the option methods above.
    isRunPriced(slug) {
      return bySlug[slug]?.enroll_by_run === 1;
    },
    // internal new-shape config (or null)
    getProgramOptions(slug) {
      return optionsBySlug[slug] || null;
    },
    // legacy-shape config for the SPA/registration form (or null)
    clientOptions(slug) {
      return toClientConfig(optionsBySlug[slug] || null);
    },
    // legacy-shape picker items for a run-priced program: enrolling runs as
    // { kind:"checkbox", items:[{id,label,sub,price}] }. Null for non-run-priced
    // or programs with no enrolling runs. The static form and the guardian edit
    // modal both consume this shape, so runs flow through with no client change.
    clientRuns(slug) {
      const runs = (runsBySlug[slug] || []).filter((r) => r.enrolling);
      if (runs.length === 0) return null;
      return {
        kind: "checkbox",
        items: runs.map((r) => ({
          id: r.key,
          label: r.label,
          sub: runDateRange(r),
          price: r.price,
        })),
      };
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
    // Run-pricing bindings (mirror the option methods). runsFor returns the raw
    // array for handleCatalog to build picker items.
    runsFor(slug) {
      return runsBySlug[slug] || [];
    },
    validateAndPriceRuns(slug, keys) {
      return validateAndPriceSelection(runsBySlug[slug] || [], keys);
    },
    priceRuns(slug, keys) {
      return priceOfSelection(runsBySlug[slug] || [], keys);
    },
    getRunLabels(slug, keys) {
      return labelsOfSelection(runsBySlug[slug] || [], keys);
    },
    computeRunDiff(slug, fromKeys, toKeys) {
      return computeSelectionDiff(runsBySlug[slug] || [], fromKeys, toKeys);
    },
    // True if a program has any guardian-editable selection (option-priced OR
    // run-priced). Used by the edit-window gate so run-priced regs are editable
    // instead of being rejected as "no editable selection".
    hasEditableSelection(slug) {
      return this.isRunPriced(slug) || this.programHasOptions(slug);
    },
    // Branching diff for the edit paths (PATCH /options + /options/upgrade).
    // Same return shape as computeOptionDiff/computeRunDiff.
    diffSelection(slug, fromIds, toIds) {
      return this.isRunPriced(slug)
        ? this.computeRunDiff(slug, fromIds, toIds)
        : this.computeOptionDiff(slug, fromIds, toIds);
    },
    // Branching labels-by-slug for the duplicate-conflict messages in the edit
    // paths. (labelsFor(reg) covers the receipt/dashboard path.)
    selectionLabels(slug, ids) {
      return this.isRunPriced(slug) ? this.getRunLabels(slug, ids) : this.getOptionLabels(slug, ids);
    },
    // The primary cohort_key for a multi-run selection: the chosen run with the
    // earliest starts_on (runs with no date sort last), tiebreak cohort_key
    // ascending. Stored on registrations.cohort_key so legacy single-cohort
    // readers (payments, reports, scores) keep working. Returns null if none of
    // the keys resolve to a run of this program.
    primaryRunKey(slug, keys) {
      return pickPrimaryCohort(runsBySlug[slug] || [], keys);
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
      const r = bySlug[slug];
      if (!r) return null;
      return deriveRegState(r.always_open === 1, r.registration_opens, r.registration_closes, null);
    },
    startsOnFor(slug) {
      return bySlug[slug]?.starts_on || null;
    },
    repeatable(slug) {
      return bySlug[slug]?.repeatable === 1;
    },
    // Enrollable iff known, not hidden, and the derived registration state is
    // 'open' (always_open flag, else today within the date window).
    registrationOpenFor(slug, todayISO = null) {
      const r = bySlug[slug];
      if (!r) return false;
      if (r.hidden) return false;
      return deriveRegState(r.always_open === 1, r.registration_opens, r.registration_closes, todayISO) === "open";
    },
    // Effective fee for a registration row: run-priced -> sum of stored run
    // keys; option-priced -> derived from the stored options; else the flat
    // fee; null = on enquiry.
    effectiveProgramPrice(reg) {
      if (this.isRunPriced(reg.registration_type)) {
        let keys = [];
        try { keys = JSON.parse(reg.program_options || "[]"); } catch { /* ignore */ }
        if (!Array.isArray(keys) || keys.length === 0) return null;
        return this.priceRuns(reg.registration_type, keys);
      }
      if (this.programHasOptions(reg.registration_type)) {
        let opts = [];
        try { opts = JSON.parse(reg.program_options || "[]"); } catch { /* ignore */ }
        const priced = this.validateAndPriceOptions(reg.registration_type, opts);
        return priced.ok ? (priced.price ?? null) : null;
      }
      return this.priceFor(reg.registration_type);
    },
    // Human labels for a registration's stored selection, branching on pricing
    // mode the same way effectiveProgramPrice does. Returns [] for option-less
    // programs or unresolvable ids. Used by /api/me and receipt emails so they
    // don't each repeat the run-vs-option branch.
    labelsFor(reg) {
      let ids = [];
      try { ids = JSON.parse(reg.program_options || "[]"); } catch { return []; }
      const list = Array.isArray(ids) ? ids : [];
      if (this.isRunPriced(reg.registration_type)) return this.getRunLabels(reg.registration_type, list);
      if (this.programHasOptions(reg.registration_type)) return this.getOptionLabels(reg.registration_type, list);
      return [];
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
