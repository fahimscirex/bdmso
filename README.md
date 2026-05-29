# BdMSO Website

The Bangladesh Mathematics & Science Olympiad website: a static marketing site, a guardian dashboard, and an admin dashboard - all served by a single Cloudflare Worker with a D1 database and ShurjoPay payments.

## Stack

| Layer | Service |
|---|---|
| Static hosting | Cloudflare Workers (assets binding) |
| API endpoints | Cloudflare Worker (Hono) |
| Database | Cloudflare D1 (SQLite) |
| File uploads | Cloudflare R2 (`bdmso-assets` bucket) |
| Payments | ShurjoPay v2 |
| Email | Brevo (transactional API) |
| Dashboards | Preact SPAs (`apps/guardian`, `apps/admin`) |
| Security | Rate limiting, PBKDF2 password hashing, CSP/HSTS headers, parameterized queries |

---

## Making Content Edits

Most content on the home page is driven by JSON files in `public/data/`. Edit the relevant file, run `npm run build`, and refresh - no HTML changes needed.

### Stats bar (numbers after each event)

**`public/data/stats.json`**

```json
{ "value": "100", "unit": "+", "label": "Partner Schools" }
```

Change `value`, `unit`, or `label`. Add or remove objects to add/remove stat items.

---

### Road to IMSO (dates each year)

**`public/data/steps.json`**

```json
{ "name": "Registration", "date": "JAN - FEB 2026" }
```

Update `date` values at the start of each season. Steps are numbered automatically in order.

---

### Blog posts (also drives the home page widget)

The blog is powered by Markdown files with YAML frontmatter. To publish a new post:

**Step 1 - create the Markdown file**

`public/posts/my-post-slug.md`

```markdown
---
title: My Post Title
slug: my-post-slug
category: Announcement
date: 2026-05-01
author: Author Name
excerpt: One-sentence summary shown on the blog listing card.
image: images/photo.webp
---

Write your post content here in standard Markdown.

## Section heading

Paragraphs, **bold**, *italic*, [links](https://example.com), lists, blockquotes all work.
```

**Step 2 - regenerate `posts/index.json`**

`posts/index.json` is auto-generated from the frontmatter of every `.md` file in `public/posts/`. Both the blog list (`blog.html`) and the per-post pages (`post.html`) read it, so it must be refreshed any time you change a frontmatter field.

| When you're working | Run |
|---|---|
| Building for deploy | `npm run build` |
| One-off regeneration | `node scripts/build.mjs` |
| Live editing while a dev server is running | `npm run dev:worker` (rebuilds on every `.md` save) or `npm run posts:watch` in a second terminal |

Body content (everything after the frontmatter) is read directly from the `.md` file, so edits to the body show up on reload without re-running anything.

The post is accessible at `/posts/my-post-slug`. Set `featured: "true"` to pin it as the large card on the blog listing and home page widget.

---

### Programs

**`public/data/programs-detail.json`** is the single source of truth for every program - one array, one object per program. Editing this one file updates:

- the home page program grid
- the `/programs` marketing grid (and its category filter)
- each per-program detail page at `/programs/<slug>`
- the prices and names used by the Worker API and both dashboards

No HTML or code changes are needed.

| Field | What it does |
|---|---|
| `slug` | URL identifier - `/programs/<slug>`. Don't change once a program is live. |
| `title`, `tagline` | Program name and one-line summary. |
| `feeAmount` | Fee in BDT as a number, or `null` for "on enquiry". For option-priced programs this is the "from" price. |
| `registration` | `true` = open for enrollment. `false` = closed: the detail page shows "Registration closed", and the registration page and API both reject it. |
| `hidden` | `true` removes the program entirely - no detail page, no grid card. Omit (or set `false`) to show it. |
| `home_order` | A string like `"01"`. Programs with this field appear on the home page grid, sorted by its value. Omit to keep a program off the home page. |
| `category` | `beginner`, `advanced`, or `residential` - drives the `/programs` grid filter. |
| `registrationStarts`, `registrationEnds` | ISO dates (`2026-04-01`). Drive the "Open" badge, the "soon" state on the grids, AND the per-enrollment edit window - while today <= `registrationEnds`, guardians can change options, subject, and venue from their dashboard; after, the Edit affordance disappears and the server rejects writes to those fields with 409. |
| `startsOn` | ISO date when the program begins. Shown in the guardian dashboard "Key dates" rail. |
| `audience`, `duration`, `outcome`, `eyebrow` | Facts shown in the detail page sidebar. |
| `bespokePage` | `true` means a hand-authored page at `public/programs/<slug>.html` is used as-is; the page generator skips it. Used for custom layouts (e.g. Maryam Mirzakhani School). |
| `description`, `what_youll_do`, `next_steps` | Body content (arrays of strings) for generated detail pages. |
| `options` | Per-cohort choices that carry their own prices - e.g. Mock Test sessions (checkboxes), National Olympiad / Prep Course subjects (radio). Guardians can edit their selection from the dashboard while the program is in-window (downgrades are free, upgrades create a top-up payment). |

