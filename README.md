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
| `registrationStarts`, `registrationEnds` | ISO dates (`2026-04-01`). Drive the "Open" badge and the "soon" state on the grids. |
| `audience`, `duration`, `outcome`, `eyebrow` | Facts shown in the detail page sidebar. |
| `bespokePage` | `true` means a hand-authored page at `public/programs/<slug>.html` is used as-is; the page generator skips it. Used for custom layouts (e.g. Maryam Mirzakhani School). |
| `description`, `what_youll_do`, `next_steps` | Body content (arrays of strings) for generated detail pages. |
| `options` | Per-cohort choices that carry their own prices - e.g. Mock Test sessions (checkboxes), Prep Course subjects (radio). |

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

# Local secrets:
cp .env.example .env                   # SITE_URL for build output
cp .dev.vars.example .dev.vars         # SHURJOPAY_*, BREVO_API_KEY, EMAIL_FROM (gitignored - never commit)

# Initialise local D1 with the canonical schema (idempotent; safe to re-run):
wrangler d1 execute bdmso --local --file=./db/schema.sql
```

`TESTBDMSO` is seeded by `db/schema.sql` - a 100%-off coupon for local checkout testing (50 uses, all programs).

### Daily dev - pick the workflow

The site has three independent dev surfaces. You'll usually only run one at a time.

| What you're working on | Command | URL |
|---|---|---|
| **Marketing site + Worker API** | `npm run dev:worker` | http://localhost:8787 |
| **Guardian dashboard** (HMR) | `npm run dev:guardian` | http://localhost:5173 |
| **Admin dashboard** (HMR) | `npm run dev:admin` | http://localhost:5174 |
| **Production-like preview** (full integration) | `npm run preview` | http://localhost:8787 |

`dev:guardian` and `dev:admin` each spawn **two** processes: `wrangler dev` (API on :8787) and a Vite dev server (HMR on :5173 or :5174). The Vite server proxies `/api/*` to wrangler so cookies and auth flow naturally during development.

`preview` builds the marketing site + both SPAs into `dist/` then serves the result via `wrangler dev --config wrangler.prod.toml`. Use this when you want to verify production routing, asset paths, or anything else that differs between dev and prod.

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

```bash
npm run cf:deploy
```

This runs `build:all` then `wrangler deploy --config wrangler.prod.toml`.

---

## First-time Cloudflare Setup

1. Create the D1 database:

```bash
npm exec -- wrangler d1 create bdmso
```

2. Copy the returned `database_id` UUID into `wrangler.toml` and `wrangler.prod.toml` (replacing both `database_id` and `preview_database_id`).

3. Apply the schema to the remote DB (idempotent - safe to re-run):

```bash
npm exec -- wrangler d1 execute bdmso --remote --config wrangler.prod.toml --file=./db/schema.sql
```

4. Create the R2 bucket for dashboard image uploads:

```bash
npm exec -- wrangler r2 bucket create bdmso-assets --config wrangler.prod.toml
```

5. Set production secrets (one-time):

```bash
npm exec -- wrangler secret put SHURJOPAY_USERNAME --config wrangler.prod.toml
npm exec -- wrangler secret put SHURJOPAY_PASSWORD --config wrangler.prod.toml
npm exec -- wrangler secret put SHURJOPAY_PREFIX   --config wrangler.prod.toml
npm exec -- wrangler secret put BREVO_API_KEY      --config wrangler.prod.toml
npm exec -- wrangler secret put EMAIL_FROM         --config wrangler.prod.toml
```

`SHURJOPAY_SANDBOX` is a plain var in `wrangler.prod.toml` - set it to `"false"` to hit the production ShurjoPay endpoint.

6. Deploy:

```bash
npm run cf:deploy
```

The Worker (named `bdmso` in `wrangler.prod.toml`) is created on the first deploy and serves at `bdmso.<your-subdomain>.workers.dev`. Subsequent deploys just push updates.

---

## Database Tables

| Table | Purpose |
|---|---|
| `guardian_accounts` | Parent/guardian login credentials and role (`guardian` / `admin`) |
| `sessions` | Bearer-token login sessions |
| `email_verification_tokens` | Email verification token store |
| `login_attempts` | Rate-limiting and lockout tracking |
| `registrations` | Student registration submissions (one row per program enrollment) |
| `payments` | ShurjoPay payment attempts and outcomes |
| `shurjopay_token_cache` | Cached ShurjoPay auth tokens |
| `coupons` | Discount codes (percent or fixed value, usage limits) |
| `member_id_class_seq` | Per-year/class counter for minting `BdMSO…` student IDs |
| `sponsorship_enquiries` | Sponsorship contact form leads |
| `admin_audit_log` | Audit trail of admin dashboard actions |
| `programs`, `posts` | Content tables managed via the admin dashboard |

Passwords are PBKDF2-hashed; sessions use Bearer tokens. A `BdMSO…` ID is minted on a student's first paid registration and reused across all of that guardian's enrollments.

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
  admin/                  - admin dashboard SPA (Preact) → builds to dist/admin/
worker/
  index.js                - Cloudflare Worker entry (Hono app + asset fallback)
  routes/                 - public, guardian, and admin API route handlers
  lib/                    - shared helpers (crypto, email, shurjopay, programs, etc.)
  middleware/             - auth, role-gating, session middleware
db/
  schema.sql              - D1 table definitions (idempotent)
scripts/
  build.mjs               - generates posts/programs pages, copies public/ → dist/, writes sitemap + robots; supports --watch
  dev.mjs                 - dev orchestrator for `npm run dev:worker`
  dev-guardian.mjs        - dev orchestrator for the guardian SPA
  dev-admin.mjs           - dev orchestrator for the admin SPA
```
