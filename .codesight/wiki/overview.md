# bdmso-site — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**bdmso-site** is a typescript project built with hono, organized as a monorepo.

**Workspaces:** `@bdmso/admin` (`apps/admin`), `@bdmso/guardian` (`apps/guardian`), `dash` (`dash`)

## Scale

41 API routes · 14 database models · 23 UI components · 25 library files · 22 middleware layers · 3 environment variables

## Subsystems

- **[Auth](./auth.md)** — 2 routes — touches: auth, db, cache, email, upload
- **[Add-enrollment](./add-enrollment.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Admin](./admin.md)** — 20 routes — touches: auth, db, email, upload
- **[Create-payment](./create-payment.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Forgot-email](./forgot-email.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Forgot-password](./forgot-password.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Guardian](./guardian.md)** — 7 routes — touches: auth, payment
- **[Me](./me.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Payment-callback](./payment-callback.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Resend-verification](./resend-verification.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Reset-password](./reset-password.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Submit-registration](./submit-registration.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Submit-sponsorship](./submit-sponsorship.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Validate-coupon](./validate-coupon.md)** — 1 routes — touches: auth, db, cache, email, upload
- **[Verify-email](./verify-email.md)** — 1 routes — touches: auth, db, cache, email, upload

**Database:** unknown, 14 models — see [database.md](./database.md)

**UI:** 23 components (react) — see [ui.md](./ui.md)

**Libraries:** 25 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `apps/admin/src/api.ts` — imported by **11** files
- `apps/admin/src/router.ts` — imported by **7** files
- `apps/guardian/src/auth.ts` — imported by **5** files
- `worker/lib/crypto.js` — imported by **5** files
- `worker/lib/util.js` — imported by **5** files
- `apps/admin/src/auth.ts` — imported by **4** files

## Required Environment Variables

- `VITE_PORT` — `apps/admin/vite.config.ts`
- `WRANGLER_PORT` — `apps/admin/vite.config.ts`

---
_Back to [index.md](./index.md) · Generated 2026-05-25_