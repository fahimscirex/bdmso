# bdmso-site — AI Context Map

> **Stack:** hono | none | react | typescript
> **Monorepo:** @bdmso/admin, @bdmso/guardian, dash

> 43 routes | 16 models | 27 components | 25 lib files | 3 env vars | 25 middleware
> **Token savings:** this file is ~4,900 tokens. Without it, AI exploration would cost ~59,900 tokens. **Saves ~55,000 tokens per conversation.**
> **Last scanned:** 2026-05-26 10:52 — re-run after significant changes

---

# Routes

## CRUD Resources

- **`/admin/coupons`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Coupon

## Other Routes

- `POST` `/login` params() [auth, db, cache, email, upload]
- `POST` `/logout` params() [auth, db, cache, email, upload]
- `GET` `/me` params() [auth, db, cache, email, upload]
- `POST` `/submit-registration` params() [auth, db, cache, email, upload]
- `POST` `/add-enrollment` params() [auth, db, cache, email, upload]
- `GET` `/validate-coupon` params() [auth, db, cache, email, upload]
- `POST` `/submit-sponsorship` params() [auth, db, cache, email, upload]
- `POST` `/create-payment` params() [auth, db, cache, email, upload]
- `ALL` `/payment-callback` params() [auth, db, cache, email, upload]
- `GET` `/verify-email` params() [auth, db, cache, email, upload]
- `POST` `/resend-verification` params() [auth, db, cache, email, upload]
- `POST` `/forgot-password` params() [auth, db, cache, email, upload]
- `POST` `/forgot-email` params() [auth, db, cache, email, upload]
- `POST` `/reset-password` params() [auth, db, cache, email, upload]
- `GET` `/admin/health` params() [auth, db, email, upload]
- `GET` `/admin/registrations` params() [auth, db, email, upload]
- `GET` `/admin/registrations/:id` params(id) [auth, db, email, upload]
- `PATCH` `/admin/registrations/:id/status` params(id) [auth, db, email, upload]
- `POST` `/admin/registrations/:id/resend-verification` params(id) [auth, db, email, upload]
- `POST` `/admin/registrations/:id/resend-receipt` params(id) [auth, db, email, upload]
- `GET` `/admin/payments` params() [auth, db, email, upload]
- `GET` `/admin/sponsorships` params() [auth, db, email, upload]
- `PATCH` `/admin/sponsorships/:id/status` params(id) [auth, db, email, upload]
- `GET` `/admin/users` params() [auth, db, email, upload]
- `PATCH` `/admin/users/:id/role` params(id) [auth, db, email, upload]
- `POST` `/admin/uploads` params() [auth, db, email, upload]
- `GET` `/admin/audit` params() [auth, db, email, upload]
- `GET` `/admin/analytics` params() [auth, db, email, upload]
- `GET` `/admin/broadcast/recipients` params() [auth, db, email, upload]
- `POST` `/admin/broadcast` params() [auth, db, email, upload]
- `GET` `/me/profile` params() [auth, payment]
- `PATCH` `/me/profile` params() [auth, payment]
- `PATCH` `/me/registrations` params() [auth, payment]
- `PATCH` `/me/registrations/:id` params(id) [auth, payment]
- `POST` `/me/registrations/:id/cancel` params(id) [auth, payment]
- `PATCH` `/me/registrations/:id/options` params(id) [auth, payment]
- `POST` `/me/registrations/:id/options/upgrade` params(id) [auth, payment]
- `POST` `/me/change-password` params() [auth, payment]
- `POST` `/me/revoke-sessions` params() [auth, payment]

---

# Schema

### guardian_accounts
- id: text (pk)
- email: text (required)
- password_hash: text (required)
- password_salt: text (required)
- password_iterations: integer (required)
- full_name: text (required)
- phone: text
- email_verified: integer (required)
- member_id: text (fk)
- role: text (required)

### email_verification_tokens
- token: text (pk)
- account_id: text (required, fk)
- expires_at: text (required)

### password_reset_tokens
- token: text (pk)
- account_id: text (required, fk)
- expires_at: text (required)
- used: integer (required)

### login_attempts
- id: integer (pk)
- email: text (required)
- success: integer (required)
- attempted_at: text (required)

### action_attempts
- id: integer (pk)
- bucket: text (required)
- attempted_at: text (required)