Common edits:

- **Close registration:** set `"registration": false`.
- **Hide a program completely:** set `"hidden": true`.
- **Add a program:** add an object with at least `slug`, `title`, `tagline`, `feeAmount`, `registration`; add `home_order` to feature it on the home page.

After editing, run `npm run build` so `dist/` and the generated `/programs/*` pages pick up the change. `public/js/program-options-data.js` is generated from the `options` field during the build - do not edit it by hand.

---

### Hall of Fame / Results

**`public/data/results.json`** - two arrays:

- `featured` - medal-winner profile cards: `name`, `medal`, `medalLabel`, `subject`, `class`, `event`, `quote`, `photoClass`.
- `photos` - the "Faces of Bangladesh" slideshow on the home page: `src`, `caption`, `year`.

`medal` controls badge colour: `"gold"`, `"silver"`, or `"bronze"`.
`photoClass`: `""`, `"ph-gold"`, or `"ph-navy"`.

---

### In the news

**`public/data/media.json`** - the press-mentions strip: `date`, `title`, `src`, `url`, `outlet`, `favicon`.

---

### Downloadable files

Drop PDFs and documents into `public/downloads/`. They are copied to `dist/` by the build and served at `/downloads/<filename>`. Link to them from any page (e.g. the Maryam Mirzakhani School page links its curriculum PDF).

---

### Everything else (navigation, footer, page copy)

| What | File |
|---|---|
| Nav links, logo | `public/js/site.js` |
| Colours, typography, spacing | `public/css/styles.css` |
| Hero text, about section, testimonials | `public/index.html` |
| Other pages | `public/about.html`, `blog.html`, etc. |

---

## Local Development

### One-time setup

```bash
# Tools (install globally if not already):
npm install -g wrangler pnpm

# Workspace deps (root + apps/):
pnpm install

# `wrangler.toml` is committed and ready to use - it points at the
# project's D1/R2 by default. Contributors running against their own
# CF account should copy `wrangler.example.toml` to `wrangler.local.toml`
# (gitignored), fill in their own IDs, and run wrangler with
# `--config wrangler.local.toml`.

# Local secrets:
cp .env.example .env                   # SITE_URL for build output (gitignored — never commit)
cp .dev.vars.example .dev.vars         # SHURJOPAY_*, BREVO_API_KEY, EMAIL_FROM (gitignored — never commit)

# Initialise local D1 with the canonical schema (idempotent; safe to re-run):
wrangler d1 execute bdmso --local --file=./db/schema.sql

# Optional: seed test coupons. db/schema.sql holds structure only -
# coupon seeds live in separate files so a stray --remote re-run of
# schema.sql can't accidentally seed test data into production.
cp db/seed-dev.example.sql  db/seed-dev.sql   # fill in TESTBDMSO etc.
cp db/seed-prod.example.sql db/seed-prod.sql  # fill in the live pilot code
wrangler d1 execute bdmso --local --file=./db/seed-dev.sql
wrangler d1 execute bdmso --local --file=./db/seed-prod.sql
```

The two `seed-*.sql` files are gitignored — keep the real coupon codes there, not in source control. The `.example.sql` templates ship `REPLACE_ME_*` placeholders so contributors know the shape without leaking values.

### Daily dev - pick the workflow

The site has three independent dev surfaces. You'll usually only run one at a time.

| What you're working on | Command | URL |
|---|---|---|
| **Marketing site + Worker API** | `npm run dev:worker` | http://localhost:8787 |
| **Guardian dashboard** (HMR) | `npm run dev:guardian` | http://localhost:5173 |
| **Admin dashboard** (HMR) | `npm run dev:admin` | http://localhost:5174 |
| **Production-like preview** (full integration) | `npm run preview` | http://localhost:8787 |

