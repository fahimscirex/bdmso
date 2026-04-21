# bdmso-site — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**bdmso-site** is a javascript project built with raw-http.

## Scale

3 API routes · 3 database models · 1 library files · 1 environment variables

## Subsystems

- **[Submit-registration](./submit-registration.md)** — 1 routes — touches: cache
- **[Submit-sponsorship](./submit-sponsorship.md)** — 1 routes — touches: cache
- **[Api](./api.md)** — 1 routes — touches: cache

**Database:** unknown, 3 models — see [database.md](./database.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `public/js/api.js` — imported by **2** files

---
_Back to [index.md](./index.md) · Generated 2026-04-21_