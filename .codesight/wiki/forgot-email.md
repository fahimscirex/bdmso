# Forgot-email

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Forgot-email subsystem handles **1 routes** and touches: auth, db, cache, email.

## Routes

- `POST` `/forgot-email` [auth, db, cache, email, upload]
  `worker/index.js`

## Related Models

- **email_verification_tokens** (3 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/index.js`

---
_Back to [overview.md](./overview.md)_