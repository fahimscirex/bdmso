# Astro Migration Plan (revised)

## Goal

Move the public static site to Astro to kill the layout duplication that
currently spans 16 hand-edited HTML pages, and set up a clean seam for
externalizing content later. Keep the admin and user dashboards in this repo.
Do not redesign the site and do not turn it into an SPA.

Target app structure (end state):

```txt
apps/
  static/   # Astro static website (public marketing site)
  admin/    # admin dashboard (unchanged)
  user/     # current guardian dashboard, renamed (see Rename section)
packages/   # shared utilities/components/config (existing workspace glob)
scripts/
```

## Decisions (and the reasoning behind them)

1. **Astro for the public site only.** It replaces the bespoke `build.mjs`
   generation with components + content collections. Reason: the real pain is
   duplicated header/footer/nav/`<head>` across every page (the font change
   had to touch ~18 files). Astro fixes that at the root.
2. **Admin and user dashboards stay in this repo.** No change.
3. **Content stays in this repo for now.** A separate content repo is deferred
   until there are non-technical editors who must not touch app code. Today
   there is one editor (the maintainer), so the split would add cross-repo
   build coupling and version skew for no real benefit. See Appendix A.
4. **Build the `CONTENT_DIR` seam anyway.** Astro reads content from
   `CONTENT_DIR` with a `./content` fallback. This makes a future repo split a
   `git mv` + clone step instead of a redesign, at near-zero cost now.
5. **Rename is presentation-only.** The dashboard now serves students as well
   as guardians, so "User Dashboard" is the accurate label. Rename visible
   strings and (during the restructure) the app folder/workspace. Do NOT rename
   the data layer. See Rename section.
6. **Cloudflare stays connected to this repo.** No deploy-hook wiring until/if
   the content repo exists.
7. **Slow, incremental migration.** No big-bang commit. Disruptive structural
   work waits until after the registration window closes (after June 20 2026).
   The site is live and load-bearing during registration.
8. **Site stays statically generated.** Not an SPA.

## Current state (audit baseline)

- Static site: `public/` with 16 top-level HTML pages, vanilla JS, one
  `styles.css`. `scripts/build.mjs` already does static generation, SEO
  injection (sentinel regions), sitemap, and font single-sourcing.
- Content already structured and in-repo:
  - Blog: `public/posts/*.md` (6 files, markdown + frontmatter).
  - Programs: `public/data/programs-detail.json`.
  - Other JSON: `media.json`, `news.json`, `results.json`, `stats.json`,
    `steps.json`.
- Dashboards: `apps/admin` (admin) and `apps/guardian` (user-facing, served at
  `/dashboard`). Worker API is Hono on Cloudflare Workers + D1.
- "Guardian" footprint: ~23 code files and 22 references in `db/schema.sql`
  (`guardian_accounts`, `guardian_account_id` FKs, `guardian_full_name`...).
  The data/auth layer is the bulk and is OFF-LIMITS to the rename.

## Rename: Guardian to User (presentation-only)

Rename:

```txt
"Guardian Portal" / "Guardian Dashboard"  ->  "User Dashboard"   (visible labels)
apps/guardian/  ->  apps/user/            (folder + @bdmso/guardian workspace)
```

Do NOT rename (production data / API contracts):

```txt
guardian_accounts, guardian_account_id, guardian_full_name, ... (D1 schema)
auth roles, session contracts
the /dashboard route
```

Accept the split-brain consciously: the UI says "User," the data layer says
"guardian." Document it once in `CLAUDE.md` ("User Dashboard == `guardian_accounts`")
so it does not confuse future work. Do the visible-label rename early (trivial,
safe); fold the folder/workspace rename into the restructure so import churn is
paid once.

## Sequence

### Step 1 - Shared layout as the first Astro slice (highest value)
Stand up `apps/static` as an Astro app. Build `BaseLayout.astro` plus
`Header`, `Footer`, and `NotificationBar` components from the existing HTML/CSS.
Port ONE low-risk leaf page (e.g. `/terms`) behind its current URL and verify
it renders identically. This proves the pipeline and kills duplication at the
root. `build.mjs` and Astro coexist during the port.

Suggested structure:

```txt
apps/static/
  src/
    layouts/BaseLayout.astro
    components/{Header,Footer,NotificationBar,ProgramCard}.astro
    pages/
      index.astro
      blog/[slug].astro
      programs/[slug].astro
    content/config.ts        # content collections + schema (Zod)
  public/
```

Use Astro for routing, layouts, components, markdown rendering, content
collections, SEO metadata, and static HTML generation. Keep vanilla JS as-is.

### Step 2 - Port remaining pages incrementally
Move pages into Astro one at a time, each behind its existing URL, verifying
identical output. Migrate blog (`posts/*.md`) and programs
(`programs-detail.json`) into Astro content collections with schemas. Keep the
other JSON (`news`, `results`, `stats`, `steps`, `media`) as data until each
schema is reviewed. Retire `build.mjs` only when nothing depends on it.

### Step 3 - Content seam (no repo split)
Point Astro content collections at `CONTENT_DIR`:

```js
const contentDir = process.env.CONTENT_DIR || "./content";
```

Keep content in this repo under `content/`. Local dev and CI use the fallback.
No deploy hooks, no second repo.

### Step 4 - Rename (presentation)
Apply the visible-label rename and the `apps/guardian -> apps/user` folder +
workspace rename. Update imports and `pnpm` workspace name. Leave schema/auth/
routes untouched. Add the split-brain note to `CLAUDE.md`.

### Step 5 - Scripts
After the structure settles:

```json
{
  "build:static": "...",
  "build:admin": "...",
  "build:user": "...",
  "build:all": "...",
  "dev:static": "...",
  "dev:admin": "...",
  "dev:user": "..."
}
```

`npm run build` (bare) should print a helpful message rather than building
everything by accident.

## Migration safety rules

- No single massive commit. One reviewable slice at a time.
- Every ported page must render identically behind its existing URL before the
  old version is removed.
- Disruptive structural work lands after the registration window (after
  June 20 2026).
- Never rename database fields, auth roles, or the `/dashboard` route.

## Expected result

- Public site built with Astro, still statically generated, same URLs and look.
- Layout/header/footer/nav defined once.
- Blog/program content schema-validated via content collections.
- A `CONTENT_DIR` seam ready for a future content-repo split.
- Admin and user dashboards unchanged in this repo.
- "User Dashboard" label across the UI; data layer unchanged.

---

## Appendix A - Deferred: separate content repo + admin publishing

Revisit only when there are non-technical editors who should not touch app code.
At that point:

- Move `content/` into `website-content-repo`. Astro already reads `CONTENT_DIR`,
  so the change is `git mv` + a build-time clone.
- Production build clones the content repo into `./content` before
  `build:static`.
- Content repo triggers a Cloudflare Deploy Hook on push:

  ```yaml
  name: Trigger website deploy
  on: { push: { branches: [main] } }
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - run: curl -X POST "$CLOUDFLARE_DEPLOY_HOOK_URL"
          env: { CLOUDFLARE_DEPLOY_HOOK_URL: "${{ secrets.CLOUDFLARE_DEPLOY_HOOK_URL }}" }
  ```

- Later still, the admin dashboard can commit markdown/JSON to the content repo
  via the GitHub API (blog, programs, notification bar first). Add per-section
  editing only after each content schema is stable.

Reasons this is deferred, not dropped: with a single editor it adds cross-repo
build coupling, version skew (which content commit pairs with which app commit),
and local-dev friction, for benefits that only materialize with multiple
editors.
