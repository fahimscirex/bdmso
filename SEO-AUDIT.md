# SEO Audit · BdMSO

**Date:** 2026-05-09
**Scope:** Full audit of the BdMSO marketing site — both **source code** (`public/`, `worker/`, `scripts/`) and the **live server** (`http://localhost:8787` via `wrangler dev`).
**Methodology:** static inspection of HTML/CSS/JS + Worker config, plus live HTTP probes for headers, redirects, sitemaps, and rendered content.

---

## Executive Summary

The BdMSO site has solid HTML semantics, fast Cloudflare Workers hosting, modern webp images, and strong security headers — but the SEO layer is largely **missing or stubbed**.

- Only the home page has a `<meta name="description">`. The other 12 pages have none.
- **Zero canonical tags, zero Open Graph / Twitter Card tags, zero JSON-LD structured data, zero favicon link** anywhere on the site.
- The blog system serves the **same empty HTML shell for every post** (`<title>Blog - BdMSO</title>`, `<h1>Loading…</h1>`) — search engines and AI crawlers can't index individual posts.
- The build's `sitemap.xml` and `robots.txt` ship with `localhost:8788` URLs because `SITE_URL` isn't set during deploy.
- URL canonicalization redirects (`.html` → no extension) are **307 (temporary)** instead of **301 (permanent)** — equity transfer is weaker, and Google holds the old URLs in its index longer.

**Top 5 priority fixes:**

1. **Pre-render each blog post** at build time. Currently every `?slug=` URL returns identical HTML — critical for blog indexation.
2. **Set `SITE_URL`** in the deploy environment so `robots.txt` + `sitemap.xml` ship with the real domain.
3. **Add unique `<meta name="description">` and `<link rel="canonical">` to every page.**
4. **Switch the `.html` → no-extension redirect from 307 to 301** (worker fix).
5. **Add `EducationalOrganization`, `Event` (IMSO 2026), `FAQPage`, and `BlogPosting` JSON-LD.**

Quick wins also available: meta descriptions can be added today; `loading="lazy"` on offscreen images; better `Cache-Control` headers; favicon set.

---

## What's good

Live-confirmed and source-confirmed:

- **Security headers** are excellent on every response:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  ```
- **Extensionless URLs work** (`/about`, `/team`, `/resources` all return 200).
- **`.html` and trailing-slash variants redirect** to the canonical extensionless form (just need a status-code change — see L3 below).
- **Modern image format** (webp) used everywhere; jpg/png originals removed.
- **`<html lang="en">`** present on every page.
- **HTML semantics** — one `<h1>` per page on most pages, sensible heading hierarchy, semantic `<section>`/`<main>` blocks.
- **ETag + chunked transfer** on every response → conditional revalidation works.
- **Content-Type correct** for HTML, CSS, WebP.

---

## Critical Issues

### C1 · Blog posts: every URL returns the same empty shell

**Evidence (live):**

```bash
$ curl -s "http://localhost:8787/post?slug=stem-foundation-course" | grep -E '<title>|<h1'
<title>Blog - BdMSO</title>
<h1 class="post-title" id="post-title">Loading…</h1>

