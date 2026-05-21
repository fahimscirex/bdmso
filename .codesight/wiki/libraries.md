# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**24 library files** across 4 modules

## Worker (13 files)

- `worker/lib/util.js` — jsonResponse, badRequest, redirectTo, createId, parseClassDigit, reserveMemberId, …
- `worker/lib/email.js` — createVerificationToken, parseEmailFrom, sendReceiptEmail, sendSponsorshipNotification, assignMemberIdAndSendReceipt, sendVerificationEmail, …
- `worker/lib/sessions.js` — createSession, verifySession, extractToken, requireAuth, SESSION_TTL_MS
- `worker/lib/validation.js` — normalizeString, requireField, isEmail, isPhoneLike, escapeHtml
- `worker/lib/crypto.js` — toHex, hashPassword, PBKDF2_ITERATIONS_CURRENT, DUMMY_HASH_SALT
- `worker/lib/program-options.js` — programHasOptions, getProgramOptions, validateAndPriceOptions, prepFreeMockSlots
- `worker/lib/shurjopay.js` — getShurjopayConfig, shurjopayGetToken, shurjopayCreatePayment, shurjopayVerify
- `worker/lib/districts.js` — canonicalDistrict, BD_DISTRICTS
- `worker/lib/rate-limit.js` — checkLoginRateLimit, recordLoginAttempt
- `worker/lib/audit-log.js` — recordAudit
- `worker/middleware/requireAuth.js` — requireAuth
- `worker/middleware/requireRole.js` — requireRole
- `worker/middleware/session.js` — sessionMiddleware

## Public (5 files)

- `public/js/md.js` — escHtml, parseFrontmatter, markdownToHtml
- `public/js/api.js` — buildFunctionUrl, postJson
- `public/js/bd-districts.js` — canonicalDistrict, BD_DISTRICTS
- `public/js/program-catalog.js` — loadCatalog, programMaps
- `public/js/program-options.js` — programHasOptions, computeOptionsTotal

## Admin (3 files)

- `apps/admin/src/auth.ts` — getToken, setToken, clearToken
- `apps/admin/src/router.ts` — useRoute, navigate, href
- `apps/admin/src/api.ts` — ApiError, api

## Guardian (3 files)

- `apps/guardian/src/auth.ts` — getSession, setSession, clearSession, syncSessionName, syncHeaderName, getToken, …
- `apps/guardian/src/router.ts` — useRoute, navigate, href
- `apps/guardian/src/api.ts` — ApiError, api

---
_Back to [overview.md](./overview.md)_