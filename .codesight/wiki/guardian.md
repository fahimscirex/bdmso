# Guardian

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Guardian subsystem handles **6 routes** and touches: auth, payment.

## Routes

- `GET` `/me/profile` [auth, payment]
  `worker/routes/guardian.js`
- `PATCH` `/me/profile` [auth, payment]
  `worker/routes/guardian.js`
- `PATCH` `/me/registrations/:id` params(id) [auth, payment]
  `worker/routes/guardian.js`
- `POST` `/me/registrations/:id/cancel` params(id) [auth, payment]
  `worker/routes/guardian.js`
- `POST` `/me/change-password` [auth, payment]
  `worker/routes/guardian.js`
- `POST` `/me/revoke-sessions` [auth, payment]
  `worker/routes/guardian.js`

## Related Models

- **guardian_accounts** (10 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/routes/guardian.js`

---
_Back to [overview.md](./overview.md)_