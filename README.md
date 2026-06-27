# BdMSO Website

The Bangladesh Mathematics & Science Olympiad website: an Astro-built static marketing site, a guardian dashboard, and an admin dashboard - all served by a single Cloudflare Worker with a D1 database and ShurjoPay payments.

## Stack

| Layer | Service |
|---|---|
| Static site | Astro (`apps/static`), built to `dist/` and served by the Worker |
| API endpoints | Cloudflare Worker (Hono) |
| Database | Cloudflare D1 (SQLite) |
| Image uploads | Repo-backed via the GitHub Contents API (no R2): writes commit to the repo, reads via `raw.githubusercontent` |
| Payments | ShurjoPay v2 |
| Email | Brevo (transactional API) |
| Admin dashboard | React + TypeScript + shadcn/ui SPA (`apps/admin`) → `/admin` |
| Guardian dashboard | Preact + TypeScript SPA (`apps/guardian`) → `/dashboard` |
| Security | Rate limiting, PBKDF2 password hashing, CSP/HSTS headers, parameterized queries |

The repo is a pnpm workspace: `@bdmso/static` (marketing site), `@bdmso/admin`, `@bdmso/guardian`. Shared static assets (images, CSS, downloads) live in repo-root `public/`, which Astro consumes as its `publicDir`.

---

## Making Content Edits

Content is **stored in D1 and edited in the admin dashboard** (`/admin`), not by hand-editing JSON. A materializer (`scripts/materialize.mjs`) renders the D1 rows into Astro content files under `apps/static/src/content/`, and the Astro build turns those into the static site.

```
admin dashboard  →  D1 (source of truth)  →  scripts/materialize.mjs
                                                   ↓
                              apps/static/src/content/{programs,blog,data}/*
                                                   ↓
                                    astro build  →  dist/  (served by Worker)
```

| Content | Admin section | D1 table | Materialized to |
|---|---|---|---|
| Programs | Programs | `programs` | `src/content/programs/<slug>.md` |
| Blog posts | Posts | `posts` | `src/content/blog/<slug>.md` |
| Press / "In the news" | Press | `press_mentions` | `src/content/data/press.json` |
| Hall of Fame ("Faces of Bangladesh" slider) | Hall of Fame | `hall_of_fame_photos` | `src/content/data/halloffame.json` |
| Medalists (`/results`) | Results | `medalists` | `src/content/data/medalists.json` |
| Team | Team | `team_members` | `src/content/data/team.json` |

After editing in the admin dashboard, the static site has to be **rebuilt** to pick up the change:

- **Locally:** `pnpm run dev:one` runs a watcher that re-materializes and rebuilds automatically whenever the local D1 content changes. Or run `pnpm run build:static` manually.
- **In production:** the intended flow is that the Worker commits the materialized files back to the repo via the GitHub Contents API, which triggers a redeploy. This step is still being wired up - until then, content edits land in prod D1 but the live static pages refresh on the next deploy.

> Migration note: a few legacy files still exist during the cutover - `public/posts/*.md` and the old `scripts/build.mjs` path. The Astro content collections in `apps/static/src/content/` are the source the current build reads. Schema for each collection is defined in `apps/static/src/content.config.ts`.

### Programs - field reference

Program frontmatter (in `src/content/programs/<slug>.md`, mirrored from the `programs` table) fans out to the home grid, the `/programs` grid + filter, the per-program detail page, and the prices the API and dashboards use.

| Field | What it does |
|---|---|
| filename | The slug. `lab-day.md` → `/programs/lab-day`. Don't rename once live. |
| `title`, `tagline`, `eyebrow` | Program name, one-line summary, small label. |
| `feeAmount` | Fee in BDT (number), or `null` for "on enquiry". For option-priced programs, the "from" price. |
| `registration` | `true` = open. `false` = closed (detail page shows "Registration closed"; registration page + API reject it). |
| `hidden` | `true` removes the program entirely (no page, no card). |
| `home_order` | String like `"01"` - presence puts it on the home grid, sorted by value. Omit to keep it off the home page. |
| `category` | `beginner` / `advanced` / `residential` - drives the `/programs` filter. |
| `registrationStarts`, `registrationEnds` | ISO dates. Drive the "Open"/"soon" badges AND the per-enrollment edit window (while today ≤ `registrationEnds`, guardians can edit options/subject/venue; after, the server rejects with 409). |
| `startsOn` | ISO date the program begins; shown in the dashboard "Key dates" rail. |
| `audience`, `duration`, `outcome` | Facts in the detail-page sidebar. |
| `pricing_json` | Per-cohort priced choices (e.g. Mock Test sessions = checkboxes, Olympiad/Prep subjects = radio). Shape: `{ selection, choices:[{id,label,note,price}] }`. Guardians can edit their selection in-window (downgrades free, upgrades create a top-up payment). |
| body (Markdown) | The detail page's main content (About / What You'll Get / Program Day), as freeform prose and lists. |

