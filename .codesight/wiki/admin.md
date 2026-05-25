# Admin

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Admin subsystem handles **20 routes** and touches: auth, db, email.

## Routes

- `GET` `/admin/health` [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations` [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations/:id` params(id) [auth, db, email, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/registrations/:id/status` params(id) [auth, db, email, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/:id/resend-verification` params(id) [auth, db, email, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/:id/resend-receipt` params(id) [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/payments` [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/sponsorships` [auth, db, email, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/sponsorships/:id/status` params(id) [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/users` [auth, db, email, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/users/:id/role` params(id) [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/coupons` [auth, db, email, upload]
  `worker/routes/admin.js`
- `POST` `/admin/coupons` [auth, db, email, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/coupons/:code` params(code) [auth, db, email, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/coupons/:code` params(code) [auth, db, email, upload]
  `worker/routes/admin.js`
- `POST` `/admin/uploads` [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/audit` [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/analytics` [auth, db, email, upload]
  `worker/routes/admin.js`
- `GET` `/admin/broadcast/recipients` [auth, db, email, upload]
  `worker/routes/admin.js`
- `POST` `/admin/broadcast` [auth, db, email, upload]
  `worker/routes/admin.js`

## Related Models

- **admin_audit_log** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/routes/admin.js`

---
_Back to [overview.md](./overview.md)_