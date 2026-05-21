# Dependency Graph

## Most Imported Files (change these carefully)

- `apps/admin/src/api.ts` — imported by **14** files
- `apps/admin/src/router.ts` — imported by **11** files
- `apps/guardian/src/auth.ts` — imported by **5** files
- `worker/lib/crypto.js` — imported by **5** files
- `apps/admin/src/auth.ts` — imported by **4** files
- `apps/guardian/src/api.ts` — imported by **4** files
- `worker/lib/util.js` — imported by **4** files
- `apps/guardian/src/router.ts` — imported by **3** files
- `worker/lib/programs.js` — imported by **3** files
- `apps/admin/src/components/ImageField.tsx` — imported by **2** files
- `apps/guardian/src/components/NotificationTicker.tsx` — imported by **2** files
- `public/js/api.js` — imported by **2** files
- `worker/lib/validation.js` — imported by **2** files
- `worker/lib/sessions.js` — imported by **2** files
- `worker/middleware/session.js` — imported by **2** files
- `worker/lib/audit-log.js` — imported by **2** files
- `worker/lib/email.js` — imported by **2** files
- `worker/lib/districts.js` — imported by **2** files
- `apps/admin/src/pages/Login.tsx` — imported by **1** files
- `apps/admin/src/pages/Dashboard.tsx` — imported by **1** files

## Import Map (who imports what)

- `apps/admin/src/api.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Coupons.tsx`, `apps/admin/src/pages/Dashboard.tsx`, `apps/admin/src/pages/Payments.tsx` +9 more
- `apps/admin/src/router.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/components/NavShell.tsx`, `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Dashboard.tsx`, `apps/admin/src/pages/Payments.tsx` +6 more
- `apps/guardian/src/auth.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/api.ts`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `worker/lib/crypto.js` ← `scripts/create-admin.mjs`, `scripts/create-demo-user.mjs`, `scripts/seed-registrations.mjs`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `apps/admin/src/auth.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/api.ts`, `apps/admin/src/components/ImageField.tsx`, `apps/admin/src/pages/Login.tsx`
- `apps/guardian/src/api.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `worker/lib/util.js` ← `worker/lib/audit-log.js`, `worker/lib/email.js`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `apps/guardian/src/router.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/components/PaymentBanner.tsx`, `apps/guardian/src/components/Shell.tsx`
- `worker/lib/programs.js` ← `worker/lib/email.js`, `worker/routes/admin.js`, `worker/routes/public.js`
- `apps/admin/src/components/ImageField.tsx` ← `apps/admin/src/pages/PostEditor.tsx`, `apps/admin/src/pages/ProgramEditor.tsx`