---

### Downloadable files

Drop PDFs/documents into `public/downloads/`. They're copied to `dist/` by the build and served at `/downloads/<filename>`.

### Everything else (page copy, nav, styles)

The marketing pages are Astro components in `apps/static/src/pages/*.astro` with shared pieces in `apps/static/src/{layouts,components}`. Shared CSS/JS/images live in repo-root `public/`.

---

## Local Development

### One-time setup

```bash
corepack enable      # provides pnpm; wrangler is a project dep (run via pnpm exec)
pnpm install         # workspace deps (root + apps/)

# wrangler.toml is committed and points at the project's D1 by default.
# Forking against your own CF account: copy wrangler.example.toml to
# wrangler.local.toml (gitignored), fill in your IDs, run with --config.

# Local secrets (both gitignored - never commit):
cp .env.example .env                # SITE_URL for build output
cp .dev.vars.example .dev.vars      # SHURJOPAY_*, BREVO_API_KEY, EMAIL_FROM, GITHUB_* (dev)

# Initialise local D1 with the schema (idempotent):
pnpm exec wrangler d1 execute bdmso --local --file=./db/schema.sql

# Optional coupon seeds (real codes live in gitignored seed-*.sql files):
cp db/seed-dev.example.sql  db/seed-dev.sql
cp db/seed-prod.example.sql db/seed-prod.sql
pnpm exec wrangler d1 execute bdmso --local --file=./db/seed-dev.sql
pnpm exec wrangler d1 execute bdmso --local --file=./db/seed-prod.sql
```

### Daily dev - pick the workflow

| What you're working on | Command | URL |
|---|---|---|
| **Everything together** (build once, then Worker + static rebuild watcher) | `pnpm run dev:one` | http://localhost:8787 |
| **Admin dashboard** (Vite HMR + Worker) | `pnpm run dev:admin` | http://localhost:5174 |
| **Guardian dashboard** (Vite HMR + Worker) | `pnpm run dev:guardian` | http://localhost:5173 |
| **Marketing site only** (Astro dev server) | `pnpm run dev:static` | http://localhost:4321 |
| **Worker + marketing API** | `pnpm run dev:worker` | http://localhost:8787 |
| **Production-like preview** (built `dist/`, full integration) | `pnpm run preview` | http://localhost:8787 |

- `dev:one` is the recommended single command: it runs `build:all` once, then a Worker on :8787 (using local D1) plus a watcher that re-materializes and rebuilds the static site whenever local D1 content changes, plus a local asset sidecar that stands in for GitHub image commits in dev.
- `dev:admin` / `dev:guardian` each spawn two processes: `wrangler dev` (API on :8787) and a Vite dev server (HMR) that proxies `/api/*` to the Worker so cookies and auth flow naturally.
- `preview` serves the built `dist/`, so run `pnpm run build:all` first after editing source.

### Try the admin dashboard

```bash
# Create an admin account (one-time; idempotent on conflict):
pnpm run admin:create -- admin@bdmso.org admin1234

# Start the admin dev server (Vite + wrangler dev together):
pnpm run dev:admin
# Open http://localhost:5174 and sign in.
```

The login flow `POST`s to `/api/login`, role-gates on `role='admin'`, stores the bearer token, then calls the admin health endpoint to confirm the namespace works end-to-end. To demote an admin back to guardian:

```bash
pnpm exec wrangler d1 execute bdmso --local --command "UPDATE guardian_accounts SET role='guardian' WHERE email='admin@bdmso.org';"
```

### Seed test data

```bash
pnpm run demo:user            # create a demo guardian account
pnpm run seed:registrations   # add sample registrations
```

---

## Build commands

