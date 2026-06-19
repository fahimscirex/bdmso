# BdMSO Production DB Cutover Runbook

Migrate prod from the old 16-table schema to the new refactor schema by building
a **new D1 beside the live one** and swapping the binding. The old DB is never
mutated, so rollback is a one-line revert.

Run during a **low/zero-traffic window** (after midnight). Steps 1-3 are offline
and safe to rehearse anytime; steps 4-9 touch Cloudflare.

---

## Pre-validated facts (tested 2026-06-19, offline, against the backup)
- ETL is additive + 2 clean backfills; **all row counts preserved** (168 guardians / 202 regs / 205 payments), integrity + FK clean.
- App runs on the migrated data: `/api/catalog`, guardian `/api/me`, admin reads, **and a new registration write** (resolved `cohort_key` correctly) all succeed.
- **Load gotcha (handled):** `sqlite3 .dump` emits `unistr()` (newlines in addresses) which **D1 cannot execute**. Use `scripts/d1-safe-dump.sh` (quote()-based, parents-first order) instead - validated to load 1326 inserts via wrangler with 0 errors.
- Member IDs stay continuous: `member_id_class_seq` is imported, and new code assigns to `guardian_accounts.member_id` exactly like the deployed code.
- Sessions are **flushed** (not imported) - everyone re-logs in once.

## Prerequisites
- Refactor code on the branch Cloudflare Workers Build deploys, and `pnpm run build:all` passes.
- `GITHUB_TOKEN` secret set on the prod worker (done).
- Scripts present: `scripts/etl-prod-migrate.sh`, `scripts/d1-safe-dump.sh`.
- ⚠️ Both scripts currently write to/read from this session's scratch dir - re-point `SP`/paths (or pass args) before the real run.

---

## ⚠️ Always pull the LATEST DB at cutover
The export in step 1 must be a **fresh** export taken at cutover time - never an
old backup. The ETL takes the export path as `$1`; pass the just-taken file.
Building from a stale export silently drops every registration/payment made
since that backup.

## ⚠️ The cutover gap (and where the maintenance gate fits)
Anything a guardian writes **between the fresh export (step 1) and the deploy (step 8)** lands in the OLD DB and is lost.

Note the gate's limit: `MAINTENANCE` lives in the **new** code, so it can't freeze the **old** worker that's live before step 8. So:
- **Pre-deploy freeze (steps 1-7):** use a genuinely zero-traffic window, or a Cloudflare-level block (WAF rule / "everyone except my IP") that works regardless of worker code. Keep this window short.
- **Post-deploy verify (step 8-9):** deploy with `MAINTENANCE="true"` so the public sees the page while you smoke-test the live new stack via `?preview=<MAINTENANCE_KEY>`, then flip `MAINTENANCE="false"` to open.

Prereq for the gate: `wrangler secret put MAINTENANCE_KEY --env production` (any random string).

---

## Steps

### 0. (Recommended) Freeze public writes
So the export is a true point-in-time and nothing is lost mid-cutover. The new-code `MAINTENANCE` gate isn't live yet, so freeze at the Cloudflare level (WAF rule allowing only your IP) or pick a zero-traffic window.

### 1. Fresh prod export (point-in-time snapshot)
```bash
TS=$(date +%Y%m%d-%H%M%S)
wrangler d1 export bdmso --env production --remote \
  --output ~/bdmso-backups/prod-cutover-$TS.sql
```
> Brief read-unavailability during export - hence the low-traffic window.

### 2. Build + validate the migrated DB from the FRESH export
```bash
bash scripts/etl-prod-migrate.sh ~/bdmso-backups/prod-cutover-$TS.sql
```
Must end with **`RESULT: PASS`** (counts preserved, integrity ok, FK clean). **If it fails, STOP** - do not cut over. Output: `<scratch>/prod_new.sqlite`.

### 3. Generate the D1-safe data dump
```bash
bash scripts/d1-safe-dump.sh <scratch>/prod_new.sqlite ~/bdmso-backups/prod_new_d1-$TS.sql
grep -c unistr ~/bdmso-backups/prod_new_d1-$TS.sql    # must print 0
```

### 4. Create the new D1
```bash
wrangler d1 create bdmso-v2
# note the printed database_id  ->  NEW_DB_ID
```

### 5. Load schema, then data, into the new D1 (remote)
```bash
wrangler d1 execute bdmso-v2 --remote --file=db/schema.sql
wrangler d1 execute bdmso-v2 --remote --file=~/bdmso-backups/prod_new_d1-$TS.sql
```

### 6. Verify the new D1 (remote) matches the migrated DB
```bash
wrangler d1 execute bdmso-v2 --remote --command \
 "SELECT (SELECT COUNT(*) FROM guardian_accounts) g,(SELECT COUNT(*) FROM registrations) r,(SELECT COUNT(*) FROM payments) p,(SELECT COUNT(*) FROM cohorts) c;"
# expect the same g/r/p/c the ETL reported in step 2
```

### 7. Swap the binding
In `wrangler.toml`, set the production D1 `database_id` to `NEW_DB_ID`:
```toml
[[env.production.d1_databases]]
binding = "DB"
database_name = "bdmso-v2"
database_id = "NEW_DB_ID"
```
Commit the change.

### 8. Deploy (in maintenance mode so you can verify before opening)
Set `MAINTENANCE = "true"` in `[env.production.vars]` (or dashboard), then deploy - push to the deploy branch (triggers Workers Build) **or**:
```bash
pnpm run cf:deploy      # build:all + wrangler deploy --env production
```
Now the new code + new DB is live but the public sees the maintenance page.

### 9. Smoke test the live new stack, then open
Bypass the gate: visit `https://bdmso.org/?preview=<MAINTENANCE_KEY>` once (drops the cookie), then:
- `GET /api/catalog` → 200, programs listed
- Log in as a real guardian → dashboard shows their registrations
- Submit a test registration (then cancel/clean) → succeeds with a `cohort_key`
- Admin panel loads dashboard/registrations/payments
- A real online payment end-to-end (shurjoPay) - only verifiable here, not pre-deploy
- All good → set `MAINTENANCE = "false"` (dashboard, instant) to open to the public. Remove any WAF block from step 0.

---

## Rollback (any time after step 7)
Revert `wrangler.toml` `database_id` to the **old** value `650eb353-3ecb-4710-87b6-4d72aea2cd71` and redeploy. The old DB was never touched.
```bash
git checkout -- wrangler.toml   # or set database_id back manually
pnpm run cf:deploy
```
Extra safety net: the old DB also has D1 **Time Travel** (30-day point-in-time restore).

---

## Post-cutover
- Tell guardians they may need to log in again (sessions flushed).
- Keep the old DB (`650eb353…`) for at least a few days before deleting.
- Flip `GITHUB_BRANCH` back to `main` at full go-live if you staged on `refactor`.
