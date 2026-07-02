// Pure program-option logic. No catalog/DB access here - every function takes
// an already-resolved option config in the stored shape:
//
//   { selection: 'single' | 'multiple', choices: [{ id, label, note, price }] }
//
// `single` = pick exactly one (exact price). `multiple` = pick any, prices sum.
// The catalog (lib/programs.js) resolves a slug to its config and binds these.
// Keeping this layer pure means it is trivially unit/parity-testable and the
// route call sites never see raw shape - future vocabulary changes stay in the
// catalog + here, not at the ~20 consumers.

// Validate a list of option ids against a config. Returns
// { ok, price, normalized } (normalized = the sanitised id list we accepted),
// or { ok:false, error } on a bad selection. A null config means "no options"
// -> { ok:true, price:null, normalized:[] } so option-less programs pass.
export function validateAndPrice(cfg, rawOptions) {
  if (!cfg) return { ok: true, price: null, normalized: [] };
  const ids = Array.isArray(rawOptions) ? rawOptions.filter((x) => typeof x === "string") : [];
  const validIds = new Set(cfg.choices.map((c) => c.id));

  if (cfg.selection === "single") {
    if (ids.length !== 1) return { ok: false, error: "Please pick one option." };
    if (!validIds.has(ids[0])) return { ok: false, error: "Invalid option." };
    const choice = cfg.choices.find((c) => c.id === ids[0]);
    return { ok: true, price: choice.price, normalized: [choice.id] };
  }

  if (cfg.selection === "multiple") {
    if (ids.length === 0) return { ok: false, error: "Pick at least one option." };
    const accepted = [];
    let price = 0;
    for (const id of ids) {
      const choice = cfg.choices.find((c) => c.id === id);
      if (!choice || accepted.includes(choice.id)) continue;
      accepted.push(choice.id);
      price += choice.price;
    }
    if (accepted.length === 0) return { ok: false, error: "Invalid option selection." };
    return { ok: true, price, normalized: accepted };
  }

  return { ok: false, error: "Unsupported option selection." };
}

// Price of an arbitrary id list against a config. Used for the "from" side of a
// diff, where stored ids are already known-valid. null config -> null.
export function priceOf(cfg, ids) {
  if (!cfg) return null;
  const idSet = new Set(Array.isArray(ids) ? ids : []);
  let total = 0;
  for (const c of cfg.choices) if (idSet.has(c.id)) total += c.price;
  return total;
}

// Human labels for a set of ids, in config order so receipts/audit read
// consistently regardless of input order.
export function labelsOf(cfg, ids) {
  if (!cfg) return [];
  const idSet = new Set(Array.isArray(ids) ? ids : []);
  return cfg.choices.filter((c) => idSet.has(c.id)).map((c) => c.label);
}

// Diff between two id sets for the same config. Validates `toIds`; `fromIds`
// is taken as-is (DB-held values are already valid). Returns { ok:false, error }
// on a bad `to`, otherwise { ok, fromPrice, toPrice, delta, action, normalizedTo }.
export function computeDiff(cfg, fromIds, toIds) {
  const v = validateAndPrice(cfg, toIds);
  if (!v.ok) return { ok: false, error: v.error };
  const fromPrice = priceOf(cfg, fromIds) ?? 0;
  const toPrice = v.price ?? 0;
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

// True if today is on or before the program's registration_closes date. A
// program with no close date is always-editable. One window drives every
// guardian-initiated edit (options/subject/venue).
export function isWithinEditWindow(registrationCloses, todayISO = null) {
  if (!registrationCloses) return true;
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return today <= registrationCloses;
}

// Derive a program's registration state (open | upcoming | closed) from its
// always-open flag plus the date window. `today` is an ISO 'YYYY-MM-DD' string
// (lexicographic compare is correct for ISO dates); null -> today's date.
// This is the single shared helper - "registration is open" === 'open'.
export function deriveRegState(yearRound, starts, ends, today = null) {
  today = today || new Date().toISOString().slice(0, 10);
  if (yearRound) return 'open';
  if (starts && today < starts) return 'upcoming';
  if (ends && today > ends) return 'closed';
  if (starts || ends) return 'open';
  return 'closed';
}

// Derive a run's (cohort's) lifecycle stage from its own dates - the same enrol
// window logic as deriveRegState, plus the session end for the running->ended
// step. 'draft' and 'archived' are manual overrides and pass straight through.
// `today` defaults to the UTC date, matching deriveRegState. Keep the SQL mirror
// in worker/routes/admin.js (cohortStageSQL) in sync with this.
export function deriveCohortStage(status, enrollOpens, enrollCloses, startsOn, endsOn, today = null) {
  if (status === 'draft' || status === 'archived') return status;
  // No date signals to derive from -> honour the stored status.
  if (!enrollOpens && !enrollCloses && !startsOn && !endsOn) return status;
  today = today || new Date().toISOString().slice(0, 10);
  if (endsOn && today > endsOn) return 'ended';
  if (enrollOpens && today < enrollOpens) return 'upcoming';
  if (!enrollCloses || today <= enrollCloses) return 'enrolling';
  return 'running';
}

// ── Schedule label ──────────────────────────────────────────────────────────
// Human schedule line for a program's runs - what shows under the price on the
// program cards/pages. Takes [{ stage, startsOn, enrollCloses }] (one per run;
// per-option duplicates are fine) and states the two facts a parent actually
// needs, from the runs that are enrolling or upcoming:
//
//   both known       "Registration ends 10 July 2026 · Session starts 3 August 2026"
//   deadline only    "Registration ends 10 July 2026"           (competitions)
//   session only     "Session starts 19 June 2026"
//   nothing active   ""   (callers fall back to the manual label)
//
// Several runs collapse to the latest deadline + the earliest session start;
// each option's own dates are shown on its row in the picker.
const SCHEDULE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function formatDay(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || m > 12 || !d) return '';
  return `${d} ${SCHEDULE_MONTHS[m - 1]} ${y}`;
}

export function scheduleLabelFromRuns(windows) {
  const active = (windows || []).filter((w) => w && (w.stage === 'enrolling' || w.stage === 'upcoming'));
  const closes = active.map((w) => w.enrollCloses).filter(Boolean).sort().pop();
  const starts = active.map((w) => w.startsOn).filter(Boolean).sort()[0];
  const parts = [];
  if (closes) parts.push(`Registration ends ${formatDay(closes)}`);
  if (starts) parts.push(`Session starts ${formatDay(starts)}`);
  return parts.join(' · ');
}