| Command | What it does |
|---|---|
| `pnpm run build:static` | Builds the Astro marketing site into `dist/`. |
| `pnpm run build:admin` | Builds the admin SPA into `dist/admin/`. |
| `pnpm run build:guardian` | Builds the guardian SPA into `dist/dashboard/`. |
| `pnpm run build:apps` | Builds both SPAs (admin + guardian). |
| `pnpm run build:all` | `rm -rf dist` then `build:static` + `build:apps`. Required before `preview` or `cf:deploy`. |
| `pnpm run clean` | Removes `dist/` and `apps/*/dist`. |
| `pnpm test` | Runs the Worker unit tests (`node --test` over `worker/**/*.test.js`). |
| `pnpm typecheck` | Type-checks the admin and guardian SPAs. |

Set `SITE_URL` in `.env` so the build emits correct absolute URLs.

---

## Deployment

Two paths. **GitHub → Cloudflare** is the default and runs unattended. **Manual** is for emergency overrides from a laptop.

### GitHub → Cloudflare (recommended)

Cloudflare's "Connect to Git" integration builds and deploys on every push to the connected branch. Configuration lives in two places:

- `wrangler.toml` (committed) - bindings, observability, and the `[env.production]` overrides
- Cloudflare dashboard → Workers & Pages → `bdmso` → Settings → Variables and Secrets - everything sensitive

One-time setup:

1. In the Cloudflare dashboard, connect this repository.
2. Set the **build command** to `pnpm run build:all`.
3. Set the **deploy command** to `npx wrangler deploy --env production`.
4. Add the following **secrets** (type "Secret"):
   - `SHURJOPAY_USERNAME`, `SHURJOPAY_PASSWORD`, `SHURJOPAY_PREFIX`
   - `BREVO_API_KEY`, `EMAIL_FROM`
   - `GITHUB_TOKEN` (fine-grained PAT with `contents:write` on this repo - powers admin image uploads + content commits)
   - `MAINTENANCE_KEY` (bypass key for maintenance mode)
5. Add **build environment variables** (plain): `SITE_URL` (e.g. `https://bdmso.org`).
6. Push to the connected branch. CF pulls, runs the build command, then `wrangler deploy --env production`.

> **D1 migrations are NOT run by the auto-deploy.** Code ships on push; schema does not. Apply new `db/migrations/00NN_*.sql` files to the production DB **before** the deploy lands, or queries against new columns will break. (See the migrations note below.)

Secrets are NEVER stored in `wrangler.toml`, `.env`, or the repo. The dashboard's "Variables and Secrets" panel is the source of truth for production.

### Manual deploy (laptop)

```bash
pnpm run cf:deploy   # build:all then wrangler deploy --env production
```

The first manual deploy from a new laptop needs the secrets set via `pnpm exec wrangler secret put NAME --env production`.

---

## Database schema & migrations

- `db/schema.sql` is the canonical, idempotent table definitions (structure only - no seed data).
- Schema changes ship as numbered migrations in `db/migrations/00NN_*.sql` **and** are reflected in `db/schema.sql`.
- Apply a migration locally: `pnpm exec wrangler d1 execute bdmso --local --file=./db/migrations/00NN_x.sql`.
- Apply to production: `pnpm exec wrangler d1 execute bdmso-v2 --env production --remote --file=./db/migrations/00NN_x.sql`. The production DB is `bdmso-v2`; the local/default DB is `bdmso` (see `wrangler.toml`).

---

## First-time Cloudflare Setup

1. Create the D1 database: `pnpm exec wrangler d1 create bdmso-v2`.
2. Copy the returned `database_id` into `wrangler.toml`'s `[[env.production.d1_databases]]` block (the committed file already carries the project's IDs; only change for a fork).
3. Apply the schema to the remote DB (idempotent): `pnpm exec wrangler d1 execute bdmso-v2 --env production --remote --file=./db/schema.sql`.
4. Apply the production-safe seeds (never run `seed-dev.sql` against `--remote`): `pnpm exec wrangler d1 execute bdmso-v2 --env production --remote --file=./db/seed-prod.sql`.
5. Set production secrets - preferably via the Cloudflare dashboard (Variables and Secrets → "Add variable" → "Secret"), so GitHub-triggered deploys pick them up. Names match the "GitHub → Cloudflare" list above (`SHURJOPAY_*`, `BREVO_API_KEY`, `EMAIL_FROM`, `GITHUB_TOKEN`, `MAINTENANCE_KEY`). From a laptop instead: `pnpm exec wrangler secret put <NAME> --env production`.
6. Deploy: `pnpm run cf:deploy`.

