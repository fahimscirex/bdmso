# bdmso-site — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**bdmso-site** is a typescript project built with hono, organized as a monorepo.

**Workspaces:** `@bdmso/admin` (`apps/admin`), `@bdmso/guardian` (`apps/guardian`), `@bdmso/static` (`apps/static`), `dash` (`dash`)

## Scale

80 API routes · 22 database models · 37 UI components · 26 library files · 25 middleware layers · 3 environment variables

## Subsystems

- **[Auth](./auth.md)** — 2 routes — touches: auth, db, cache, email, upload
- **[Add-enrollment](./add-enrollment.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Admin](./admin.md)** — 56 routes — touches: auth, db, queue, email, payment
- **[Catalog](./catalog.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Create-payment](./create-payment.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Forgot-email](./forgot-email.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Forgot-password](./forgot-password.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Guardian](./guardian.md)** — 9 routes — touches: auth, payment
- **[Me](./me.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Payment-callback](./payment-callback.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Resend-verification](./resend-verification.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Reset-password](./reset-password.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Submit-registration](./submit-registration.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Submit-sponsorship](./submit-sponsorship.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Validate-coupon](./validate-coupon.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Verify-email](./verify-email.md)** — 1 routes — touches: auth, db, cache, email, upload

**Database:** unknown, 22 models — see [database.md](./database.md)

**UI:** 37 components (react) — see [ui.md](./ui.md)

**Libraries:** 26 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `apps/admin/src/api.ts` — imported by **18** files
- `apps/admin/src/components/Icon.tsx` — imported by **16** files
- `apps/admin/src/router.ts` — imported by **14** files
- `apps/admin/src/components/Skeleton.tsx` — imported by **12** files
- `apps/admin/src/csv.ts` — imported by **5** files
- `apps/guardian/src/auth.ts` — imported by **5** files

## Required Environment Variables

- `VITE_PORT` — `apps/admin/vite.config.ts`
- `WRANGLER_PORT` — `apps/admin/vite.config.ts`

---
_Back to [index.md](./index.md) · Generated 2026-06-01_