### registrations
- id: text (pk)
- registration_type: text (required)
- student_full_name: text (required)
- student_date_of_birth: text (required)
- student_class_name: text (required)
- student_gender: text (required)
- student_medium: text
- student_school: text (required)
- student_district: text (required)
- guardian_account_id: text (required, fk)
- guardian_full_name: text (required)
- guardian_relationship: text (required)
- guardian_phone: text (required)
- guardian_email: text (required)
- guardian_address: text (required)
- preferred_venue: text
- preferred_subject: text
- Prep: course subjects

### member_id_class_seq
- year: integer (required)
- class_digit: integer (required)
- next_seq: integer (required)

### sponsorship_enquiries
- id: text (pk)
- organization: text (required)
- contact_person: text (required)
- email: text (required)
- phone: text
- interest: text (required)
- message: text (required)
- status: text (required)
- source_page: text

### sessions
- id: text (pk)
- account_id: text (required, fk)
- expires_at: text (required)

### payments
- id: text (pk)
- registration_id: text (required, fk)
- amount: real (required)
- currency: text (required)
- tran_id: text (unique, fk)

### shurjopay_token_cache
- id: integer (pk)
- token: text (required)
- token_type: text (required)
- store_id: text (required, fk)
- expires_at: text (required)

### coupons
- code: text (pk)
- discount_type: text (required)
- max_uses: integer
- applies_to: text

### admin_audit_log
- id: text (pk)
- account_id: text (required, fk)
- action: text (required)
- payload_json: text

### registration_option_changes
- id: integer (pk)
- registration_id: text (required, fk)
- from_options: text (required)
- to_price: real (required)
- delta: real (required)

### programs
- slug: text (pk)
- title: text (required)
- tagline: text
- cohort: text
- image: text
- venue: text
- audience: text
- subjects_json: text
- rendered: at request time
  routine_json text
- published: integer (required)
- published_at: text
- updated_by: text

### posts
- slug: text (pk)
- title: text (required)
- excerpt: text
- category: text
- author: text
- image: text
- rendered: at request time
  published integer (required)
- featured: integer (required)
- published_at: text

---

# Components

- **App** — `apps/admin/src/App.tsx`
- **ImageField** — props: label, hint, prefix, value, onChange — `apps/admin/src/components/ImageField.tsx`
- **NavShell** — props: currentRoute, userEmail, onSignOut — `apps/admin/src/components/NavShell.tsx`
- **AuditLog** — `apps/admin/src/pages/AuditLog.tsx`
- **Broadcast** — `apps/admin/src/pages/Broadcast.tsx`
- **Coupons** — `apps/admin/src/pages/Coupons.tsx`
- **Dashboard** — `apps/admin/src/pages/Dashboard.tsx`
- **Login** — props: onSignedIn — `apps/admin/src/pages/Login.tsx`
- **Payments** — `apps/admin/src/pages/Payments.tsx`
- **RegistrationDetail** — props: id — `apps/admin/src/pages/RegistrationDetail.tsx`
- **Registrations** — `apps/admin/src/pages/Registrations.tsx`
- **Settings** — `apps/admin/src/pages/Settings.tsx`
- **Sponsorships** — `apps/admin/src/pages/Sponsorships.tsx`
- **Users** — `apps/admin/src/pages/Users.tsx`
- **App** — `apps/guardian/src/App.tsx`
- **ChangeSelectionModal** — props: registrationId, programLabel, paid, config, currentIds, unavailableIds, onClose, onChanged — `apps/guardian/src/components/ChangeSelectionModal.tsx`
- **DashboardSkeleton** — `apps/guardian/src/components/DashboardSkeleton.tsx`
- **Dropdown** — props: value, onChange, options, placeholder, ariaLabel — `apps/guardian/src/components/Dropdown.tsx`
- **NotificationTicker** — `apps/guardian/src/components/NotificationTicker.tsx`
- **PaymentBanner** — `apps/guardian/src/components/PaymentBanner.tsx`
- **ProfileSkeleton** — `apps/guardian/src/components/ProfileSkeleton.tsx`
- **StudentsCardSkeleton** — `apps/guardian/src/components/ProfileSkeleton.tsx`
- **Shell** — props: currentRoute — `apps/guardian/src/components/Shell.tsx`
- **Home** — `apps/guardian/src/pages/Home.tsx`
- **Login** — props: onSignedIn — `apps/guardian/src/pages/Login.tsx`
- **Profile** — `apps/guardian/src/pages/Profile.tsx`
- **App** — `dash/src/App.jsx`

---

# Libraries

- `apps/admin/src/api.ts` — class ApiError, const api
- `apps/admin/src/auth.ts`
  - function getToken: () => string | null
  - function setToken: (token) => void
  - function clearToken: () => void
