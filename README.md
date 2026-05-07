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
image: images/photo.jpg
---

Write your post content here in standard Markdown.

## Section heading

Paragraphs, **bold**, *italic*, [links](https://example.com), lists, blockquotes all work.
```

**Step 2 - run the build**

```bash
npm run build
```

`posts/index.json` is auto-generated from frontmatter - do not edit it by hand. The post is accessible at `post.html?slug=my-post-slug`. Set `featured: "true"` in frontmatter to pin it as the large card on the blog listing and home page widget.

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

```bash
npm install
cp .env.example .env              # set SITE_URL for build output
cp .dev.vars.example .dev.vars    # fill in BREVO_API_KEY, EMAIL_FROM
npm run dev:local                 # serves public/ with live reload at localhost:3000
```

`.dev.vars` holds local Worker secrets (Brevo, optional SSLCommerz overrides). It is gitignored - never commit it.

To test Worker API endpoints locally:

```bash
npm run build
npx wrangler d1 migrations apply DB --local   # first run only
npm run cf:dev                                # wrangler dev at localhost:8787
```

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

1. Create a D1 database:

```bash
wrangler d1 create bdmso
```

2. Paste the returned IDs into `wrangler.toml`.

3. Apply the schema and migrations:

```bash
wrangler d1 execute bdmso --file=./db/schema.sql
wrangler d1 migrations apply DB --remote
```

4. Set production secrets (one-time):

```bash
wrangler secret put BREVO_API_KEY           --config wrangler.prod.toml
wrangler secret put EMAIL_FROM              --config wrangler.prod.toml
wrangler secret put SSLCOMMERZ_STORE_ID     --config wrangler.prod.toml
wrangler secret put SSLCOMMERZ_STORE_PASSWD --config wrangler.prod.toml
wrangler secret put SSLCOMMERZ_SANDBOX      --config wrangler.prod.toml   # "false" for live
```

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
  build.mjs               - copies public/ → dist/, writes sitemap + robots.txt
```
