// Pure selection/basket logic for the programs-and-options model (see plan.md).
// No DB access: every function takes an already-resolved list of a program's
// options and a list of chosen option keys (cohort_keys). The catalog
// (lib/programs.js) resolves a program slug to its options and binds these.
//
// An option:
//   { key, label, price, enrolling, choiceGroup, startsOn }
//
//   key         = cohort_key
//   price       = the option's price (price_override, or the program's flat fee)
//   enrolling   = is the option currently on sale (derived stage === 'enrolling')
//   choiceGroup = options sharing a non-empty group are mutually exclusive
//                 ("choose one"); null/'' = freely combinable ("choose any")
//   startsOn    = event date (used to pick the primary cohort), may be null
//
// Mirrors lib/program-options.js's contract so route call sites read the same.

// Validate + price a basket of option keys. Only on-sale (enrolling) options are
// accepted; duplicates are dropped; at most one option per choiceGroup. Returns
// { ok, price, normalized } or { ok:false, error }.
export function validateAndPriceSelection(options, rawKeys) {
  const keys = Array.isArray(rawKeys) ? rawKeys.filter((x) => typeof x === "string") : [];
  if (keys.length === 0) return { ok: false, error: "Pick at least one option." };

  const byKey = new Map((options || []).map((o) => [o.key, o]));
  const accepted = [];
  const seenKeys = new Set();
  const seenGroups = new Set();

  for (const k of keys) {
    if (seenKeys.has(k)) continue;
    const opt = byKey.get(k);
    if (!opt || !opt.enrolling) continue;
    const group = opt.choiceGroup || null;
    if (group) {
      if (seenGroups.has(group)) return { ok: false, error: "Pick only one option from each group." };
      seenGroups.add(group);
    }
    seenKeys.add(k);
    accepted.push(k);
  }

  if (accepted.length === 0) return { ok: false, error: "Select a currently-open option." };
  const price = accepted.reduce((sum, k) => sum + (byKey.get(k).price || 0), 0);
  return { ok: true, price, normalized: accepted };
}

// Price of an arbitrary key list against the options. Used for the "from" side
// of an edit diff and for repricing existing receipts, where stored keys are
// valid even if their option is no longer on sale. Unknown keys are ignored.
export function priceOfSelection(options, keys) {
  const keySet = new Set(Array.isArray(keys) ? keys : []);
  let total = 0;
  for (const o of (options || [])) if (keySet.has(o.key)) total += o.price || 0;
  return total;
}

// Human labels for a set of keys, in options order so receipts/audit read
// consistently regardless of input order.
export function labelsOfSelection(options, keys) {
  const keySet = new Set(Array.isArray(keys) ? keys : []);
  return (options || []).filter((o) => keySet.has(o.key)).map((o) => o.label);
}

// Diff between two key sets for the same program. Validates `toKeys` (must be
// on sale + one-per-group); `fromKeys` is taken as-is (DB values are valid even
// if no longer on sale). Returns { ok:false, error } on a bad `to`, else
// { ok, fromPrice, toPrice, delta, action, normalizedTo }.
export function computeSelectionDiff(options, fromKeys, toKeys) {
  const v = validateAndPriceSelection(options, toKeys);
  if (!v.ok) return { ok: false, error: v.error };
  const fromPrice = priceOfSelection(options, fromKeys);
  const toPrice = v.price;
  const delta = toPrice - fromPrice;
  return {
    ok: true,
    fromPrice,
    toPrice,
    delta,
    action: delta === 0 ? "same" : delta > 0 ? "upgrade" : "downgrade",
    normalizedTo: v.normalized,
  };
}

// The primary cohort_key for a basket: the chosen option with the earliest
// startsOn (no date sorts last), tiebreak key ascending. Stored on
// registrations.cohort_key so legacy single-cohort readers keep working during
// the transition. Returns null if none of the keys resolve.
export function pickPrimaryCohort(options, keys) {
  const byKey = new Map((options || []).map((o) => [o.key, o]));
  const chosen = (Array.isArray(keys) ? keys : [])
    .map((k) => byKey.get(k))
    .filter(Boolean)
    .sort((a, b) => {
      const sa = a.startsOn || "9999-12-31";
      const sb = b.startsOn || "9999-12-31";
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  return chosen.length ? chosen[0].key : null;
}
