# Submit-sponsorship

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Submit-sponsorship subsystem handles **1 routes** and touches: auth, db, cache, email.

## Routes

- `POST` `/submit-sponsorship` [auth, db, cache, email, upload]
  `worker/index.js`

## Related Models

- **sponsorship_enquiries** (9 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/index.js`

---
_Back to [overview.md](./overview.md)_