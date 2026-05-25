# Reset-password

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Reset-password subsystem handles **1 routes** and touches: auth, db, cache, email.

## Routes

- `POST` `/reset-password` [auth, db, cache, email, upload]
  `worker/index.js`

## Related Models

- **password_reset_tokens** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/index.js`

---
_Back to [overview.md](./overview.md)_