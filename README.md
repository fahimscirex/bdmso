# BdMSO Website

Static marketing site with a Cloudflare Worker backend for form submissions.

## Stack

| Layer | Service |
|---|---|
| Static hosting | Cloudflare Workers (assets) |
| API endpoints | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |

---

## Making Content Edits

Most content on the home page is driven by JSON files in `public/data/`. Edit the relevant file, save, and refresh - no HTML changes needed.

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
{ "name": "Registration", "date": "JAN – FEB 2026" }
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
| Live editing while a dev server is running | `npm run cf:dev` (rebuilds on every `.md` save) or `npm run posts:watch` in a second terminal |

Body content (everything after the frontmatter) is read directly from the `.md` file, so edits to the body show up on reload without re-running anything.

The post is accessible at `post.html?slug=my-post-slug`. Set `featured: "true"` to pin it as the large card on the blog listing and home page widget.

---

### Programs list

**`public/data/programs.json`**

```json
{ "id": "01", "title": "STEM Foundation Program", "description": "Short description." }
```

Add, remove, or reorder objects. The `id` is display-only (shown as the card number).

---

### Hall of Fame / Results

**`public/data/results.json`**

Two sections: `featured` (the three portrait cards) and `stats` (the number strip below).

```json
{
  "name": "Arko Rahman",
  "medal": "gold",
  "medalLabel": "GOLD · IMSO '25",
  "subject": "Mathematics",
  "class": "Class 6",
  "event": "IMSO Malaysia 2025",
  "quote": "Quote from the student.",
  "photoClass": "ph-gold"
}
```

`medal` controls badge colour: `"gold"`, `"silver"`, or `"bronze"`.
`photoClass`: `""`, `"ph-gold"`, or `"ph-navy"`.

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

# Workspace deps (root, apps/, packages/):
pnpm install

# Local secrets:
cp .env.example .env                   # SITE_URL for build output
cp .dev.vars.example .dev.vars         # SHURJOPAY_*, BREVO_API_KEY, EMAIL_FROM (gitignored — never commit)

# Initialise local D1 with the canonical schema (idempotent; safe to re-run):
wrangler d1 execute bdmso --local --file=./db/schema.sql
```

`TESTBDMSO` is seeded by `db/schema.sql` — a 100%-off coupon for local checkout testing (50 uses, all programs).

### Daily dev — pick the workflow

The site has three independent dev surfaces. You'll usually only run one at a time.

| What you're working on | Command | URL |
|---|---|---|
| **Marketing site + Worker API** | `npm run cf:dev` | http://localhost:8787 |
| **Guardian dashboard** (HMR) | `npm run dev:guardian` | http://localhost:5173 |
| **Admin dashboard** (HMR) | `npm run dev:admin` | http://localhost:5174 |
| **Production-like preview** (full integration) | `npm run preview` | http://localhost:8787 |

`dev:guardian` and `dev:admin` each spawn **two** processes: `wrangler dev` (API on :8787) and a Vite dev server (HMR on :5173 or :5174). The Vite server proxies `/api/*` to wrangler so cookies and auth flow naturally during development.

`preview` builds the marketing site + both SPAs into `dist/` then serves the result via `wrangler dev --config wrangler.prod.toml`. Use this when you want to verify production routing, asset paths, or anything else that differs between dev and prod.

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

### Blog post watcher

Whenever `npm run cf:dev` (or `dev:guardian` / `dev:admin`) is running, edits to any `.md` in `public/posts/` regenerate `posts/index.json` and per-post HTML in the background via `scripts/build.mjs --watch`.

---

## Deployment

```bash
npm run build
npm run cf:deploy
```

`build` copies `public/` → `dist/` and generates `robots.txt` + `sitemap.xml`.

Set `SITE_URL` in `.env` (copy from `.env.example`) to get the correct sitemap URL.

---

## First-time Cloudflare Setup

1. Create the D1 database:

```bash
npm exec -- wrangler d1 create bdmso
```

2. Copy the returned `database_id` UUID into `wrangler.toml` and `wrangler.prod.toml` (replacing both `database_id` and `preview_database_id` placeholders if present).

3. Apply the schema and migrations to the remote DB:

```bash
npm exec -- wrangler d1 execute bdmso --remote --config wrangler.prod.toml --file=./db/schema.sql
for f in db/migrations/*.sql; do
  npm exec -- wrangler d1 execute bdmso --remote --config wrangler.prod.toml --file="$f"
done
```

Some migrations may report "duplicate column" - that's expected when `schema.sql` already includes a column the migration also adds. Safe to ignore on a fresh DB.

4. Set production secrets (one-time):

```bash
npm exec -- wrangler secret put SHURJOPAY_USERNAME --config wrangler.prod.toml
npm exec -- wrangler secret put SHURJOPAY_PASSWORD --config wrangler.prod.toml
npm exec -- wrangler secret put SHURJOPAY_PREFIX   --config wrangler.prod.toml
npm exec -- wrangler secret put BREVO_API_KEY      --config wrangler.prod.toml
npm exec -- wrangler secret put EMAIL_FROM         --config wrangler.prod.toml
```

5. Deploy:

```bash
npm run cf:deploy
```

The Worker (named `bdmso` in `wrangler.prod.toml`) is created on the first deploy and serves at `bdmso.<your-subdomain>.workers.dev`. Subsequent deploys just push updates - no recreation needed.

---

## Database Tables

| Table | Purpose |
|---|---|
| `guardian_accounts` | Parent/guardian login credentials and sessions |
| `registrations` | Student registration submissions (one row per program enrollment) |
| `sponsorship_enquiries` | Sponsorship contact form leads |
| `coupons` | Discount codes with percent/fixed value and usage limits |
| `member_id_seq` | Per-year counter for `YY-NNNNN` member IDs (unique per guardian) |

Passwords are PBKDF2-hashed; sessions use Bearer tokens. Member IDs are minted on first paid registration and reused across all of a guardian's enrollments.

---

## Project Structure

```
public/
  css/styles.css          - all styles and design tokens
  css/styles.css          - all styles and design tokens
  js/site.js              - shared nav + footer injection
  js/home.js              - home page data loader
  js/api.js               - fetch helpers for form submissions
  js/registration.js      - multi-step registration form
  js/sponsorship.js       - sponsorship form
  js/md.js                - Markdown + frontmatter parser (used by post.html)
  data/                   - JSON content files (edit these for content updates)
  posts/index.json        - auto-generated by build; do not edit by hand
  posts/*.md              - blog post content files (one per post, frontmatter drives index)
  images/                 - logo, photos
  post.html               - single blog post template (reads ?slug= from URL)
  *.html                  - one file per page
worker/
  index.js                - Cloudflare Worker (API routes + asset fallback)
db/
  schema.sql              - D1 table definitions
scripts/
  build.mjs               - regenerates posts/index.json, copies public/ → dist/, writes sitemap + robots.txt; supports --watch
  dev.mjs                 - dev orchestrator: runs wrangler dev + posts watcher in parallel (used by `npm run cf:dev`)
```
