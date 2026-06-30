# Plan - Programs and their Options

Plain-language design. One idea runs through pricing, dates, and results.

> This **replaces** the earlier flag-based approach (`enroll_by_run` + reusing
> `program_options` for run keys) that was built locally. That approach worked but kept
> two pricing models side by side - the source of the messiness. This plan uses one
> model. See "What's already built" at the end.

---

## The one idea: a program has options

Two levels, matching exactly how BdMSO markets things:

- A **program** is the thing you announce: *Mock Test*, *National Olympiad*.
- Inside it are **options** - the dates, or the subjects. Each option has its own price,
  its own dates, its own capacity, its own results.
- A parent picks one or several options. Their registration is the **receipt**: the list
  of options they bought and what each cost that day.

An option group is either:
- **Choose any** - combinable, prices add up (the Mock Test dates: take one, two, or all).
- **Choose one** - pick exactly one, each carries its own price (Math / Science / Both).

A bundle like "Both - ৳1500" (cheaper than Math + Science) is just an option with its own
price. You set the tag; nothing is calculated. That's how every shop handles combos.

---

## What the admin sees (built for a non-coder)

```
Programs                         ← what you market
  • Mock Test
  • National Olympiad
  • Quiz Competition

Open "Mock Test":
  Sessions  (parents choose any)               [ + Add session ]
    19 Jun · ৳600 · closed
    26 Jun · ৳600 · closed
    3 Jul  · ৳600 · on sale
  → each row: edit price/dates · see who signed up · upload & publish results · archive

Open "National Olympiad":
  Subjects  (parents choose one)               [ + Add option ]
    Mathematics · ৳1000
    Science     · ৳1000
    Both        · ৳1500
```

It reads like the announcement. The only per-group setting is **Choose any / Choose one**.
No jargon, no flat list of look-alike entries.

---

## Today (why we're changing it)

A program carries a baked-in price list (`pricing_json`) plus a separate idea of "runs"
(cohorts), and a registration is glued to **one** run. Several mock dates got crammed into
one run, so you can't open, close, price, or publish each date on its own - the exact
problem blocking the 26 Jun vs 3 Jul mock results today.

---

## Pricing

- Each option has its **own price**. A registration's total = the prices of the options
  picked (added up across "choose any" groups; the single price inside a "choose one" group).
- Bundles need no special logic - "Both" is just an option priced 1500.
- Future-proof test: new combo or new date? Add an option with a price. No code change.

---

## Date management

Each option carries **its own two dates** and manages itself:

- **On-sale window** - when parents can buy it (enrollment opens → closes).
- **Event date** - when it actually happens (the session).

So:

- The registration page shows an option **only while it's on sale**; it opens and closes
  itself from its own dates. No program-wide date to babysit.
- Options are **independent**: closing the 3 Jul mock does nothing to the 10 Jul mock.
- **Adding a date = adding an option** with its own window. Ended options drop off the
  page automatically but stay for history and results.
- Status (upcoming / on-sale / running / ended) is read from the dates; draft and archived
  are the only manual overrides.

---

## Result upload

Results belong to the **option** (the option *is* the event):

- An option's **roster = everyone whose receipt includes it** - one clean lookup.
- Admin picks an option, sees its roster, types or uploads scores, hits **publish**.
  Parents who bought that option then see their result. Nothing else is touched.
- Each date is its own option, so you **publish each one independently** - releasing 26
  Jun can't disturb 19 Jun. (Impossible today.)
- An option says **which papers it covers** (Both = math + science). A "Both" buyer is
  graded on both papers; a math-only buyer only on math. The math result sheet gathers
  everyone whose option includes the math paper.
- Free mock students (camp/course) get a **৳0 receipt line** for the mock option when
  their results are imported, so they appear on the roster naturally - no special case.

---

## What changes in the data (kept minimal)

- **Options**: reuse the existing `cohorts` table (it already has dates, capacity, papers,
  status, per-option price). Add one column: `choice_group` ("choose one" marker; blank =
  choose any). Price is the option's existing `price_override`.
- **Receipt**: one new table - `registration_cohorts(registration_id, cohort_key,
  price_paid)`. One row per option bought, price frozen at purchase.
- **Removed at the end**: `program_options`, `pricing_json`, the single `cohort_key` on a
  registration, the `enroll_by_run` flag. One model, no flags, no field meaning two things.
- **Unchanged**: scores and attendance already attach to an option (`cohort_key`) - they
  keep working.

Why this kills the old gaps: per-option revenue = add up the receipt lines (exact, even
for multi-buys); history never recomputes (price frozen on the receipt); rosters are a
plain lookup; no flag to forget, no overloaded field.

---

## Migration (one-time, every program)

1. **Turn today's prices into options**: each price choice and each flat fee becomes an
   option; the mock dates become options.
2. **Turn each existing registration into a receipt**: map its old picks to options, record
   what it paid.
3. **Drop** the old columns.

Done once. Dry-run on a prod-synced copy first, then prod - after the 3 Jul cycle, with
explicit go-ahead.

---

## Honest cost

Bigger than the flag patch, because it touches **every** program and **all** history, once.
After that: one model, no flags, no special cases, no per-option revenue lies, prices never
silently change, rosters are clean lookups. Bigger now, clean for good.

---

## Build order (each step verified before the next)

- **Phase 1 - foundation (additive, cannot break prod):** migration (receipt table +
  `choice_group`); a pure selection/basket library (validate picks, enforce choose-one,
  sum prices, labels) with tests. Nothing live changes yet.
- **Phase 2 - read paths:** catalog lists a program's on-sale options; `/api/me`,
  receipts/emails show option labels + total. Still no behaviour change for non-migrated
  programs.
- **Phase 3 - write paths:** registration + payment + add-enrollment write receipt rows;
  per-option capacity.
- **Phase 4 - results & admin:** roster from the receipt table; admin Program → Options
  screen (price, dates, choose-any/one, results per option).
- **Phase 5 - guardian editing:** change/add options after signup (top-up payment).
- **Phase 6 - migrate data + switch over** (after 3 Jul, with go-ahead), then drop old columns.

---

## What's already built (to be replaced)

The flag-based version (~51 passing tests) is in the working tree: `enroll_by_run`,
`worker/lib/program-runs.js`, run branches across `public.js` / `admin.js` / `guardian.js`,
`scripts/migrate-mock-runs.mjs`. Reusable: the selection-pricing math and the "catalog
feeds the existing front-end picker" trick. Dropped: the flag and the reuse of
`program_options` - replaced by the receipt table. This is a redo of the data model, not a
tweak of the built version.
