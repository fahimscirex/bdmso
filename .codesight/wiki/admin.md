# Admin

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Admin subsystem handles **56 routes** and touches: auth, db, queue, email, payment.

## Routes

- `GET` `/admin/health` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations/:id` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/registrations/:id/status` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/:id/resend-verification` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/:id/resend-receipt` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/payments` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/payments/:id/reverify` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/payments/:id/refund` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/payments/reports` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/sponsorships` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/sponsorships/:id/status` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/users` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/users/:id/role` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/coupons` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/coupons` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/coupons/:code` params(code) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/coupons/:code` params(code) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/uploads` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/audit` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/analytics` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/broadcast/recipients` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/broadcast` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/registrations/:id/notes` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/:id/notes` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/registrations/:id/notes/:noteId` params(id, noteId) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/bulk/remind` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/registrations/bulk/cancel` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/triage` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/triage/snooze` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/triage/dismiss` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/system` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/users/:id/send-password-reset` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/users/:id/force-reverify-email` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/coupons/bulk-generate` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/templates` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/templates` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/templates/:id` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/templates/:id` params(id) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/broadcast/log` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/events` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/events/:event/roster` params(event) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/events/:event/checkin` params(event) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/events/:event/scores` params(event) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/events/:event/scores` params(event) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/events/:event/scores/finalize` params(event) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/posts` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/posts/:slug` params(slug) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/posts` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/posts/:slug` params(slug) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/posts/:slug` params(slug) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/programs` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `GET` `/admin/programs/:slug` params(slug) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `POST` `/admin/programs` [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `PATCH` `/admin/programs/:slug` params(slug) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`
- `DELETE` `/admin/programs/:slug` params(slug) [auth, db, queue, email, payment, upload]
  `worker/routes/admin.js`

## Related Models

- **admin_audit_log** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/routes/admin.js`

---
_Back to [overview.md](./overview.md)_