- `apps/admin/src/csv.ts` — function toCsv: (headers, rows) => string, function downloadCsv: (filename, csv) => void
- `apps/admin/src/router.ts`
  - function useRoute: () => string
  - function navigate: (to) => void
  - function href: (to) => string
- `apps/guardian/src/api.ts` — class ApiError, const api
- `apps/guardian/src/auth.ts`
  - function getSession: () => Session | null
  - function setSession: (s) => void
  - function clearSession: () => void
  - function syncSessionName: (fullName, email) => void
  - function syncHeaderName: (studentFullName) => void
  - function getToken: () => string | null
  - _...2 more_
- `apps/guardian/src/router.ts`
  - function useRoute: () => string
  - function navigate: (to) => void
  - function href: (to) => string
- `public/js/api.js` — function buildFunctionUrl: (name) => void, function postJson: (functionName, payload, token) => void
- `public/js/bd-districts.js` — function canonicalDistrict: (value) => void, const BD_DISTRICTS
- `public/js/md.js`
  - function escHtml: (s) => void
  - function parseFrontmatter: (raw) => void
  - function markdownToHtml: (md) => void
- `public/js/program-catalog.js` — function loadCatalog: () => void, function programMaps: () => void
- `public/js/program-options.js` — function programHasOptions: (slug) => void, function computeOptionsTotal: (slug, ids) => void
- `worker/lib/audit-log.js` — function recordAudit: (env, accountId, action, target) => void
- `worker/lib/crypto.js`
  - function toHex: (buffer) => void
  - function hashPassword: (password, salt, iterations) => void
  - const PBKDF2_ITERATIONS_CURRENT
  - const DUMMY_HASH_SALT
- `worker/lib/districts.js` — function canonicalDistrict: (value) => void, const BD_DISTRICTS
- `worker/lib/email.js`
  - function maskEmailForLog: (email) => void
  - function maskTokenForLog: (token) => void
  - function createVerificationToken: (env, accountId) => void
  - function createPasswordResetToken: (env, accountId) => void
  - function parseEmailFrom: (raw) => void
  - function sendReceiptEmail: (env, reg, memberId, baseUrl, extras) => void
  - _...8 more_
- `worker/lib/program-options.js`
  - function programHasOptions: (slug) => void
  - function getProgramOptions: (slug) => void
  - function getProgram: (slug) => void
  - function getOptionLabels: (slug, ids) => void
  - function priceOptions: (slug, ids) => void
  - function withinEditWindow: (slug, todayISO) => void
  - _...2 more_
- `worker/lib/rate-limit.js`
  - function checkLoginRateLimit: (env, email) => void
  - function recordLoginAttempt: (env, email, success) => void
  - function checkActionRateLimit: (env, bucket, key, limit, windowMs) => void
  - function recordActionAttempt: (env, bucket, key) => void
  - function clientIpFor: (request) => void
- `worker/lib/sessions.js`
  - function createSession: (env, accountId) => void
  - function verifySession: (env, token) => void
  - function extractToken: (request) => void
  - function requireAuth: (request, env) => void
  - const SESSION_TTL_MS
- `worker/lib/shurjopay.js`
  - function getShurjopayConfig: (env) => void
  - function shurjopayGetToken: (config, env) => void
  - function shurjopayCreatePayment: (config, tokenInfo, payload) => void
  - function shurjopayVerify: (config, tokenInfo, spOrderId) => void
- `worker/lib/util.js`
  - function jsonResponse: (body, status) => void
  - function badRequest: (message, status) => void
  - function redirectTo: (url) => void
  - function createId: (prefix) => void
  - function parseClassDigit: (className) => void
  - function reserveMemberId: (env, year, classDigit) => void
  - _...4 more_
- `worker/lib/validation.js`
  - function normalizeString: (value) => void
  - function requireField: (value, label) => void
  - function isEmail: (value) => void
  - function isPhoneLike: (value) => void
  - function escapeHtml: (s) => void
- `worker/middleware/requireAuth.js` — function requireAuth: (c, next) => void
- `worker/middleware/requireRole.js` — function requireRole: (...allowedRoles) => void
- `worker/middleware/session.js` — function sessionMiddleware: (c, next) => void

---

# Config

## Environment Variables

- `SITE_URL` (has default) — .env.example
- `VITE_PORT` **required** — apps/admin/vite.config.ts
- `WRANGLER_PORT` **required** — apps/admin/vite.config.ts