`dev:guardian` and `dev:admin` each spawn **two** processes: `wrangler dev` (API on :8787) and a Vite dev server (HMR on :5173 or :5174). The Vite server proxies `/api/*` to wrangler so cookies and auth flow naturally during development.

`preview` builds the marketing site + both SPAs into `dist/` then serves the result via `wrangler dev --env production`, which picks up the `[env.production]` block in `wrangler.toml`. Use this when you want to verify production routing, asset paths, or anything else that differs between dev and prod.

> **Note:** `dev:worker` serves `public/` directly, but `preview` serves the built `dist/` copy. After editing files in `public/`, run `npm run build` (or `build:all`) before previewing, or your changes won't appear.

### Try the admin dashboard

```bash
# Create an admin account (one-time; idempotent on conflict):
npm run admin:create -- admin@bdmso.org admin1234

# Start the admin dev server (vite + wrangler dev together):
npm run dev:admin

# Open http://localhost:5174 and sign in with the credentials above.
```

The login flow `POST`s to `/api/login`, role-gates on `role='admin'`, stores the bearer token in `localStorage`, then calls `GET /api/admin/health` to confirm the admin namespace works end-to-end.

To create more admins, re-run `admin:create` with a different email. To demote an admin back to a guardian:

```bash
wrangler d1 execute bdmso --local --command "UPDATE guardian_accounts SET role='guardian' WHERE email='admin@bdmso.org';"
```

### Seed test data

```bash
npm run demo:user            # create a demo guardian account
npm run seed:registrations   # add sample registrations
```

### Blog post watcher

Whenever `npm run dev:worker` (or `dev:guardian` / `dev:admin`) is running, edits to any `.md` in `public/posts/` regenerate `posts/index.json` and per-post HTML in the background via `scripts/build.mjs --watch`.

---

## Build commands

| Command | What it does |
|---|---|
| `npm run build` | Regenerates `posts/index.json`, generated `/programs/*` pages and `program-options-data.js`, copies `public/` → `dist/`, writes `sitemap.xml` + `robots.txt`. |
| `npm run build:apps` | Builds the guardian and admin SPAs into `dist/dashboard/` and `dist/admin/`. |
| `npm run build:all` | Runs both of the above. Required before `preview` or `cf:deploy`. |
| `npm run clean` | Removes `dist/` and `apps/*/dist`. |

Set `SITE_URL` in `.env` (copy from `.env.example`) so the sitemap gets the correct URLs.

---

## Deployment

There are two supported deploy paths. **GitHub -> Cloudflare** is the default and runs unattended. **Manual** is for emergency overrides from a developer laptop.

### GitHub -> Cloudflare (recommended)

The Cloudflare dashboard's "Connect to Git" integration builds and deploys on every push to `main`. The configuration lives in two places:

- `wrangler.toml` (committed) - bindings, observability, and the `[env.production]` overrides
- Cloudflare dashboard -> Workers & Pages -> `bdmso` -> Settings -> Variables and Secrets - everything sensitive

One-time setup:

1. In the Cloudflare dashboard, connect this repository.
2. Set the **build command** to `npm run build:all`.
3. Set the **deploy command** to `npx wrangler deploy --env production`.
4. Add the following **secrets** (Variables and Secrets -> "Add variable" -> type "Secret"):
   - `SHURJOPAY_USERNAME`
   - `SHURJOPAY_PASSWORD`
   - `SHURJOPAY_PREFIX`
   - `BREVO_API_KEY`
   - `EMAIL_FROM`
5. Add the following **build environment variables** (plain, not secret):
   - `SITE_URL` (e.g. `https://bdmso.org`)
6. Push to `main`. CF pulls the repo, runs the build command, then `wrangler deploy --env production` using `wrangler.toml`.

Secrets are NEVER stored in `wrangler.toml`, `.env`, or the repo. The dashboard's "Variables and Secrets" panel is the source of truth for production.

### Manual deploy (laptop)

```bash
npm run cf:deploy
```

Runs `build:all` then `wrangler deploy --env production` using the committed `wrangler.toml`. The first manual deploy from a new laptop will need the same secrets set via `wrangler secret put NAME --env production`.

---

## First-time Cloudflare Setup

1. Create the D1 database:

```bash
npm exec -- wrangler d1 create bdmso
```

