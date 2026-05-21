# Admin

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Admin subsystem handles **25 routes** and touches: auth, db.

## Routes

- `GET` `/admin/health` [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations` [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations/:id` params(id) [auth, db, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/registrations/:id/status` params(id) [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/payments` [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/sponsorships` [auth, db, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/sponsorships/:id/status` params(id) [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/posts` [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/posts/:slug` params(slug) [auth, db, upload]
  `worker/routes/admin.js`
- `POST` `/admin/posts` [auth, db, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/posts/:slug` params(slug) [auth, db, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/posts/:slug` params(slug) [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/programs` [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/programs/:slug` params(slug) [auth, db, upload]
  `worker/routes/admin.js`
- `POST` `/admin/programs` [auth, db, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/programs/:slug` params(slug) [auth, db, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/programs/:slug` params(slug) [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/users` [auth, db, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/users/:id/role` params(id) [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/coupons` [auth, db, upload]
  `worker/routes/admin.js`
- `POST` `/admin/coupons` [auth, db, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/coupons/:code` params(code) [auth, db, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/coupons/:code` params(code) [auth, db, upload]
  `worker/routes/admin.js`
- `POST` `/admin/uploads` [auth, db, upload]
  `worker/routes/admin.js`
- `GET` `/admin/audit` [auth, db, upload]
  `worker/routes/admin.js`

## Related Models

- **admin_audit_log** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/routes/admin.js`

---
_Back to [overview.md](./overview.md)_