`SHURJOPAY_SANDBOX` and `ENVIRONMENT` are plain vars in `wrangler.toml`'s `[env.production.vars]` block (`"false"` and `"production"`). Image uploads are repo-backed via the GitHub Contents API, so there is **no R2 bucket to create** - just the `GITHUB_TOKEN` secret plus the `GITHUB_REPO` / `GITHUB_BRANCH` vars.

---

## Database Tables

| Table | Purpose |
|---|---|
| `guardian_accounts` | Parent/guardian + staff login credentials and role (`guardian` / `admin` / `editor` / `mentor`) |
| `sessions` | Bearer-token login sessions |
| `email_verification_tokens` | Email verification token store |
| `password_reset_tokens` | Password reset tokens (single-use, 1-hour TTL) |
| `login_attempts` | Login rate-limiting and lockout tracking (5 fails / 15 min per email) |
| `action_attempts` | Generic rate-limit log for payment, registration, sponsorship, password reset, and admin endpoints |
| `registrations` | Student registration submissions (one row per program enrollment) |
| `payments` | ShurjoPay + manual payment attempts and outcomes (supports `initial` and `option-upgrade` purpose types) |
| `shurjopay_token_cache` | Cached ShurjoPay auth tokens |
| `coupons` | Discount codes (percent or fixed value, usage limits) |
| `member_id_class_seq` | Per-year/class counter for minting `BdMSO…` student IDs |
| `sponsorship_enquiries` | Sponsorship contact form leads |
| `admin_audit_log` | Audit trail of admin dashboard actions (and admin login/logout) |
| `registration_option_changes` | History of guardian-initiated option edits (subject swaps, mock test session changes) |
| `cohorts` | Program "runs" - dates, capacity, price overrides, exam sections, results-publish + public-feature flags |
| `scores` | Per-section exam scores tied to a cohort/event and registration |
| `programs`, `posts`, `press_mentions`, `hall_of_fame_photos`, `medalists`, `team_members` | Content tables managed via the admin dashboard, materialized to the static site |

Passwords are PBKDF2-SHA256 hashed at 100,000 iterations (Cloudflare Workers max) with per-account random salts; stale hashes are opportunistically upgraded on login. Sessions use cryptographically-random Bearer tokens stored server-side in D1. A `BdMSO…` ID is minted on a student's first paid registration and reused across all of that guardian's enrollments.

The full schema (all tables, fields, relations) is generated into `.codesight/schema.md`, and the API route map into `.codesight/routes.md` - both kept locally, not tracked in git.

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| `/api/login` | 5 failures | 15 min | Per email |
| `/api/create-payment` | 5 requests | 15 min | Per account |
| `/api/submit-registration` | 5 requests | 24 hours | Per IP |
| `/api/submit-sponsorship` | 3 requests | 1 hour | Per IP |
| `/api/forgot-password` | 10 requests | 15 min | Per IP |
| `/api/reset-password` | 10 requests | 15 min | Per IP |
| `/api/admin/*` | 200 requests | 15 min | Per IP |

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

- **Same-price option swap** or **downgrade** (no refund) → `PATCH /api/me/registrations/:id/options`. A downgrade requires `acknowledge_no_refund: true`.
- **Option upgrade** (selecting a more expensive option) → `POST /api/me/registrations/:id/options/upgrade` creates a top-up ShurjoPay payment for the delta. The original registration stays `paid`; the new option commits only on successful gateway callback. A partial unique index on `payments` prevents two concurrent upgrade payments per registration.
- **Subject / venue** → `PATCH /api/me/registrations/:id` with `preferred_subject` and/or `preferred_venue`. Same window-check rule. The modal posts both calls when meta and options changed together (meta first, so it persists before any redirect to the gateway).

Each option change is recorded in `registration_option_changes` for auditability. After a paid edit (same-price swap, downgrade, or successful upgrade) an updated receipt is emailed - the template mirrors the printable receipt design.

The Profile page handles only account-wide student details (name, dob, class, gender, curriculum, school, district) and is always editable. Per-program meta lives on the dashboard cards. Server-side `EDITABLE_REG_FIELDS` is split into `BULK_EDITABLE_REG_FIELDS` (universal, accepted by `PATCH /api/me/registrations`) and `ROW_ONLY_REG_FIELDS` (`preferred_subject`, `preferred_venue`, accepted only by the per-row PATCH) so the Profile bulk endpoint can't bypass the window check.

