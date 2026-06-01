# Dependency Graph

## Most Imported Files (change these carefully)

- `apps/admin/src/api.ts` — imported by **18** files
- `apps/admin/src/components/Icon.tsx` — imported by **16** files
- `apps/admin/src/router.ts` — imported by **14** files
- `apps/admin/src/components/Skeleton.tsx` — imported by **12** files
- `apps/admin/src/csv.ts` — imported by **5** files
- `apps/guardian/src/auth.ts` — imported by **5** files
- `apps/guardian/src/api.ts` — imported by **5** files
- `worker/lib/crypto.js` — imported by **5** files
- `worker/lib/util.js` — imported by **5** files
- `apps/admin/src/auth.ts` — imported by **4** files
- `worker/lib/programs.js` — imported by **4** files
- `apps/guardian/src/router.ts` — imported by **3** files
- `public/js/api.js` — imported by **3** files
- `worker/lib/audit-log.js` — imported by **3** files
- `worker/lib/email.js` — imported by **3** files
- `apps/admin/src/components/Sparkline.tsx` — imported by **2** files
- `public/js/md.js` — imported by **2** files
- `apps/guardian/src/components/NotificationTicker.tsx` — imported by **2** files
- `apps/guardian/src/components/ChangeSelectionModal.tsx` — imported by **2** files
- `public/js/program-catalog.js` — imported by **2** files

## Import Map (who imports what)

- `apps/admin/src/api.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/components/CommandPalette.tsx`, `apps/admin/src/components/NotificationBell.tsx`, `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Broadcast.tsx` +13 more
- `apps/admin/src/components/Icon.tsx` ← `apps/admin/src/components/CommandPalette.tsx`, `apps/admin/src/components/NavShell.tsx`, `apps/admin/src/components/NeedsAttention.tsx`, `apps/admin/src/components/NotificationBell.tsx`, `apps/admin/src/pages/AuditLog.tsx` +11 more
- `apps/admin/src/router.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/components/CommandPalette.tsx`, `apps/admin/src/components/NavShell.tsx`, `apps/admin/src/components/NeedsAttention.tsx`, `apps/admin/src/components/NotificationBell.tsx` +9 more
- `apps/admin/src/components/Skeleton.tsx` ← `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Broadcast.tsx`, `apps/admin/src/pages/Coupons.tsx`, `apps/admin/src/pages/Dashboard.tsx`, `apps/admin/src/pages/Events.tsx` +7 more
- `apps/admin/src/csv.ts` ← `apps/admin/src/pages/AuditLog.tsx`, `apps/admin/src/pages/Events.tsx`, `apps/admin/src/pages/PaymentReports.tsx`, `apps/admin/src/pages/Payments.tsx`, `apps/admin/src/pages/Registrations.tsx`
- `apps/guardian/src/auth.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/api.ts`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `apps/guardian/src/api.ts` ← `apps/guardian/src/App.tsx`, `apps/guardian/src/components/ChangeSelectionModal.tsx`, `apps/guardian/src/pages/Home.tsx`, `apps/guardian/src/pages/Login.tsx`, `apps/guardian/src/pages/Profile.tsx`
- `worker/lib/crypto.js` ← `scripts/create-admin.mjs`, `scripts/create-demo-user.mjs`, `scripts/seed-registrations.mjs`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `worker/lib/util.js` ← `worker/lib/audit-log.js`, `worker/lib/email.js`, `worker/routes/admin.js`, `worker/routes/guardian.js`, `worker/routes/public.js`
- `apps/admin/src/auth.ts` ← `apps/admin/src/App.tsx`, `apps/admin/src/api.ts`, `apps/admin/src/components/ImageField.tsx`, `apps/admin/src/pages/Login.tsx`