2. Copy the returned `database_id` UUID into `wrangler.toml` - both the default `[[d1_databases]]` block (for local dev) and the `[[env.production.d1_databases]]` block (for prod). The committed file already carries the BdMSO project's IDs; only update if you're forking against a different CF account.

3. Apply the schema to the remote DB (idempotent - safe to re-run):

```bash
npm exec -- wrangler d1 execute bdmso --env production --remote --file=./db/schema.sql
```

4. Apply the production-safe seeds (the staff/partner coupon; `seed-dev.sql` should NEVER be run against `--remote`):

```bash
npm exec -- wrangler d1 execute bdmso --env production --remote --file=./db/seed-prod.sql
```

5. Create the R2 bucket for dashboard image uploads:

```bash
npm exec -- wrangler r2 bucket create bdmso-assets
```

6. Set production secrets. **Preferred path:** add them via the Cloudflare dashboard (Workers & Pages -> `bdmso` -> Settings -> Variables and Secrets -> "Add variable" -> type "Secret"). That way GitHub-triggered deploys pick them up automatically and no one's laptop ever needs them. The dashboard accepts the same names listed in the "GitHub -> Cloudflare" section above.

If you must set them from a laptop instead, use:

```bash
npm exec -- wrangler secret put SHURJOPAY_USERNAME --env production
npm exec -- wrangler secret put SHURJOPAY_PASSWORD --env production
npm exec -- wrangler secret put SHURJOPAY_PREFIX   --env production
npm exec -- wrangler secret put BREVO_API_KEY      --env production
npm exec -- wrangler secret put EMAIL_FROM         --env production
```

`SHURJOPAY_SANDBOX` and `ENVIRONMENT` are plain vars in `wrangler.toml`'s `[env.production.vars]` block (set to `"false"` and `"production"` respectively). Override either from the dashboard's "Variables" panel if you ever need a temporary swap without re-deploying. `wrangler.toml` is committed; `wrangler.local.toml` is gitignored for personal forks.

8. Deploy:

```bash
npm run cf:deploy
```

The Worker is created on the first deploy and serves at `bdmso.<your-subdomain>.workers.dev`. Subsequent deploys just push updates.

---

## Database Tables

| Table | Purpose |
|---|---|
| `guardian_accounts` | Parent/guardian login credentials and role (`guardian` / `admin`) |
| `sessions` | Bearer-token login sessions |
| `email_verification_tokens` | Email verification token store |
| `password_reset_tokens` | Password reset tokens (single-use, 1-hour TTL) |
| `login_attempts` | Login rate-limiting and lockout tracking (5 fails / 15 min per email) |
| `action_attempts` | Generic rate-limit log for payment, registration, sponsorship, password reset, and admin endpoints |
| `registrations` | Student registration submissions (one row per program enrollment) |
| `payments` | ShurjoPay payment attempts and outcomes (supports `initial` and `option-upgrade` purpose types) |
| `shurjopay_token_cache` | Cached ShurjoPay auth tokens |
| `coupons` | Discount codes (percent or fixed value, usage limits) |
| `member_id_class_seq` | Per-year/class counter for minting `BdMSO…` student IDs |
| `sponsorship_enquiries` | Sponsorship contact form leads |
| `admin_audit_log` | Audit trail of admin dashboard actions (and admin login/logout) |
| `registration_option_changes` | History of guardian-initiated option edits (subject swaps, mock test session changes) |
| `programs`, `posts` | Content tables managed via the admin dashboard |

Passwords are PBKDF2-SHA256 hashed at 100,000 iterations (Cloudflare Workers max) with per-account random salts; stale hashes are opportunistically upgraded on login. Sessions use cryptographically-random Bearer tokens stored server-side in D1. A `BdMSO…` ID is minted on a student's first paid registration and reused across all of that guardian's enrollments.

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| `/api/login` | 5 failures | 15 min | Per email |
| `/api/create-payment` | 5 requests | 15 min | Per account |
| `/api/submit-registration` | 5 requests | 24 hours | Per IP |
| `/api/submit-sponsorship` | 3 requests | 1 hour | Per IP |
| `/api/forgot-password` | 10 requests | 15 min | Per IP |
| `/api/reset-password` | 10 requests | 15 min | Per IP |
| `/api/admin/*` | 200 requests | 15 min | Per IP

### Enrollment Edits (Guardian Dashboard)

