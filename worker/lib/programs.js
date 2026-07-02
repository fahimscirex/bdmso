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

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
// "19 June 2026" from an ISO date - long form for the auto-generated schedule
// label of a run-priced program.
function formatLongDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return "";
  return `${Number(d)} ${LONG_MONTHS[mi]} ${y}`;
}

// Read the programs table and build the catalog object.
export async function loadCatalog(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, fee_amount, pricing_json, registration_status,
            registration_opens, registration_closes, starts_on, hidden, repeatable,
            always_open, enroll_by_run, pick_one
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

  // Run-pricing index: each program's cohorts expanded into flat SELECTABLE
  // ITEMS. A run with no options_json is one item (its flat price). A run WITH
  // options is one item per option (composite key "cohortKey::optionId", the
  // option's price + name). enrollment.js treats each item as a pickable unit.
  //
  // choiceGroup makes the selection rules work with no change to enrollment.js:
  //   - program pick_one -> every item shares group "_" (pick exactly one total)
  //   - otherwise        -> items share their run's group (one option per run),
  //                          different runs are different groups (combine across)
  // All cohorts load (not just enrolling) so labels/prices resolve for existing
  // registrations whose runs have since moved on.
  const runsBySlug = {};
  const { results: cohortRows } = await env.DB.prepare(
    `SELECT cohort_key, program_slug, label, starts_on, ends_on,
            status, enroll_opens, enroll_closes, price_override, options_json
       FROM cohorts`
  ).all();
  for (const c of (cohortRows || [])) {
    // Price lives on the run only - no program-fee fallback. An unset
    // price_override means the run isn't priced yet (0); admins set it per run.
    const flatPrice = c.price_override != null ? c.price_override : 0;
    const stage = deriveCohortStage(
      c.status, c.enroll_opens, c.enroll_closes, c.starts_on, c.ends_on,
    );
    const enrolling = stage === "enrolling";
    const group = bySlug[c.program_slug]?.pick_one === 1 ? "_" : c.cohort_key;
    const common = {
      cohortKey: c.cohort_key, enrolling, stage, choiceGroup: group,
      startsOn: c.starts_on || null, starts_on: c.starts_on || null, ends_on: c.ends_on || null,
    };
    let opts = [];
    try { const v = JSON.parse(c.options_json || "[]"); if (Array.isArray(v)) opts = v; } catch { /* ignore */ }
    const list = (runsBySlug[c.program_slug] ||= []);
    if (opts.length) {
      for (const o of opts) {
        if (!o || typeof o.id !== "string") continue;
        list.push({
          ...common, key: `${c.cohort_key}::${o.id}`, optionId: o.id,
          label: `${c.label} - ${o.label}`, price: Number(o.price) || 0,
        });
      }
    } else {
      list.push({ ...common, key: c.cohort_key, optionId: null, label: c.label, price: flatPrice });
    }
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
    // Every program is run-based now: dates + price live on its runs, and
    // program_options holds cohort selection keys. (enroll_by_run is retained as
    // a no-op column during the transition; it no longer gates anything.)
    isRunPriced(slug) {
      return !!bySlug[slug];
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
        // pick_one -> radio (pick exactly one). Otherwise checkbox (combine
        // runs); one-option-per-run is still enforced server-side.
        kind: bySlug[slug]?.pick_one === 1 ? "radio" : "checkbox",
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
    // Run-pricing bindings (mirror the option methods). runsFor returns the flat
    // selectable items for handleCatalog to build picker items.
    runsFor(slug) {
      return runsBySlug[slug] || [];
    },
    // Receipt rows for a selection: map chosen item keys -> { cohortKey,
    // optionId, price } so the caller writes registration_cohorts. Unknown keys
    // are skipped.
    selectionRows(slug, keys) {
      const byKey = new Map((runsBySlug[slug] || []).map((r) => [r.key, r]));
      const rows = [];
      for (const k of (Array.isArray(keys) ? keys : [])) {
        const it = byKey.get(k);
        if (it) rows.push({ cohortKey: it.cohortKey, optionId: it.optionId || null, price: it.price || 0 });
      }
      return rows;
    },
    // Auto-generated schedule for a run-priced program: the DISTINCT session
    // dates of runs that are enrolling or upcoming, in date order (e.g.
    // "19 June 2026 · 26 June 2026 · 3 July 2026"). Empty string if none.
    scheduleLabel(slug) {
      const seen = new Set();
      const dates = [];
      for (const r of (runsBySlug[slug] || [])) {
        if (r.stage !== "enrolling" && r.stage !== "upcoming") continue;
        if (!r.startsOn || seen.has(r.startsOn)) continue;
        seen.add(r.startsOn); dates.push(r.startsOn);
      }
      return dates.sort().map(formatLongDate).filter(Boolean).join(" · ");
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
      const items = runsBySlug[slug] || [];
      // pickPrimaryCohort returns the earliest chosen item's key (which may be a
      // composite "cohortKey::optionId"); map it back to the real cohort_key.
      const pk = pickPrimaryCohort(items, keys);
      return items.find((it) => it.key === pk)?.cohortKey ?? pk;
    },
    withinEditWindow(slug, todayISO = null) {
      // Run-based: a guardian can change their selection while the program is
      // still enrollable (a run is enrolling), not by the program's own window.
      return this.registrationOpenFor(slug, todayISO);
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
      // Run-based: open iff at least one run is currently enrolling. Fall back to
      // the program's own date window only when it has no runs yet (not migrated).
      const runs = runsBySlug[slug] || [];
      if (runs.length) return runs.some((run) => run.enrolling);
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
