# bdmso-site — Wiki

_Generated 2026-05-26 — re-run `npx codesight --wiki` if the codebase has changed._

Structural map compiled from source code via AST. No LLM — deterministic, 200ms.

> **How to use safely:** These articles tell you WHERE things live and WHAT exists. They do not show full implementation logic. Always read the actual source files before implementing new features or making changes. Never infer how a function works from the wiki alone.

## Articles

- [Overview](./overview.md)
- [Database](./database.md)
- [Auth](./auth.md)
- [Add-enrollment](./add-enrollment.md)
- [Admin](./admin.md)
- [Create-payment](./create-payment.md)
- [Forgot-email](./forgot-email.md)
- [Forgot-password](./forgot-password.md)
- [Guardian](./guardian.md)
- [Me](./me.md)
- [Payment-callback](./payment-callback.md)
- [Resend-verification](./resend-verification.md)
- [Reset-password](./reset-password.md)
- [Submit-registration](./submit-registration.md)
- [Submit-sponsorship](./submit-sponsorship.md)
- [Validate-coupon](./validate-coupon.md)
- [Verify-email](./verify-email.md)
- [Ui](./ui.md)
- [Libraries](./libraries.md)

## Quick Stats

- Routes: **43**
- Models: **16**
- Components: **27**
- Env vars: **2** required, **1** with defaults

## How to Use

- **New session:** read `index.md` (this file) for orientation — WHERE things are
- **Architecture question:** read `overview.md` (~500 tokens)
- **Domain question:** read the relevant article, then **read those source files**
- **Database question:** read `database.md`, then read the actual schema files
- **Library question:** read `libraries.md`, then read the listed source files
- **Before implementing anything:** read the source files listed in the article
- **Full source context:** read `.codesight/CODESIGHT.md`

## What the Wiki Does Not Cover

These exist in your codebase but are **not** reflected in wiki articles:
- Routes registered dynamically at runtime (loops, plugin factories, `app.use(dynamicRouter)`)
- Internal routes from npm packages (e.g. Better Auth's built-in `/api/auth/*` endpoints)
- WebSocket and SSE handlers
- Raw SQL tables not declared through an ORM
- Computed or virtual fields absent from schema declarations
- TypeScript types that are not actual database columns
- Routes marked `[inferred]` were detected via regex and may have lower precision
- gRPC, tRPC, and GraphQL resolvers may be partially captured

When in doubt, search the source. The wiki is a starting point, not a complete inventory.

---
_Last compiled: 2026-05-26 · 20 articles · [codesight](https://github.com/Houseofmvps/codesight)_