Once registered, guardians can change their own enrollment from a single **Edit enrollment** modal on each card. The modal renders only the sections that apply to that program:

| Program | Options section | Subject section | Venue section |
|---|---|---|---|
| National Olympiad | radio: Math / Science / Both | Math / Science / Both (tiebreaker hint, only meaningful if Options = Both) | Dhaka / Chittagong / Rangpur / Sylhet |
| Quiz Competition | – | – | Dhaka / Chittagong / Rangpur / Sylhet |
| Prep Course | radio subjects | – | – |
| Mock Test | checkbox sessions | – | – |

**One window per program**: while today ≤ `registrationEnds` the Edit pill is visible on the card and the server accepts the writes; once the date passes, the affordance disappears and the corresponding endpoints return 409.

Submit paths:

- **Same-price option swap** or **downgrade** (no refund) -> `PATCH /api/me/registrations/:id/options`. A downgrade requires `acknowledge_no_refund: true`.
- **Option upgrade** (selecting a more expensive option) -> `POST /api/me/registrations/:id/options/upgrade` creates a top-up ShurjoPay payment for the delta. The original registration stays `paid`; the new option commits only on successful gateway callback. A partial unique index on `payments` prevents two concurrent upgrade payments per registration.
- **Subject / venue** -> `PATCH /api/me/registrations/:id` with `preferred_subject` and/or `preferred_venue`. Same window-check rule. The modal posts both calls when meta and options changed together (meta first, so it persists before any redirect to the gateway).

Each option change is recorded in `registration_option_changes` for auditability. After a paid edit (same-price swap, downgrade, or successful upgrade) an updated receipt is emailed — the template mirrors the printable receipt design (logo + receipt number header, hero amount block, Payment Details + Registration cards, Total Paid summary, no QR until that endpoint is built).

The Profile page handles only account-wide student details (name, dob, class, gender, curriculum, school, district) and is always editable. Per-program meta lives on the dashboard cards. Server-side `EDITABLE_REG_FIELDS` is split into `BULK_EDITABLE_REG_FIELDS` (universal, accepted by `PATCH /api/me/registrations`) and `ROW_ONLY_REG_FIELDS` (`preferred_subject`, `preferred_venue`, accepted only by the per-row PATCH) so the Profile bulk endpoint can't bypass the window check.

#### Duplicate-option prevention

A guardian can't book the same Mock Test session twice across separate registrations. The guard is enforced in three places:

- **Public registration form** (`/registration?program=mock-test`): when a signed-in guardian opens the form, `loadTakenOptions()` fetches `/api/me` and disables option items already held by another non-cancelled registration of the same program. Anonymous users see all options; the server catches them on submit.
- **Server**: `handleAddEnrollment` and the change-selection routes (`PATCH /options`, `POST /options/upgrade`) all call `getTakenOptionIds()` and refuse a 409 with a human label when overlap is detected.
- **Edit modal**: the dashboard modal disables ids already held by sibling registrations (`unavailableIds` prop), so guardians see the conflict before they hit Save.

Cancelled registrations are intentionally excluded from every overlap check — a cancelled row doesn't permanently lock its slot.

### Guardian Dashboard UX

- **Skeleton loaders** (`DashboardSkeleton`, `ProfileSkeleton`) replace the old "Loading…" flash during `/api/me` fetches. Same layout shells as the real content so data lands in place without a pop. Respects `prefers-reduced-motion`.
- **Post-enrollment focus**: registration / add-enrollment redirects to `/dashboard?focus=<reg-id>`. The dashboard scrolls the matching card into view and runs a brief navy-ring pulse so guardians don't have to hunt for their just-created Pay Now card.
- **Sort order**: `submitted → paid → cancelled` puts payment-due cards at the top, immediately actionable after enrollment.
- **Stat tiles**: `All Enrollments` / `Payment Pending` / `Completed Enrollments` / `Cancelled Enrollments`, each filtering the list below.
- **Single Edit pill** sits in the card header next to the status badge — covers options, subject, and venue. Inline meta lines (Subject / Exam region) are deliberately omitted from the card since the modal exposes them on demand.
- **Notifications** read `registration_ends` + `edit_window_open` per row. The "Payment due" notice now ends with the close date; a new "Edit deadline approaching" / "Edit deadline today" notice fires for paid registrations within 7 days of `registrationEnds`, naming the fields you can still change for that program (subject + exam region for Quiz, options + subject + exam region for Olympiad).

