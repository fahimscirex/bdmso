# bdmso-site — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**bdmso-site** is a javascript project built with raw-http.

## Scale

13 API routes · 9 database models · 1 library files · 1 environment variables

## Subsystems

- **[Auth](./auth.md)** — 2 routes — touches: auth, cache, email
- **[Add-enrollment](./add-enrollment.md)** — 1 routes — touches: auth, cache, email
- **[Create-payment](./create-payment.md)** — 1 routes — touches: auth, cache, email
- **[Me](./me.md)** — 1 routes — touches: auth, cache, email
- **[Payment-callback](./payment-callback.md)** — 1 routes — touches: auth, cache, email
- **[Payment-ipn](./payment-ipn.md)** — 1 routes — touches: auth, cache, email
- **[Resend-verification](./resend-verification.md)** — 1 routes — touches: auth, cache, email
- **[Submit-registration](./submit-registration.md)** — 1 routes — touches: auth, cache, email
- **[Submit-sponsorship](./submit-sponsorship.md)** — 1 routes — touches: auth, cache, email
- **[Validate-coupon](./validate-coupon.md)** — 1 routes — touches: auth, cache, email
- **[Verify-email](./verify-email.md)** — 1 routes — touches: auth, cache, email
- **[Api](./api.md)** — 1 routes — touches: auth, cache, email

**Database:** unknown, 9 models — see [database.md](./database.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `public/js/api.js` — imported by **2** files

---
_Back to [index.md](./index.md) · Generated 2026-05-06_