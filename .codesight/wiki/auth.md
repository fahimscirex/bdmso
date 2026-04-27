# Auth

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Auth subsystem handles **2 routes** and touches: auth, cache, email.

## Routes

- `POST` `/api/login` [auth, cache, email] `[inferred]`
  `worker/index.js`
- `POST` `/api/logout` [auth, cache, email] `[inferred]`
  `worker/index.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `worker/index.js`

---
_Back to [overview.md](./overview.md)_