### Security

- Payment callbacks are server-side verified with ShurjoPay before marking paid; gateway-returned amounts are cross-checked against the stored `payments.amount` before flipping the row to `paid` — mismatches are flagged with `gateway_status='AmountMismatch:<n>'` and dropped to `failed`
- Login uses a dummy-hash timing defence to prevent user enumeration
- Forgot-password and forgot-email always return `ok: true` to prevent email/account enumeration
- Email addresses are redacted in Worker logs via `maskEmailForLog`; verify/reset URLs only print in full when `ENVIRONMENT=development`
- All DB queries use parameterized bindings — no string concatenation of user input in SQL
- Admin endpoints are uniformly gated behind `requireRole("admin")`; self-demotion and last-admin removal are blocked. Admin login + logout are audited
- Emails and phones can only be changed after confirming the current password; password changes revoke every other session for the account
- Receipt emails (initial + updated) read the guardian's current `guardian_accounts.full_name` / `email`, not the snapshot stored at registration time — renames in Profile flow through to future receipts
- CSP, HSTS, X-Frame-Options, and X-Content-Type-Options headers are applied to all responses
- `wrangler.toml` is committed and carries `[env.production]` so the Cloudflare dashboard's Git integration can deploy directly. Secrets are never in this file - they live in the dashboard's "Variables and Secrets" panel
- `wrangler.local.toml` is gitignored, for contributors who fork against their own CF account
- `.env` and `.dev.vars` are gitignored - `SITE_URL`, `SHURJOPAY_*`, `BREVO_API_KEY`, `EMAIL_FROM` never enter source control
- `db/seed-dev.sql` and `db/seed-prod.sql` are gitignored — real coupon codes live there, never in source control

---

## Project Structure

```
public/
  css/styles.css          - all styles and design tokens
  js/site.js              - shared nav + footer injection
  js/home.js              - home page data loader
  js/api.js               - fetch helpers for form submissions
  js/registration.js      - multi-step registration form
  js/program-catalog.js   - reads programs-detail.json on static pages
  js/program-options.js   - option-picker logic (Mock Test, Prep subjects)
  js/md.js                - Markdown + frontmatter parser (used by post.html)
  data/                   - JSON content files (edit these for content updates)
  posts/*.md              - blog post content (one per post; frontmatter drives the index)
  posts/index.json        - auto-generated by build; do not edit by hand
  programs/               - per-program detail pages (generated, except bespokePage ones)
  downloads/              - downloadable PDFs and documents, served at /downloads/
  images/                 - logo, photos
  *.html                  - one file per page
apps/
  guardian/               - guardian dashboard SPA (Preact) → builds to dist/dashboard/
    components/ChangeSelectionModal.tsx  - unified enrollment editor: options + subject + venue, sections render conditionally per program
    components/DashboardSkeleton.tsx     - loading-state shell for the dashboard
    components/ProfileSkeleton.tsx       - loading-state shell for /profile
    components/PaymentBanner.tsx         - inline payment status notice + scroll-to-list CTA
  admin/                  - admin dashboard SPA (Preact) → builds to dist/admin/
worker/
  index.js                - Cloudflare Worker entry (Hono app + asset fallback)
  routes/                 - public, guardian, and admin API route handlers
  lib/                    - shared helpers (crypto, email, shurjopay, programs, etc.)
  middleware/             - auth, role-gating, session middleware
db/
  schema.sql              - D1 table definitions (idempotent, structure only - no seed data)
  seed-dev.example.sql    - placeholder for local-only seeds (TESTBDMSO etc.); copy to seed-dev.sql
  seed-prod.example.sql   - placeholder for prod-safe seeds (live pilot coupon); copy to seed-prod.sql
  seed-dev.sql            - LOCAL, gitignored, holds real codes
  seed-prod.sql           - LOCAL, gitignored, applied to both local + prod
wrangler.toml             - committed Wrangler config: default = local dev, [env.production] = CF prod target
wrangler.example.toml     - template for forks running against a different CF account (copy to wrangler.local.toml, fill in IDs)
scripts/
  build.mjs               - generates posts/programs pages, copies public/ → dist/, writes sitemap + robots; supports --watch
  dev.mjs                 - dev orchestrator for `npm run dev:worker`
  dev-guardian.mjs        - dev orchestrator for the guardian SPA
  dev-admin.mjs           - dev orchestrator for the admin SPA
```