#### Duplicate-option prevention

A guardian can't book the same Mock Test session twice across separate registrations. The guard is enforced in three places:

- **Public registration form** (`/registration?program=mock-test`): when a signed-in guardian opens the form, `loadTakenOptions()` fetches `/api/me` and disables option items already held by another non-cancelled registration of the same program. Anonymous users see all options; the server catches them on submit.
- **Server**: `handleAddEnrollment` and the change-selection routes (`PATCH /options`, `POST /options/upgrade`) all call `getTakenOptionIds()` and refuse a 409 with a human label when overlap is detected.
- **Edit modal**: the dashboard modal disables ids already held by sibling registrations (`unavailableIds` prop), so guardians see the conflict before they hit Save.

Cancelled registrations are intentionally excluded from every overlap check - a cancelled row doesn't permanently lock its slot.

### Security

- Payment callbacks are server-side verified with ShurjoPay before marking paid; gateway-returned amounts are cross-checked against the stored `payments.amount` before flipping the row to `paid` - mismatches are flagged with `gateway_status='AmountMismatch:<n>'` and dropped to `failed`. A scheduled job (`worker/lib/reconcile.js`, every 30 min in prod) recovers payments where the browser redirect/IPN broke.
- Login uses a dummy-hash timing defence to prevent user enumeration.
- Forgot-password and forgot-email always return `ok: true` to prevent email/account enumeration.
- Email addresses are redacted in Worker logs via `maskEmailForLog`; verify/reset URLs only print in full when `ENVIRONMENT=development`.
- All DB queries use parameterized bindings - no string concatenation of user input in SQL.
- Admin endpoints are uniformly gated behind `requireRole("admin")`; self-demotion and last-admin removal are blocked. Admin login + logout are audited.
- Emails and phones can only be changed after confirming the current password; password changes revoke every other session for the account.
- Receipt emails read the guardian's current `guardian_accounts.full_name` / `email`, not the snapshot stored at registration time.
- CSP, HSTS, X-Frame-Options, and X-Content-Type-Options headers are applied to all responses.
- `wrangler.toml` is committed (carries `[env.production]` for the dashboard's Git integration); secrets live only in the dashboard's "Variables and Secrets" panel. `wrangler.local.toml`, `.env`, `.dev.vars`, and `db/seed-*.sql` are gitignored - no secrets or real coupon codes in source control.

---

## Project Structure

```
public/                     - static assets served as-is (Astro publicDir)
  css/ js/ images/          - shared styles, scripts, media
  downloads/                - PDFs/documents, served at /downloads/
  posts/                    - legacy blog markdown (being retired; see content.config.ts)
apps/
  static/                   - Astro marketing site → builds into dist/
    src/pages/*.astro       - one file per marketing page (index, programs, blog, results, ...)
    src/content/            - content collections (source the build reads)
      programs/*.md         - one program per file (frontmatter + body)
      blog/*.md             - blog posts
      data/*.json           - press, halloffame, medalists, team (materialized from D1)
    src/content.config.ts   - collection schemas
    src/{layouts,components,lib}/
  admin/                    - admin dashboard SPA (React + shadcn/ui) → dist/admin/
  guardian/                 - guardian dashboard SPA (Preact) → dist/dashboard/
worker/
  index.js                  - Cloudflare Worker entry (Hono app + asset fallback + scheduled())
  routes/                   - public.js, guardian.js, admin.js API handlers
  lib/                      - shared helpers (crypto, email, shurjopay, reconcile, repoAssets, programs, ...)
  middleware/               - auth, role-gating, session middleware
db/
  schema.sql                - canonical table definitions (structure only)
  migrations/00NN_*.sql     - numbered schema migrations
  seed-*.example.sql        - seed templates (copy to gitignored seed-*.sql with real codes)
scripts/
  materialize.mjs           - render D1 content → apps/static/src/content/
  dev-one.mjs / dev-all.mjs / dev-*.mjs  - dev orchestrators
  create-admin.mjs          - admin:create
  dev-rebuild.mjs           - local watcher: re-materialize + rebuild static on D1 change
  dev-asset-sink.mjs        - local stand-in for GitHub image commits in dev
wrangler.toml               - committed Wrangler config: default = local dev (bdmso), [env.production] = prod (bdmso-v2)
wrangler.example.toml       - template for forks (copy to wrangler.local.toml, fill in IDs)
```