## Config Files

- `.env.example`
- `apps/admin/vite.config.ts`
- `apps/guardian/vite.config.ts`
- `dash/vite.config.js`
- `wrangler.toml`

## Key Dependencies

- hono: ^4.12.19

---

# Middleware

## auth
- auth — `apps/admin/src/auth.ts`
- App — `apps/guardian/src/App.tsx`
- api — `apps/guardian/src/api.ts`
- auth — `apps/guardian/src/auth.ts`
- ChangeSelectionModal — `apps/guardian/src/components/ChangeSelectionModal.tsx`
- Home — `apps/guardian/src/pages/Home.tsx`
- Login — `apps/guardian/src/pages/Login.tsx`
- Profile — `apps/guardian/src/pages/Profile.tsx`
- requireAuth — `worker/middleware/requireAuth.js`
- requireRole — `worker/middleware/requireRole.js`
- session — `worker/middleware/session.js`
- guardian — `worker/routes/guardian.js`
- sessionMiddleware — `worker/routes/admin.js`

## custom
- DashboardSkeleton — `apps/guardian/src/components/DashboardSkeleton.tsx`
- Dropdown — `apps/guardian/src/components/Dropdown.tsx`
- NotificationTicker — `apps/guardian/src/components/NotificationTicker.tsx`
- PaymentBanner — `apps/guardian/src/components/PaymentBanner.tsx`
- ProfileSkeleton — `apps/guardian/src/components/ProfileSkeleton.tsx`
- Shell — `apps/guardian/src/components/Shell.tsx`
- main — `apps/guardian/src/main.tsx`
- router — `apps/guardian/src/router.ts`
- vite.config — `apps/guardian/vite.config.ts`
- dev-guardian — `scripts/dev-guardian.mjs`

## validation
- districts — `apps/guardian/src/districts.ts`

## rate-limit
- rate-limit — `worker/lib/rate-limit.js`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `apps/admin/src/api.ts` — imported by **11** files
- `apps/admin/src/router.ts` — imported by **7** files
- `apps/guardian/src/auth.ts` — imported by **5** files
- `apps/guardian/src/api.ts` — imported by **5** files
- `worker/lib/crypto.js` — imported by **5** files
- `worker/lib/util.js` — imported by **5** files
- `apps/admin/src/auth.ts` — imported by **4** files
- `apps/guardian/src/router.ts` — imported by **3** files
- `worker/lib/programs.js` — imported by **3** files
- `worker/lib/audit-log.js` — imported by **3** files
- `worker/lib/email.js` — imported by **3** files
- `apps/admin/src/csv.ts` — imported by **2** files
- `apps/guardian/src/components/NotificationTicker.tsx` — imported by **2** files
- `apps/guardian/src/components/ChangeSelectionModal.tsx` — imported by **2** files
- `public/js/api.js` — imported by **2** files
- `worker/lib/validation.js` — imported by **2** files
- `worker/lib/program-options.js` — imported by **2** files
- `worker/lib/sessions.js` — imported by **2** files
- `worker/middleware/session.js` — imported by **2** files
- `worker/lib/rate-limit.js` — imported by **2** files

## Import Map (who imports what)

- `apps/admin/src/api.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Broadcast.tsx`, `apps/admin/src/pages/Coupons.tsx`, `apps/admin/src/pages/Dashboard.tsx` +6 more
- `apps/admin/src/router.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/components/NavShell.tsx`, `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Dashboard.tsx`, `apps/admin/src/pages/Payments.tsx` +2 more
- `apps/guardian/src/auth.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/api.ts`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `apps/guardian/src/api.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/components/ChangeSelectionModal.tsx`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `worker/lib/crypto.js` ← `scripts/create-admin.mjs`, `scripts/create-demo-user.mjs`, `scripts/seed-registrations.mjs`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `worker/lib/util.js` ← `worker/lib/audit-log.js`, `worker/lib/email.js`, `worker/routes/admin.js`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `apps/admin/src/auth.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/api.ts`, `apps/admin/src/components/ImageField.tsx`, `apps/admin/src/pages/Login.tsx`
- `apps/guardian/src/router.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/components/PaymentBanner.tsx`, `apps/guardian/src/components/Shell.tsx`
- `worker/lib/programs.js` ← `worker/lib/email.js`, `worker/routes/admin.js`, `worker/routes/public.js`
- `worker/lib/audit-log.js` ← `worker/routes/admin.js`, `worker/routes/guardian.js`, `worker/routes/public.js`

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_