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
