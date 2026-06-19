# bdmso-site — AI Context Map

> **Stack:** hono | none | react | typescript
> **Monorepo:** @bdmso/admin, @bdmso/guardian, @bdmso/static

> 95 routes | 31 models | 66 components | 41 lib files | 4 env vars | 31 middleware
> **Token savings:** this file is ~0 tokens. Without it, AI exploration would cost ~0 tokens. **Saves ~0 tokens per conversation.**
> **Last scanned:** 2026-06-19 05:17 — re-run after significant changes

---

# Routes

## CRUD Resources

- **`/admin/registrations`** GET | GET/:id | PATCH/:id → Registration
- **`/admin/coupons`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Coupon
- **`/admin/registrations/:id/notes`** GET | POST | GET/:id | DELETE/:id → Note
- **`/admin/templates`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Template
- **`/admin/cohorts`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Cohort
- **`/admin/posts`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Post
- **`/admin/programs`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Program

## Other Routes

- `POST` `/login` params() [auth, db, cache, email, upload]
- `POST` `/logout` params() [auth, db, cache, email, upload]
- `GET` `/me` params() [auth, db, cache, email, upload]
- `GET` `/catalog` params() [auth, db, cache, email, upload]
- `POST` `/submit-registration` params() [auth, db, cache, email, upload]
- `POST` `/add-enrollment` params() [auth, db, cache, email, upload]
- `GET` `/validate-coupon` params() [auth, db, cache, email, upload]
- `POST` `/submit-sponsorship` params() [auth, db, cache, email, upload]
- `POST` `/create-payment` params() [auth, db, cache, email, upload]
- `ALL` `/payment-callback` params() [auth, db, cache, email, upload]
- `GET` `/invoice/:registrationId` params(registrationId) [auth, db, cache, email, upload]
- `GET` `/verify-email` params() [auth, db, cache, email, upload]
- `POST` `/resend-verification` params() [auth, db, cache, email, upload]
- `POST` `/forgot-password` params() [auth, db, cache, email, upload]
- `POST` `/forgot-email` params() [auth, db, cache, email, upload]
- `POST` `/reset-password` params() [auth, db, cache, email, upload]
- `GET` `/admin/health` params() [auth, db, cache, queue, email, payment, upload]
- `PATCH` `/admin/registrations/:id/status` params(id) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/registrations/:id/resend-verification` params(id) [auth, db, cache, queue, email, payment, upload]
- `PATCH` `/admin/payments/:id/status` params(id) [auth, db, cache, queue, email, payment, upload]
- `PATCH` `/admin/payments/:id/complete` params(id) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/payments/:id/resend-receipt` params(id) [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/payments` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/payments/:id/reconcile` params(id) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/payments/reconcile-stale` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/payments/reports` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/sponsorships` params() [auth, db, cache, queue, email, payment, upload]
- `PATCH` `/admin/sponsorships/:id/status` params(id) [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/users` params() [auth, db, cache, queue, email, payment, upload]
- `PATCH` `/admin/users/:id/role` params(id) [auth, db, cache, queue, email, payment, upload]
- `PATCH` `/admin/users/:id` params(id) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/uploads` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/audit` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/analytics` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/broadcast/recipients` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/regions` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/broadcast` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/registrations/bulk/remind` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/registrations/bulk/cancel` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/triage` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/triage/snooze` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/triage/dismiss` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/system` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/users/:id/send-password-reset` params(id) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/users/:id/force-reverify-email` params(id) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/coupons/bulk-generate` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/broadcast/log` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/events` params() [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/events/:event/roster` params(event) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/events/:event/checkin` params(event) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/events/:event/scores` params(event) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/events/:event/scores/finalize` params(event) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/events/:event/scores/import` params(event) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/events/:event/publish` params(event) [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/cohorts/:key/feature` params(key) [auth, db, cache, queue, email, payment, upload]
- `GET` `/admin/publish/pending` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/publish` params() [auth, db, cache, queue, email, payment, upload]
- `POST` `/admin/publish/discard` params() [auth, db, cache, queue, email, payment, upload]
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

### press_mentions
- id: integer (pk)
- outlet: text (required)
- title: text (required)
- url: text (required)
- published_on: text
- image: text
- featured: integer (required)
- sort_order: integer (required)
- published: integer (required)
- updated_by: text

### hall_of_fame_photos
- id: integer (pk)
- image: text (required)
- caption: text
- year: text
- sort_order: integer (required)
- published: integer (required)
- updated_by: text

### medalists
- id: integer (pk)
- year: text (required)
- category: text (required)
- medal: text (required)
- name: text (required)
- school: text
- sort_order: integer (required)
- published: integer (required)
- updated_by: text

### team_members
- id: integer (pk)
- section: text (required)
- subgroup: text
- year: text
- name: text (required)
- role: text
- affiliation: text
- image: text
- sort_order: integer (required)
- published: integer (required)
- updated_by: text

### invoice_seq
- year: integer (pk)
- next_seq: integer (required)

### pending_publish
- id: text (pk)
- entity_type: text (required)
- entity_id: text (required, fk)
- action: text (required)
- materialized_content: text
- d1_after_json: text
- status: text (required)
- staged_at: text (required)

### publish_snapshots
- entity_type: text (required)
- entity_id: text (required, fk)
- d1_json: text (required)

### exam_events
- event_key: text (pk)
- label: text (required)
- program_slug: text (required)
- sections: text (required)
- results_published: integer (required)
- published_at: text

### cohorts
- cohort_key: text (pk)
- program_slug: text (required)
- label: text (required)
- status: text (required)
- enroll_opens: text
- enroll_closes: text
- starts_on: text
- ends_on: text
- price_override: integer
- capacity: integer
- sections: text (required)
- results_published: integer (required)
- published_at: text

### registration_notes
- id: integer (pk)
- registration_id: text (required, fk)
- author_account_id: text (required, fk)
- body: text (required)
- _relations_: registration_id -> registrations.id

### triage_state
- id: integer (pk)
- admin_account_id: text (required, fk)
- target_kind: text (required)
- target_id: text (required, fk)
- snoozed_until: text
- _relations_: admin_account_id -> guardian_accounts.id

### email_templates
- id: integer (pk)
- name: text (required)
- subject: text (required)
- body: text (required)
- category: text
- updated_by: text

### broadcast_log
- id: integer (pk)
- subject: text (required)
- body: text (required)
- filters_json: text
- sent_count: integer (required)
- failed_count: integer (required)
- channel: text (required)
- sent_at: text (required)

### attendance
- id: integer (pk)
- registration_id: text (required, fk)
- event_key: text (required)
- status: text (required)
- notes: text
- _relations_: registration_id -> registrations.id, checked_in_by -> guardian_accounts.id

### scores
- id: integer (pk)
- registration_id: text (required, fk)
- event_key: text (required)
- section: text (required)
- max_score: real (required)
- rank: integer
- entered_by: text
- _relations_: registration_id -> registrations.id, entered_by -> guardian_accounts.id

---

# Components

- **App** — `apps/admin/src/App.tsx`
- **AppShell** — `apps/admin/src/components/app-shell.tsx`
- **AppSidebar** — `apps/admin/src/components/app-sidebar.tsx`
- **AttachmentField** — props: value, onChange — `apps/admin/src/components/attachment-field.tsx`
- **CommandMenu** — props: open, onOpenChange — `apps/admin/src/components/command-menu.tsx`
- **ConfirmDeleteItem** — props: name, onConfirm — `apps/admin/src/components/confirm-delete.tsx`
- **DataTableColumnHeader** — props: column, title, className — `apps/admin/src/components/data-table/data-table-column-header.tsx`
- **DateFilterContent** — props: column, onPick, leading, trailing — `apps/admin/src/components/data-table/data-table-date-filter.tsx`
- **DataTableDateFilter** — props: column — `apps/admin/src/components/data-table/data-table-date-filter.tsx`
- **DataTableFacetedFilter** — props: column, title, options — `apps/admin/src/components/data-table/data-table-faceted-filter.tsx`
- **DataTablePagination** — props: table — `apps/admin/src/components/data-table/data-table-pagination.tsx`
- **DataTableViewOptions** — props: table — `apps/admin/src/components/data-table/data-table-view-options.tsx`
- **EditorField** — props: label, hint, htmlFor, className — `apps/admin/src/components/editor/editor-kit.tsx`
- **SwitchField** — props: label, hint, checked, onChange, id — `apps/admin/src/components/editor/editor-kit.tsx`
- **EditorSection** — props: title, description, className — `apps/admin/src/components/editor/editor-kit.tsx`
- **EditorDialog** — props: open, onOpenChange, trigger, title, description, onSubmit, submitLabel, preview — `apps/admin/src/components/editor/editor-kit.tsx`
- **DateField** — props: value, onChange, id — `apps/admin/src/components/editor/editor-kit.tsx`
- **ImageField** — props: value, onChange, prefix, id, hidePreview — `apps/admin/src/components/editor/editor-kit.tsx`
- **MarkdownTextarea** — props: value, onChange, id, rows — `apps/admin/src/components/editor/editor-kit.tsx`
- **MarkdownPreview** — props: md, image — `apps/admin/src/components/editor/editor-kit.tsx`
- **ListError** — props: message, onRetry — `apps/admin/src/components/list-error.tsx`
- **LoginScreen** — `apps/admin/src/components/login-screen.tsx`
- **NavUser** — `apps/admin/src/components/nav-user.tsx`
- **PageHeader** — props: title, description, actions — `apps/admin/src/components/page-header.tsx`
- **PaymentActions** — props: payment, onDone — `apps/admin/src/components/payment-actions.tsx`
- **Placeholder** — `apps/admin/src/components/placeholder.tsx`
- **PublishBar** — `apps/admin/src/components/publish-bar.tsx`
- **StatusBadge** — props: status, className — `apps/admin/src/components/status-badge.tsx`
- **ThemeToggle** — `apps/admin/src/components/theme-toggle.tsx`
- **AuthProvider** — `apps/admin/src/lib/auth-context.tsx`
- **AuditPage** — `apps/admin/src/pages/audit.tsx`
- **BroadcastPage** — `apps/admin/src/pages/broadcast.tsx`
- **CouponsPage** — `apps/admin/src/pages/coupons.tsx`
- **DashboardPage** — `apps/admin/src/pages/dashboard.tsx`
- **EmailTemplatesPage** — `apps/admin/src/pages/email-templates.tsx`
- **EventsPage** — `apps/admin/src/pages/events.tsx`
- **HallOfFamePage** — `apps/admin/src/pages/hall-of-fame.tsx`
- **PaymentsPage** — `apps/admin/src/pages/payments.tsx`
- **PostsPage** — `apps/admin/src/pages/posts.tsx`
- **PressPage** — `apps/admin/src/pages/press.tsx`
- **ProgramsPage** — `apps/admin/src/pages/programs.tsx`
- **RegistrationDetailPage** — props: id — `apps/admin/src/pages/registration-detail.tsx`
- **RegistrationsPage** — `apps/admin/src/pages/registrations.tsx`
- **ReportsPage** — `apps/admin/src/pages/reports.tsx`
- **SponsorshipsPage** — `apps/admin/src/pages/sponsorships.tsx`
- **SystemHealthPage** — `apps/admin/src/pages/system-health.tsx`
- **TeamPage** — `apps/admin/src/pages/team.tsx`
- **TriagePage** — `apps/admin/src/pages/triage.tsx`
- **UsersPage** — `apps/admin/src/pages/users.tsx`
- **RouterProvider** — `apps/admin/src/router.tsx`
- **Link** — props: href, className, onNavigate — `apps/admin/src/router.tsx`
- **App** — `apps/guardian/src/App.tsx`
- **ChangeSelectionModal** — props: registrationId, programLabel, paid, config, currentIds, unavailableIds, showSubject, showVenue, currentSubject, currentVenue — `apps/guardian/src/components/ChangeSelectionModal.tsx`
- **DashboardSkeleton** — `apps/guardian/src/components/DashboardSkeleton.tsx`
- **DateField** — props: value, onChange, placeholder, ariaLabel, min, max, required, className — `apps/guardian/src/components/DateField.tsx`
- **Dropdown** — props: value, onChange, options, placeholder, ariaLabel — `apps/guardian/src/components/Dropdown.tsx`
- **ErrorPanel** — props: error, onRetry — `apps/guardian/src/components/ErrorPanel.tsx`
- **NotificationTicker** — `apps/guardian/src/components/NotificationTicker.tsx`
- **PaymentBanner** — `apps/guardian/src/components/PaymentBanner.tsx`
- **ProfileSkeleton** — `apps/guardian/src/components/ProfileSkeleton.tsx`
- **StudentsCardSkeleton** — `apps/guardian/src/components/ProfileSkeleton.tsx`
- **Shell** — props: currentRoute — `apps/guardian/src/components/Shell.tsx`
- **Home** — `apps/guardian/src/pages/Home.tsx`
- **Login** — props: onSignedIn — `apps/guardian/src/pages/Login.tsx`
- **Profile** — `apps/guardian/src/pages/Profile.tsx`
- **Results** — `apps/guardian/src/pages/Results.tsx`

---

# Libraries

- `apps/admin/src/hooks/use-list.ts` — function useList: (fetcher) => void
- `apps/admin/src/hooks/use-mobile.ts` — function useIsMobile: () => void
- `apps/admin/src/lib/export-csv.ts` — function exportCsv: (filename, rows, columns) => void, type CsvColumn
- `apps/admin/src/lib/format.ts`
  - function bdt: (amount) => string
  - function compactBdt: (amount) => string
  - function num: (n) => string
  - function dateUK: (iso) => string
  - function dateBD: (iso) => string
  - function timeBD: (iso) => string
  - _...2 more_
- `apps/admin/src/lib/http.ts`
  - function request: (method, path, body?) => Promise<T>
  - function upload: (path, form) => Promise<T>
  - class ApiError
  - const http
- `apps/admin/src/lib/markdown.ts` — function renderMarkdown: (md) => string
- `apps/admin/src/lib/run.ts` — function run: (p, ok, after?) => void
- `apps/admin/src/lib/table.ts` — function inArray, function cap
- `apps/admin/src/lib/utils.ts` — function cn: (...inputs) => void
- `apps/guardian/src/api.ts` — class ApiError, const api
- `apps/guardian/src/auth.ts`
  - function getSession: () => Session | null
  - function setSession: (s) => void
  - function clearSession: () => void
  - function syncSessionName: (fullName, email) => void
  - function syncHeaderName: (studentFullName) => void
  - function getToken: () => string | null
  - _...2 more_
- `apps/guardian/src/format.ts`
  - function formatBdt: (n) => string
  - function formatDate: (iso) => string
  - function toIso
- `apps/guardian/src/me.ts`
  - function loadMe: (force) => Promise<MeLite>
  - function tierLabel: (tier) => string
  - type ExamResult
  - type ResultReg
  - type MeLite
- `apps/guardian/src/router.ts`
  - function useRoute: () => string
  - function navigate: (to) => void
  - function href: (to) => string
- `apps/static/src/lib/fmtPress.ts` — function fmtPress: (iso) => string
- `apps/static/src/lib/ogImage.ts` — function optimizedAbsolute: (p) => Promise<string>, function optimizedDimensions: (p) => Promise<
- `apps/static/src/lib/regState.js` — function deriveRegState: (yearRound, starts, ends, today) => void
- `apps/static/src/lib/related.js` — function relatedTo: (subject, candidates, limit) => void
- `public/js/api.js` — function buildFunctionUrl: (name) => void, function postJson: (functionName, payload, token) => void
- `public/js/bd-districts.js` — function canonicalDistrict: (value) => void, const BD_DISTRICTS
- `public/js/md.js`
  - function escHtml: (s) => void
  - function parseFrontmatter: (raw) => void
  - function markdownToHtml: (md) => void
- `public/js/program-catalog.js` — function loadCatalog: () => void, function programMaps: () => void
- `public/js/program-options.js`
  - function initProgramOptions: () => void
  - function programHasOptions: (slug) => void
  - function computeOptionsTotal: (slug, ids) => void
  - const PROGRAM_OPTIONS
- `scripts/materialize.mjs` — function materialize: () => void
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
  - function validateAndPrice: (cfg, rawOptions) => void
  - function priceOf: (cfg, ids) => void
  - function labelsOf: (cfg, ids) => void
  - function computeDiff: (cfg, fromIds, toIds) => void
  - function isWithinEditWindow: (registrationCloses, todayISO) => void
  - function deriveRegState: (yearRound, starts, ends, today) => void
  - _...1 more_
- `worker/lib/programs.js` — function loadCatalog: (env) => void, function getCatalog: (c) => void
- `worker/lib/publish.js`
  - function isDataset: (entityType) => void
  - function pathFor: (entityType, entityId) => void
  - function materializeEntity: (env, entityType, entityId, action) => void
  - function titleFor: (env, entityType, entityId) => void
  - function captureSnapshot: (env, entityType, entityId) => void
  - function restoreSnapshot: (env, entityType, entityId, action) => void
  - _...2 more_
- `worker/lib/rate-limit.js`
  - function checkLoginRateLimit: (env, email) => void
  - function recordLoginAttempt: (env, email, success) => void
  - function checkActionRateLimit: (env, bucket, key, limit, windowMs) => void
  - function recordActionAttempt: (env, bucket, key) => void
  - function clientIpFor: (request) => void
- `worker/lib/reconcile.js` — function reconcilePayment: (env, payment, baseUrl) => void, function reconcileStalePayments: (env, baseUrl, ageMs) => void
- `worker/lib/repoAssets.js`
  - function repoRelForLogical: (logical) => void
  - function readRepoAsset: (env, repoRel) => void
  - function writeRepoAsset: (env, repoRel, arrayBuffer, contentType, message) => void
- `worker/lib/sessions.js`
  - function createSession: (env, accountId) => void
  - function verifySession: (env, token) => void
  - function extractToken: (request) => void
  - function sessionCookie: (token, request, ttlMs) => void
  - function clearSessionCookie: (request) => void
  - function requireAuth: (request, env) => void
  - _...2 more_
- `worker/lib/shurjopay.js`
  - function getShurjopayConfig: (env) => void
  - function shurjopayGetToken: (config, env) => void
  - function shurjopayCreatePayment: (config, tokenInfo, payload) => void
  - function shurjopayVerify: (config, tokenInfo, spOrderId) => void
  - function shurjopayOutcome: (result) => void
- `worker/lib/util.js`
  - function jsonResponse: (body, status, extraHeaders) => void
  - function badRequest: (message, status) => void
  - function redirectTo: (url) => void
  - function createId: (prefix) => void
  - function parseClassDigit: (className) => void
  - function reserveMemberId: (env, year, classDigit) => void
  - _...5 more_
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

- `BASE_URL` **required** — apps/admin/src/router.tsx
- `SITE_URL` (has default) — .env.example
- `VITE_PORT` **required** — apps/admin/vite.config.ts
- `WRANGLER_PORT` **required** — apps/admin/vite.config.ts

## Config Files

- `.env.example`
- `apps/admin/vite.config.ts`
- `apps/guardian/vite.config.ts`
- `wrangler.toml`

## Key Dependencies

- hono: ^4.12.19

---

# Middleware

## auth
- auth-context — `apps/admin/src/lib/auth-context.tsx`
- App — `apps/guardian/src/App.tsx`
- api — `apps/guardian/src/api.ts`
- auth — `apps/guardian/src/auth.ts`
- ChangeSelectionModal — `apps/guardian/src/components/ChangeSelectionModal.tsx`
- ErrorPanel — `apps/guardian/src/components/ErrorPanel.tsx`
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
- DateField — `apps/guardian/src/components/DateField.tsx`
- Dropdown — `apps/guardian/src/components/Dropdown.tsx`
- NotificationTicker — `apps/guardian/src/components/NotificationTicker.tsx`
- PaymentBanner — `apps/guardian/src/components/PaymentBanner.tsx`
- ProfileSkeleton — `apps/guardian/src/components/ProfileSkeleton.tsx`
- Shell — `apps/guardian/src/components/Shell.tsx`
- format — `apps/guardian/src/format.ts`
- main — `apps/guardian/src/main.tsx`
- me — `apps/guardian/src/me.ts`
- Results — `apps/guardian/src/pages/Results.tsx`
- router — `apps/guardian/src/router.ts`
- vite.config — `apps/guardian/vite.config.ts`
- 0005_registrations_guardian_index — `db/migrations/0005_registrations_guardian_index.sql`
- dev-guardian — `scripts/dev-guardian.mjs`

## validation
- districts — `apps/guardian/src/districts.ts`

## rate-limit
- rate-limit — `worker/lib/rate-limit.js`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `apps/guardian/src/api.ts` — imported by **9** files
- `worker/lib/util.js` — imported by **8** files
- `apps/guardian/src/auth.ts` — imported by **5** files
- `worker/lib/crypto.js` — imported by **5** files
- `apps/guardian/src/format.ts` — imported by **4** files
- `worker/lib/programs.js` — imported by **4** files
- `worker/lib/email.js` — imported by **4** files
- `apps/guardian/src/router.ts` — imported by **3** files
- `apps/guardian/src/me.ts` — imported by **3** files
- `public/js/api.js` — imported by **3** files
- `worker/lib/validation.js` — imported by **3** files
- `worker/lib/program-options.js` — imported by **3** files
- `worker/lib/shurjopay.js` — imported by **3** files
- `worker/lib/audit-log.js` — imported by **3** files
- `apps/admin/src/lib/http.ts` — imported by **2** files
- `apps/guardian/src/components/NotificationTicker.tsx` — imported by **2** files
- `apps/guardian/src/components/ChangeSelectionModal.tsx` — imported by **2** files
- `apps/guardian/src/components/ErrorPanel.tsx` — imported by **2** files
- `public/js/program-catalog.js` — imported by **2** files
- `public/js/program-options.js` — imported by **2** files

## Import Map (who imports what)

- `apps/guardian/src/api.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/components/ChangeSelectionModal.tsx`, `apps/guardian/src/components/ErrorPanel.tsx`, `apps/guardian/src/components/NotificationTicker.tsx`, `apps/guardian/src/components/PaymentBanner.tsx` +4 more
- `worker/lib/util.js` ← `worker/lib/audit-log.js`, `worker/lib/email.js`, `worker/lib/reconcile.js`, `worker/lib/util.test.js`, `worker/routes/admin.js` +3 more
- `apps/guardian/src/auth.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/api.ts`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `worker/lib/crypto.js` ← `scripts/create-admin.mjs`, `scripts/create-demo-user.mjs`, `scripts/seed-registrations.mjs`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `apps/guardian/src/format.ts` ← `apps/guardian/src/components/ChangeSelectionModal.tsx`, `apps/guardian/src/components/DateField.tsx`, `apps/guardian/src/components/NotificationTicker.tsx`, `apps/guardian/src/pages/Home.tsx`
- `worker/lib/programs.js` ← `worker/lib/email.js`, `worker/routes/admin.js`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `worker/lib/email.js` ← `worker/lib/reconcile.js`, `worker/routes/admin.js`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `apps/guardian/src/router.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/components/PaymentBanner.tsx`, `apps/guardian/src/components/Shell.tsx`
- `apps/guardian/src/me.ts` ← `apps/guardian/src/components/Shell.tsx`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Results.tsx`
- `public/js/api.js` ← `public/js/registration-page.js`, `public/js/registration.js`, `public/js/sponsorship.js`

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_