# BdMSO Dashboard — Architecture & Plan

> Source of truth for the dashboard work. Update as decisions evolve.

## Decisions locked in

| Topic | Choice |
|---|---|
| **Public site** | Stays vanilla HTML/CSS/JS — no framework conversion |
| **Dashboard architecture** | Two-faced: `/dashboard` (guardian) + `/admin` (admin), one repo |
| **API layer** | Hono on Workers (migrates `worker/index.js`); shared by both faces |
| **Frontend** | Preact + Vite + TypeScript, one Vite app per face |
| **Server-state lib** | TanStack Query |
| **Forms + validation** | react-hook-form + zod (zod schemas shared with API via Hono validator) |
| **Styling** | Reuse `public/css/styles.css` palette tokens |
| **Posts source of truth** | D1 (migrated from `public/posts/*.md`) — dashboard-editable |
| **Programs source of truth** | D1 |
| **Image uploads** | R2 bucket `bdmso-assets`, subfolders `posts/`, `programs/`, `team/` |
| **Markdown editor** | Markdown-as-source (compatible with existing `md.js` renderer) |
| **TypeScript** | Yes for `apps/*` and `packages/*`; public site stays JS |
| **First admin** | Manual D1 promotion after migration — no seeded account |

## Roles

| Role | Default scope |
|---|---|
| `guardian` | `/dashboard` only — own registrations, payments, profile |
| `admin` | `/dashboard` + full `/admin` |
| `editor` (later) | `/admin` content only — posts, programs |
| `mentor` (later) | `/admin` read-only on students/cohorts |

Start with `guardian` + `admin`. Add others when concretely requested.

## Repo layout (target)

```
worker/
  index.js                 ← Hono app entry; mounts route modules
  routes/
    public.js              ← /api/login, /api/submit-registration, /api/...
    guardian.js            ← /api/me/* (session-gated, any role)
    admin.js               ← /api/admin/* (session + role=admin)
  middleware/
    session.js
    requireRole.js
    auditLog.js
  lib/                     ← bkash, email, password, etc.

apps/
  guardian/                ← Preact + Vite + TS, builds → dist/dashboard/
    src/
      main.tsx
      routes/
      components/
  admin/                   ← Preact + Vite + TS, builds → dist/admin/
    src/
      main.tsx
      routes/
      components/

packages/
  ui/                      ← shared button/input/table primitives
  api-client/              ← typed fetch wrappers + TanStack Query hooks
  schemas/                 ← zod schemas (single source of truth)

public/                    ← marketing site, unchanged
scripts/build.mjs          ← marketing build, unchanged
db/
  schema.sql               ← canonical, idempotent schema (re-applyable)
  migrations/              ← (not created yet — only needed once prod has live data)
```

**Schema policy:** while production has no live data to preserve, `db/schema.sql`
is edited in place and re-applied to wipe-and-recreate the DB. Once production
has real registrations, switch to incremental `db/migrations/<date>-<name>.sql`
files that ALTER existing tables, leaving `schema.sql` as the fresh-install spec.

A **pnpm workspace** ties `apps/*` + `packages/*` together. The Worker serves built dashboard assets via the existing `ASSETS` binding for `/dashboard/*` and `/admin/*` URL prefixes.

## URL & routing contract

```
/                          public marketing
/programs                  public, also reads from D1.programs (post-migration)
/programs/<slug>           public, reads D1.programs.body_md + rendered fields
/posts/<slug>              public, reads D1.posts.body_md
/blog                      public, lists D1.posts where published=1

/dashboard                 guardian SPA (any authed role)
/dashboard/*               guardian SPA routes
/admin                     admin SPA (role=admin or editor/mentor for subsets)
/admin/*                   admin SPA routes
/login                     login page (single endpoint; routes by role)

/api/*                     public endpoints (login, registration, etc.) — unchanged
/api/me/*                  guardian endpoints — session required
/api/admin/*               admin endpoints — session + role middleware
```

## Auth flow

1. User submits `/api/login` with email/password
2. Worker validates, creates session, sets HttpOnly cookie
3. Response includes `role` + redirect hint
4. Client redirects: `admin|editor|mentor` → `/admin`, `guardian` → `/dashboard`
5. Every `/api/admin/*` request runs `requireRole('admin')` middleware

Sessions already exist (`sessions` table). Adding role on top is non-breaking.

## Phased rollout (6 weeks)

| Phase | Week | Deliverable |
|---|---|---|
| **0** | 1 | Workspace skeleton, Hono migration, schema additions (`role`, `admin_audit_log`, `programs`, `posts`), R2 binding, seed admin |
| **1** | 2 | Guardian dashboard: home, my-registrations, payments, profile (read-only first) |
| **2** | 3 | Admin dashboard read-only: home metrics, list screens for all domains |
| **3** | 4 | Posts + Programs CRUD with markdown editor + R2 image upload. Public switches to D1-backed rendering. |
| **4** | 5 | Ops CRUD: registration status, payment reconcile, sponsorship inbox, coupons |
| **5** | 6 | Settings, email log, audit log viewer, optional 2FA. Launch. |

## Open / deferred items

- **Separate prod D1 database** — current `wrangler.prod.toml` shares the dev D1 ID. Split before admin writes go live.
- **Markdown editor choice** — recommend `CodeMirror 6` with markdown mode + live preview (smaller than full WYSIWYGs, edits raw markdown which matches `md.js`).
- **First admin seeding** — deferred. After migration runs, promote manually:
  ```sql
  UPDATE guardian_accounts SET role='admin' WHERE email='your@email';
  ```
- **2FA** — recommend before launch but not blocking.
- **Audit log retention** — append-only, no cleanup planned. Revisit at 100k+ rows.
- **R2 image variants / responsive srcsets** — defer until measured need.

## Future considerations (not in scope now)

- Multi-language (Bangla UI)
- Public student results portal
- Multi-tenant (other olympiads using same platform)
- Mentor portal (separate dashboard face if mentors need more than read access)