$ curl -s "http://localhost:8787/post?slug=lab-day-primary-kids" | grep -E '<title>|<h1'
<title>Blog - BdMSO</title>
<h1 class="post-title" id="post-title">Loading…</h1>
```

Both URLs return ETag `1e26ae69598b7d8bdf02371108911470` — byte-identical responses.

**Root cause:** `public/post.html` is a single static file. The title, metadata, and body are fetched via JS at runtime in `public/post.html:122-159` (reads `posts/index.json` for meta, fetches the `.md` for body, renders into the DOM). Per-post URLs use `?slug=…` query parameters; the same file serves all of them.

**Impact:** **Critical.**
- Google can render JavaScript but indexes JS-injected content unreliably. Bing, Yandex, Baidu, and AI crawlers (GPTBot, ClaudeBot, PerplexityBot) typically don't render JavaScript at all → they'll see "Loading…" for every post.
- Google's duplicate-content detection will see identical titles + bodies and consolidate to a single canonical (which it picks at random).
- Query-string URLs (`?slug=…`) are weaker SEO signals than path URLs and are often deduplicated away.
- Social-share previews show nothing useful (no OG tags, no rendered title at the time the crawler visits).

**Fix:**

The build script already parses every post's frontmatter (`scripts/build.mjs:28-55`). Extend it to write one static HTML file per post:

```js
// In scripts/build.mjs, after generateIndex():
const postTemplate = readFileSync(path.join(publicDir, "post.html"), "utf8");
mkdirSync(path.join(distDir, "posts"), { recursive: true });
for (const file of mdFiles) {
  const raw  = readFileSync(path.join(postsDir, file), "utf8");
  const meta = parseFrontmatter(raw);
  if (!meta.slug) continue;
  const body = stripFrontmatter(raw); // small helper
  const html = postTemplate
    .replace("<title>Blog - BdMSO</title>",
             `<title>${escapeHtml(meta.title)} - BdMSO Blog</title>`)
    .replace("</head>",
             [
               `<meta name="description" content="${escapeHtml(meta.excerpt)}">`,
               `<link rel="canonical" href="${siteUrl}/posts/${meta.slug}">`,
               `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
               `<meta property="og:description" content="${escapeHtml(meta.excerpt)}">`,
               `<meta property="og:image" content="${siteUrl}/${meta.image}">`,
               `<meta property="og:type" content="article">`,
               `<script type="application/ld+json">${JSON.stringify({
                 "@context": "https://schema.org",
                 "@type": "BlogPosting",
                 "headline": meta.title,
                 "datePublished": meta.date,
                 "author": { "@type": "Person", "name": meta.author },
                 "image": `${siteUrl}/${meta.image}`,
                 "mainEntityOfPage": `${siteUrl}/posts/${meta.slug}`
               })}</script>`,
               "</head>"
             ].join("\n"));
  writeFileSync(path.join(distDir, "posts", `${meta.slug}.html`), html);
}
```

Then update `js/md.js` to render into the existing shell only when present (it already does), and add a Worker rewrite so `/post?slug=foo` issues a **301 redirect** to `/posts/foo`. Update internal links in `blog.html` and `home.js` to use `/posts/<slug>` directly.

**Priority:** 1.

---

### C2 · Sitemap and robots.txt ship with `localhost:8788`

**Evidence (build artifact):**

```
$ cat dist/sitemap.xml
...
<url><loc>http://localhost:8788/</loc>...</url>
<url><loc>http://localhost:8788/about</loc>...</url>
...

$ cat dist/robots.txt
User-agent: *
Allow: /

Sitemap: http://localhost:8788/sitemap.xml
```

`scripts/build.mjs:63` reads `process.env.SITE_URL?.replace(/\/$/, "") || "http://localhost:8788"`.

**Impact:** **High.** When deployed, the sitemap will list URLs that don't resolve (or point at a localhost the crawler can't reach). Search Console will reject the sitemap.

**Fix:**

```bash
# In .env or your shell before deploy:
export SITE_URL=https://bdmso.org

# Or hard-code in scripts/build.mjs while the domain is fixed:
const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "https://bdmso.org";
```

Also, `robots.txt` and `sitemap.xml` are only written into `dist/`, not `public/`. In dev (`cf:dev` uses `wrangler.toml` → `./public`), both URLs return 404. Either:

- Write them into `public/` instead so both dev and prod serve them, OR
- Accept that dev doesn't surface them and rely on prod for testing.

**Priority:** 1.

---

### C3 · 12 of 13 pages have no `<meta name="description">`

**Evidence (source + live):**

```bash
$ for f in public/*.html; do
    desc=$(grep -oP 'meta name="description"[^>]+' "$f" | head -1)
    printf "%-22s %s\n" "$(basename $f)" "${desc:-(none)}"
  done
about.html             (none)
blog.html              (none)
dashboard.html         (none)
index.html             meta name="description" content="Official qualifying platform..."
login.html             (none)
media.html             (none)
post.html              (none)
programs.html          (none)
registration.html      (none)
resources.html         (none)
results.html           (none)
sponsorship.html       (none)
team.html              (none)
```

**Impact:** **High.** Google falls back to auto-generated descriptions (often the wrong sentence). CTR drops 5-15% compared to a hand-written description.

**Fix:** Add unique 150–160-character descriptions to each page. Suggested copy:

| Page | Suggested description |
|------|------------------------|
| `about.html` | "BdMSO is the official qualifying platform that selects primary-school students from Bangladesh to compete at the International Mathematics & Science Olympiad." |
| `team.html` | "Meet the 2025 Bangladesh delegation, advisors, organizing team, mentors and volunteers behind BdMSO — Bangladesh's national math and science olympiad." |
| `results.html` | "BdMSO 2025 Olympiad results — gold, silver, and bronze medalists in Mathematics and Science across the National Round." |
| `programs.html` | "Year-round STEM, Olympiad prep, lab days, and residential camp programs from BdMSO for primary-school students in Bangladesh." |
| `resources.html` | "Syllabus, regulations, sample questions, and parent guides for the BdMSO National Round and IMSO qualifying pathway." |
| `sponsorship.html` | "Partner with BdMSO 2026 — Title Sponsor, Powered By, and custom partnership opportunities reaching 10,000+ primary students nationwide." |
| `registration.html` | "Register your child for the BdMSO Olympiad or Quiz — official IMSO 2026 qualifying competition for primary-school students." |
| `media.html` | "BdMSO in the news — coverage from The Business Standard, Prothom Alo, Daily ICT News, and Bigganchinta." |
| `blog.html` | "Updates from BdMSO: orientation announcements, lab-day workshops, ACI Medhabi Carnival, and STEM foundation course." |
| `dashboard.html` | (Use `<meta name="robots" content="noindex,follow">` instead — see L8.) |
| `login.html` | (Same — `noindex,follow`.) |
| `post.html` | Generated dynamically per-post (see C1). |

**Priority:** 1.

---

### C4 · No canonical tags anywhere

**Evidence:**

```bash
$ grep -l 'rel="canonical"' public/*.html
(none)
```

**Impact:** **High.** Without a self-referencing canonical, Google can index multiple URL forms (`/about`, `/about.html`, `/about/`, `https://www.bdmso.org/about`, etc.) as separate pages and split link equity. Adding canonicals locks the preferred form.

**Fix:** Add to every page's `<head>`:

```html
<link rel="canonical" href="https://bdmso.org/<page>">
```

Use the page's exact extensionless URL. The 307 redirects (see L3) consolidate URL forms but a canonical tag is the strongest disambiguation signal.

**Priority:** 1.

---

### C5 · No structured data (JSON-LD)

**Evidence:**

```bash
$ grep -rln 'application/ld+json' public/*.html
(none)
```

(Confirmed live too — no `<script type="application/ld+json">` in any rendered response.)

**Impact:** **Medium-High.** No rich-result eligibility (Event, Organization, BreadcrumbList, BlogPosting, FAQ, Person). Lost organic real-estate in SERPs.

**Fix:** Add to `index.html` `<head>`:

```html
<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Bangladesh Mathematics & Science Olympiad",
  "alternateName": "BdMSO",
  "url": "https://bdmso.org",
  "logo": "https://bdmso.org/images/logo.webp",
  "description": "Official qualifying platform to select primary-school students for the International Mathematics and Science Olympiad (IMSO).",
  "parentOrganization": [
    { "@type": "Organization", "name": "Bangladesh Open Source Network", "url": "https://bdosn.org" },
    { "@type": "Organization", "name": "Society for the Popularization of Science, Bangladesh", "url": "https://spsb.org" }
  ],
  "sameAs": [
    "https://www.facebook.com/bdmso",
    "https://www.linkedin.com/company/bdmso"
  ]
}</script>

<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "BdMSO 2026 National Round",
  "startDate": "2026-06-15",
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": { "@type": "Place", "name": "Multiple regional venues, Bangladesh" },
  "organizer": { "@type": "Organization", "name": "BdMSO", "url": "https://bdmso.org" }
}</script>
```

Add `FAQPage` JSON-LD on `/resources` (the FAQ section is already structured as `<details><summary>` — easy to mirror). Add `BlogPosting` per post once C1 is implemented. Add `BreadcrumbList` on inner pages.

**Priority:** 2.

---

## High-Priority Issues

### L3 · Redirect type is 307, not 301

**Evidence (live):**

```bash
$ curl -sI http://localhost:8787/about.html | grep -iE 'HTTP|Location'
HTTP/1.1 307 Temporary Redirect
Location: /about

$ curl -sI http://localhost:8787/about/ | grep -iE 'HTTP|Location'
HTTP/1.1 307 Temporary Redirect
Location: /about
```

Cloudflare's `[assets]` binding emits 307 by default for `.html` and trailing-slash normalization.

**Impact:** **Medium-High.**
- 307 = "the original might come back" — Google retains the old URL in its index for longer.
- 301 transfers ranking signals more cleanly.
- Hyperlinks to `/about.html` from third parties pass weaker equity through a 307.

**Fix:** Add explicit redirect handling in `worker/index.js` before the asset fallback:

```js
// In the main fetch handler, before asset fallback:
if (pathname.endsWith(".html") && pathname !== "/index.html") {
  const target = pathname === "/index.html" ? "/" : pathname.slice(0, -5);
  return Response.redirect(new URL(target, request.url), 301);
}
if (pathname !== "/" && pathname.endsWith("/")) {
  return Response.redirect(new URL(pathname.slice(0, -1), request.url), 301);
}
```

**Priority:** 2.

---

### L4 · 404 page is empty

**Evidence (live):**

```bash
$ curl -s http://localhost:8787/this-does-not-exist | wc -c
0
```

**Impact:** **Medium.** Google may classify a future content change as a soft 404; users hit a blank page; missed opportunity to surface nav.

**Fix:** Create `public/404.html` with eyebrow + "Page not found" + nav links. Wrangler's `[assets]` binding supports:

```toml
[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "404-page"
```

Same in `wrangler.prod.toml` (with `./dist`).

**Priority:** 2.

---

### L5 · Cache-Control too aggressive for static assets

**Evidence (live):**

```bash
$ curl -sI http://localhost:8787/images/logo.webp | grep -i cache
Cache-Control: public, max-age=0, must-revalidate

$ curl -sI http://localhost:8787/css/styles.css | grep -i cache
Cache-Control: public, max-age=0, must-revalidate
```

Every webp and the CSS file revalidate on every request.

**Impact:** **Medium-High** for repeat visitors and Core Web Vitals. ETag means the body isn't re-downloaded, but the round-trip latency is still added. CDN can't cache long either, increasing origin load and cost.

**Fix:** Differentiate cache policy by extension in the worker's asset fallback:

```js
const cacheHeaders = {
  ".html":  "public, max-age=0, s-maxage=300, must-revalidate",
  ".css":   "public, max-age=600",
  ".js":    "public, max-age=600",
  ".webp":  "public, max-age=31536000, immutable",
  ".png":   "public, max-age=31536000, immutable",
  ".jpg":   "public, max-age=31536000, immutable",
  ".woff2": "public, max-age=31536000, immutable",
};
```

Apply via `response.headers.set("Cache-Control", …)` after fetching from `env.ASSETS`.

**Priority:** 2.

---

### S1 · No Open Graph / Twitter Card tags

**Evidence:**

```bash
$ grep -c 'property="og:' public/*.html
(0 across all files)
```

**Impact:** **High** for social-share CTR; **Medium** for ranking. WhatsApp, Facebook, LinkedIn, Slack, Discord all show no preview card.

**Fix:** Add to every page (or to a shared header that's inlined — see S2):

```html
<meta property="og:type" content="website">
<meta property="og:title" content="<page title>">
<meta property="og:description" content="<page description>">
<meta property="og:url" content="https://bdmso.org/<page>">
<meta property="og:image" content="https://bdmso.org/images/group-winner.webp">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="BdMSO">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<page title>">
<meta name="twitter:description" content="<page description>">
<meta name="twitter:image" content="https://bdmso.org/images/group-winner.webp">
```

**Priority:** 2.

---

### S2 · Header and footer injected via JavaScript

**Evidence (source):**

```js
// public/js/site.js:41
//   <img class="brand-logo" src="images/logo.png" ...
// site.js renders the header via document.querySelector("#site-header").innerHTML = …
```

Every HTML page has only `<div id="site-header"></div>` and `<div id="site-footer"></div>` — actual nav/footer content is injected at runtime.

**Impact:** **Medium.** Modern Googlebot renders JS so this isn't catastrophic for Google, but:
- Bingbot, Yandexbot, AI crawlers (GPTBot, ClaudeBot, PerplexityBot) often skip rendering.
- Footer navigation is a major internal-linking lever — not visible to non-render crawlers means link equity doesn't flow.
- Increases Time-to-Interactive on every page load.

**Fix:** Inline the header and footer markup into each HTML file (or have the build script inline them at build time from a partial). Keep `js/site.js` only for active-state styling on the current nav item. The static markup will Just Work for crawlers and humans.

**Priority:** 2.

---

### S3 · Missing alt attributes on 16 images

**Evidence (source):**

```bash
$ grep -E '<img[^>]*src="[^"]*"' public/*.html | grep -v 'alt=' | wc -l
16
```

Examples in `team.html`:

```html
<img src="images/team/nabeeh-hossain.webp" style="position:absolute;...">
```

No `alt` attribute.

**Impact:** **Medium.** Hurts image search ranking, accessibility, and AI surface results.

**Fix:** Add descriptive alt text:

```html
<img src="images/team/nabeeh-hossain.webp" alt="Md Nabeeh Hossain · Bronze, IMSO 2025">
```

Apply to every team portrait, results photo, and inline image. Also add `loading="lazy"` while you're touching them.

**Priority:** 2.

---

### S4 · No favicon, theme-color, or web manifest

**Evidence:**

```bash
$ grep -l 'rel="icon\|rel="shortcut\|theme-color\|manifest' public/*.html
(none)
```

**Impact:** **Low** for ranking, **Medium** for branding/CTR (browser tab shows the default globe icon).

**Fix:** Add to the shared head section:

```html
<link rel="icon" href="/images/logo.webp" type="image/webp">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<meta name="theme-color" content="#0b1b3f">
<link rel="manifest" href="/site.webmanifest">
```

Generate a proper favicon set (16x16, 32x32, 180x180, 512x512) from `images/logo.png` using a tool like https://realfavicongenerator.net/.

**Priority:** 3.

---

### S5 · Multiple H1s and a missing H1

**Evidence:**

```bash
$ for f in public/*.html; do printf "%-22s %d\n" "$(basename $f)" "$(grep -oc '<h1' $f)"; done
dashboard.html         2     ← too many
login.html             0     ← missing
```

**Impact:** **Low-Medium.** Modern Google tolerates multiple H1s but heading hierarchy still matters for accessibility, topic extraction, and AI surface results.

**Fix:**
- `dashboard.html`: demote one of the two H1s to H2.
- `login.html`: add a clear H1 (e.g., "Sign in to BdMSO" or "Guardian portal").

**Priority:** 3.

---

## Medium-Priority Issues

### M1 · `dashboard.html` and `login.html` should be `noindex`

These are auth/account pages. They appear in the sitemap (`scripts/build.mjs:71`) and have no `noindex` directive. Login pages in SERPs dilute brand search and can confuse users.

**Fix:** Add to both pages:

```html
<meta name="robots" content="noindex,follow">
```

Remove them from the sitemap by filtering in `scripts/build.mjs:71`:

```js
const pages = ["", "about", "blog", "media", "programs", "registration", "resources", "results", "sponsorship", "team"];
// Removed: dashboard, login
```

**Priority:** 3.

---

### M2 · URL form ambiguity (`/about` vs `/about.html`)

The build sitemap lists `/about` (extensionless), but internal links throughout `public/*.html` use `href="about.html"` (with extension). The 307 redirect (L3) bridges them, but until canonicals (C4) are added, Google has to figure out which is the preferred URL.

**Fix:** Once C4 (canonicals) and L3 (301 redirects) are in place, this is resolved. Optionally, run a sed sweep to update internal `href="about.html"` → `href="/about"` so users follow direct links instead of redirects.

**Priority:** 3.

---

### M3 · Sitemap missing blog post URLs and quality hints

The sitemap lists 12 static pages. It does not list blog posts. After C1 is implemented (per-post static HTML), the build script should iterate `public/posts/*.md` and emit `<url>` entries. Optionally add `<priority>` and `<changefreq>` for crawl hints:

```xml
<url>
  <loc>https://bdmso.org/</loc>
  <lastmod>2026-05-09</lastmod>
  <changefreq>weekly</changefreq>
  <priority>1.0</priority>
</url>
<url>
  <loc>https://bdmso.org/registration</loc>
  <changefreq>weekly</changefreq>
  <priority>0.9</priority>
</url>
```

**Priority:** 3.

---

### M4 · Internal anchor `target="_blank"` missing `rel="noopener"`

**Evidence (sampled):** External links to `bdosn.org` and `spsb.org` in `public/about.html` have `rel="noopener"` already (good), but inline `target="_blank"` links elsewhere may not.

**Fix:** Audit every `target="_blank"` and ensure `rel="noopener"` (security) and optionally `rel="noopener noreferrer"` (privacy). Most already have it; a sweep to confirm:

```bash
grep -rE 'target="_blank"[^>]*>' public/*.html | grep -v 'noopener'
```

**Priority:** 4.

---

### M5 · Image file sizes still large for some assets

Some webp files are still 2 MB+:

```
public/images/nature_camp.webp   3.0 MB
public/images/winter_camp.webp   2.1 MB
public/images/stem.webp          2.0 MB
```

If any of these land above the fold (e.g., on a hero/cover), they'll hurt Largest Contentful Paint.

**Fix:** Re-encode at lower quality (`magick input.webp -quality 72 output.webp`) or downscale to max 1920px width. Target ≤500 KB per image.

**Priority:** 4.

---

## Low-Priority / Quick Wins

### Q1 · `loading="lazy"` not set on most images

Below-the-fold images (`team.html`, `media.html`, `results.html`) all lack `loading="lazy"`. Adding it improves initial paint with zero downside.

**Fix:** Run a sed sweep:

```bash
sed -i 's|<img src="images/team/|<img loading="lazy" src="images/team/|g' public/team.html
```

(Exclude images that need to be eager-loaded, e.g., the hero image.)

**Priority:** 4.

---

### Q2 · No breadcrumb UI or schema

Inner pages (e.g., `/results` → `/results?year=2025`, individual blog posts) have no visible breadcrumbs and no `BreadcrumbList` JSON-LD.

**Fix:** Add a `<nav aria-label="breadcrumb">` on inner pages with matching JSON-LD. Helps both rendering and AI surface results.

**Priority:** 4.

---

### Q3 · Author info missing structured markup on blog posts

Frontmatter has `author: Samin Yasar Ahmed`, but `post.html` displays it as plain text without `Person` schema or `<a rel="author">`. E-E-A-T signal opportunity.

**Fix:** Once C1 is implemented, add `Person` schema + link author name to a `/team#samin-yasar-ahmed` anchor or LinkedIn profile.

**Priority:** 5.

---

### Q4 · No hreflang scaffolding

Site is English-only but Bangladesh has heavy Bangla search demand for "bdmso", "primary olympiad", etc.

**Fix (today):** Add `<meta name="language" content="English">`. **(Future):** When adding Bangla, use `/bn/` paths with hreflang `en` ↔ `bn` and `x-default` to `en`.

**Priority:** 5 (today), 1 (when adding Bangla).

---

### Q5 · `/posts/index.json` is publicly enumerable

`GET http://localhost:8787/posts/index.json` returns the full post manifest. Not a real SEO issue, but Google may discover and request it unnecessarily. Optional: `Disallow: /posts/index.json` in robots.txt.

**Priority:** 5.

---

## Page-by-Page Summary

| Page | Title | Meta desc | Canonical | OG | H1 | JSON-LD | Notes |
|------|-------|-----------|-----------|----|----|---------|-------|
| `/` (index.html) | ✅ | ✅ | ❌ | ❌ | ✅ (1) | ❌ | Solid title, only page with description. |
| `/about` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add description + canonical. |
| `/blog` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Title clashes with `/post` (both "Blog - BdMSO"). |
| `/dashboard` | ✅ | ❌ | ❌ | ❌ | ⚠️ (2) | ❌ | Should be `noindex`. |
| `/login` | ✅ | ❌ | ❌ | ❌ | ❌ (0) | ❌ | Should be `noindex`. Missing H1. |
| `/media` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add description + canonical. |
| `/post?slug=…` | ❌ | ❌ | ❌ | ❌ | ⚠️ JS | ❌ | **Critical** — every slug is identical (C1). |
| `/programs` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add description + canonical. |
| `/registration` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add description; consider Event schema. |
| `/resources` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Excellent FAQ candidate for FAQPage schema. |
| `/results` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add description + canonical. |
| `/sponsorship` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add description + canonical. |
| `/team` | ✅ | ❌ | ❌ | ❌ | ✅ (1) | ❌ | Add Person schema for delegates. |

---

## Live HTTP Probe Results

```bash
# Home
$ curl -sI http://localhost:8787/
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: public, max-age=0, must-revalidate
ETag: "dcf7ae20105c14a3178194513809f2d0"
CF-Cache-Status: HIT

# Robots & sitemap
$ curl -sI http://localhost:8787/robots.txt
HTTP/1.1 404 Not Found
$ curl -sI http://localhost:8787/sitemap.xml
HTTP/1.1 404 Not Found
# (Both exist in dist/ but dev serves from public/.)

# URL variants
GET /              200
GET /about         200
GET /about.html    307 → /about      ⚠️ should be 301
GET /about/        307 → /about      ⚠️ should be 301
GET /team          200
GET /team.html     307 → /team       ⚠️ should be 301

# Blog post
$ curl -s "http://localhost:8787/post?slug=stem-foundation-course" | grep '<title>'
<title>Blog - BdMSO</title>          ⚠️ same for every slug

# Asset cache headers
$ curl -sI http://localhost:8787/images/logo.webp | grep -i cache
Cache-Control: public, max-age=0, must-revalidate    ⚠️ no caching

# 404 page
$ curl -s http://localhost:8787/this-does-not-exist | wc -c
0                                    ⚠️ empty body

# Security headers (good!)
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

---

## Action Plan

### Critical — ship before the next deploy

1. **Pre-render every blog post** (C1). Update `scripts/build.mjs` to write `dist/posts/<slug>.html` per post, with full meta tags + JSON-LD `BlogPosting`. Add Worker rewrite `/post?slug=foo` → `/posts/foo` (301).
2. **Set `SITE_URL`** in deploy environment (C2). Verify `dist/sitemap.xml` and `dist/robots.txt` ship with `https://bdmso.org`.
3. **Add unique `<meta name="description">` to all 12 missing pages** (C3).
4. **Add `<link rel="canonical">` to every page** (C4).
5. **Add `<meta name="robots" content="noindex,follow">`** to `dashboard.html` and `login.html`; remove them from the sitemap (M1).
6. **Switch `.html` → no-extension redirects from 307 to 301** in `worker/index.js` (L3).
7. **Add a `404.html` page** with helpful nav (L4).

### High-impact — within the week

8. **Add Open Graph + Twitter Card tags** to every page (S1).
9. **Add JSON-LD**: `EducationalOrganization` + `Event` (IMSO 2026, BdMSO 2026 National Round) on `index.html`; `FAQPage` on `/resources` (C5).
10. **Inline header/footer markup** instead of injecting via `js/site.js` (S2). Keep JS only for active-state styling.
11. **Tune `Cache-Control`** by content type in the worker (L5). Major Core Web Vitals win on repeat visits.

### Quick wins

12. Add `alt` attributes to all 16 images (S3).
13. Add favicon, apple-touch-icon, manifest, theme-color (S4).
14. Add `loading="lazy"` to below-the-fold images (Q1).
15. Re-encode the 2 MB+ webp files (M5).
16. Fix multi-H1 / no-H1 issues on `dashboard.html` + `login.html` (S5).

### Long-term

17. URL strategy: pick `/about` form, enforce via 301 + canonicals (M2).
18. Plan Bangla locale with hreflang scaffolding (Q4).
19. Build out content depth on `/programs`, `/about`, `/resources` for keyword coverage.
20. Add `BreadcrumbList` JSON-LD on inner pages (Q2).
21. Add `Person` schema to author bylines (Q3).

---

## What I did NOT check (and you should after deploy)

- **Schema dynamically injected by JavaScript** — `web_fetch` and grep can miss it. Run https://search.google.com/test/rich-results on each live URL after deploy to confirm.
- **Google Search Console coverage report** — needs prod traffic. Submit `sitemap.xml` and review the coverage and enhancements tabs.
- **Core Web Vitals from real users** — needs the site live with `web-vitals` reporting enabled.
- **Backlink profile / domain authority** — outside file-inspection scope. Use Ahrefs / Semrush / Google Search Console "Links" report.
- **Competitor gap analysis** — would need keyword priorities. Suggested seed queries: "primary math olympiad bangladesh", "imso bangladesh", "spsb olympiad", "primary science olympiad", "BdMSO 2026 registration".
- **Real CDN cache behavior** — Cloudflare's edge tier behaves differently from `wrangler dev`.
- **HTTPS / HSTS in prod** — only enforced on the live domain.

---

## Tools & References

- Google Search Console — https://search.google.com/search-console
- Rich Results Test — https://search.google.com/test/rich-results
- PageSpeed Insights — https://pagespeed.web.dev
- Bing Webmaster Tools — https://www.bing.com/webmasters
- Schema validator — https://validator.schema.org
- Mobile-Friendly Test — https://search.google.com/test/mobile-friendly
- Cloudflare `[assets]` config docs — https://developers.cloudflare.com/workers/static-assets/

---

*Audit conducted from `localhost:8787` (`wrangler dev`) plus static inspection of the repo at HEAD. Re-run after the critical fixes ship and you have prod traffic flowing.*
