# Auth

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Auth subsystem handles **2 routes** and touches: auth, db, cache, email.

## Routes

- `POST` `/login` [auth, db, cache, email, upload]
  `worker/index.js`
- `POST` `/logout` [auth, db, cache, email, upload]
  `worker/index.js`

## Middleware

- **auth** (auth) — `apps/admin/src/auth.ts`
- **App** (auth) — `apps/guardian/src/App.tsx`
- **api** (auth) — `apps/guardian/src/api.ts`
- **auth** (auth) — `apps/guardian/src/auth.ts`
- **Home** (auth) — `apps/guardian/src/pages/Home.tsx`
- **Login** (auth) — `apps/guardian/src/pages/Login.tsx`
- **Profile** (auth) — `apps/guardian/src/pages/Profile.tsx`
- **requireAuth** (auth) — `worker/middleware/requireAuth.js`
- **requireRole** (auth) — `worker/middleware/requireRole.js`
- **session** (auth) — `worker/middleware/session.js`
- **guardian** (auth) — `worker/routes/guardian.js`
- **sessionMiddleware** (auth) — `worker/routes/admin.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/index.js`

---
_Back to [overview.md](./overview.md)_