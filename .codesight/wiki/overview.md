# bdmso-site — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**bdmso-site** is a javascript project built with raw-http.

## Scale

13 API routes · 10 database models · 2 library files · 1 environment variables

## Subsystems

- **[Auth](./auth.md)** — 2 routes — touches: auth, db, cache, email, payment
- **[Add-enrollment](./add-enrollment.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Create-payment](./create-payment.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Me](./me.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Payment-callback](./payment-callback.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Post](./post.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Resend-verification](./resend-verification.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Submit-registration](./submit-registration.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Submit-sponsorship](./submit-sponsorship.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Validate-coupon](./validate-coupon.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Verify-email](./verify-email.md)** — 1 routes — touches: auth, db, cache, email, payment
- **[Api](./api.md)** — 1 routes — touches: auth, db, cache, email, payment

**Database:** unknown, 10 models — see [database.md](./database.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `public/js/api.js` — imported by **2** files
- `public/js/md.js` — imported by **1** files

---
_Back to [index.md](./index.md) · Generated 2026-05-17_