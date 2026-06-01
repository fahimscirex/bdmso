# Submit-registration

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Submit-registration subsystem handles **1 routes** and touches: auth, db, cache, email.

## Routes

- `POST` `/submit-registration` [auth, db, cache, email, upload]
  `worker/index.js`

## Related Models

- **registration_option_changes** (5 fields) → [database.md](./database.md)
- **registration_notes** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/index.js`

---
_Back to [overview.md](./overview.md)_