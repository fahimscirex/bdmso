#!/usr/bin/env bash
#
# ETL: build a new-schema D1 from schema.sql, seed content, import the real prod
# user data (with cohort_key backfills + column defaults), and self-validate.
#
# Runs entirely offline against the prod BACKUP - it never touches live prod.
# Re-runnable: rebuilds the output DB from scratch each time.
#
# Sources:
#   SCHEMA   db/schema.sql                  - target schema (source of truth)
#   OLD      <prod backup>.sql              - real prod user data (read-only copy)
#   CONTENT  local D1                       - curated site CONTENT (programs,
#                                             cohorts, posts, press, hof,
#                                             medalists, team, email_templates).
#                                             NOT test user data. Override CONTENT
#                                             if you have a different canonical
#                                             content source.
# Output:
#   NEW      scratchpad/prod_new.sqlite     - the migrated DB to validate + load
#
set -uo pipefail
cd /home/fahim/playground/bdmso

# Working dir (override with WORKDIR=...). Holds the throwaway old-copy + the
# built prod_new.sqlite. Defaults outside the repo so it never gets committed.
SP="${WORKDIR:-$HOME/bdmso-cutover}"
mkdir -p "$SP"
SCHEMA=db/schema.sql
# Fresh prod export, REQUIRED at cutover time. Pass as $1; falls back to the
# newest backup only for rehearsal. ALWAYS pass the latest export for the real run.
BACKUP=${1:-$(ls -t ~/bdmso-backups/prod-d1-*.sql ~/bdmso-backups/prod-cutover-*.sql 2>/dev/null | head -1)}
# Site content source (programs/cohorts/posts/press/...). Override with CONTENT=...
# Defaults to the local D1; confirm it holds the canonical content before cutover.
CONTENT="${CONTENT:-.wrangler/state/v3/d1/miniflare-D1DatabaseObject/6cb3095de097ebd322cd7ed9d4217dfca6282cab9cdec2ed43331646fa8026a2.sqlite}"
OLD=$SP/prod_old.sqlite
NEW=$SP/prod_new.sqlite

CONTENT_TABLES="programs cohorts posts press_mentions hall_of_fame_photos medalists team_members email_templates"
USERDATA_TABLES="guardian_accounts coupons registrations payments registration_option_changes admin_audit_log email_verification_tokens password_reset_tokens login_attempts action_attempts member_id_class_seq shurjopay_token_cache sponsorship_enquiries"
# deliberately NOT imported: sessions (flushed - users re-login on new cookie),
# and the new operational tables (attendance, scores, pending_publish,
# publish_snapshots, registration_notes, broadcast_log, triage_state,
# invoice_seq) which start empty.

echo "backup : $BACKUP"
echo "content: $CONTENT"
echo

# --- (re)load a pristine copy of the prod backup -----------------------------
rm -f "$OLD" "$OLD"-shm "$OLD"-wal
sqlite3 "$OLD" < "$BACKUP"

# --- build the new schema ----------------------------------------------------
rm -f "$NEW" "$NEW"-shm "$NEW"-wal
sqlite3 "$NEW" < "$SCHEMA"
echo "new schema built: $(sqlite3 "$NEW" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';") tables"

# columns present in BOTH the new table and the source table (alphabetical).
shared_cols() { # $1=src_db_file  $2=table
  comm -12 \
    <(sqlite3 "$NEW" "SELECT name FROM pragma_table_info('$2');" | sort) \
    <(sqlite3 "$1"   "SELECT name FROM pragma_table_info('$2');" | sort) | paste -sd,
}

# --- generate the import SQL -------------------------------------------------
IMPORT=$SP/etl-import.sql
{
  echo "ATTACH '$OLD' AS old;"
  echo "ATTACH '$CONTENT' AS content;"
  echo "PRAGMA foreign_keys=OFF;"   # bulk import; validated with foreign_key_check below
  echo "BEGIN;"
  echo "-- ===== site content (from CONTENT source) ====="
  for t in $CONTENT_TABLES; do
    c=$(shared_cols "$CONTENT" "$t"); [ -n "$c" ] && echo "INSERT INTO $t ($c) SELECT $c FROM content.$t;"
  done
  echo "-- ===== prod user data (from backup) ====="
  for t in $USERDATA_TABLES; do
    c=$(shared_cols "$OLD" "$t"); [ -n "$c" ] && echo "INSERT INTO $t ($c) SELECT $c FROM old.$t;"
  done
  echo "-- ===== backfills + column defaults ====="
  echo "UPDATE registrations SET cohort_key=(SELECT cohort_key FROM cohorts WHERE program_slug=registrations.registration_type) WHERE cohort_key IS NULL;"
  echo "UPDATE payments SET cohort_key=(SELECT cohort_key FROM registrations WHERE registrations.id=payments.registration_id) WHERE cohort_key IS NULL;"
  echo "UPDATE payments SET channel='online' WHERE channel IS NULL;"          # historical = shurjoPay
  echo "UPDATE guardian_accounts SET updated_at=created_at WHERE updated_at IS NULL;"
  echo "UPDATE coupons SET updated_at=created_at WHERE updated_at IS NULL;"
  echo "COMMIT;"
} > "$IMPORT"

# --- run the import ----------------------------------------------------------
if ! sqlite3 -bail "$NEW" < "$IMPORT" 2>"$SP/etl-err.txt"; then
  echo "IMPORT FAILED:"; cat "$SP/etl-err.txt"; exit 1
fi
echo "import applied. (SQL: $IMPORT)"
echo

# --- validation --------------------------------------------------------------
echo "================= VALIDATION ================="
fail=0
chk() { # label  expected  actual
  if [ "$2" = "$3" ]; then printf "  OK   %-40s %s\n" "$1" "$3"
  else printf "  FAIL %-40s expected %s got %s\n" "$1" "$2" "$3"; fail=1; fi
}
o() { sqlite3 "$OLD" "$1"; }
n() { sqlite3 "$NEW" "$1"; }

echo "-- user-data row counts preserved (old -> new) --"
for t in guardian_accounts registrations payments coupons registration_option_changes admin_audit_log member_id_class_seq email_verification_tokens password_reset_tokens; do
  chk "$t" "$(o "SELECT COUNT(*) FROM $t;")" "$(n "SELECT COUNT(*) FROM $t;")"
done

echo "-- content seeded (from CONTENT) --"
for t in $CONTENT_TABLES; do
  printf "  %-30s %s\n" "$t" "$(n "SELECT COUNT(*) FROM $t;")"
done

echo "-- cohort_key backfill coverage (want 0 unmapped) --"
chk "registrations.cohort_key NULL" "0" "$(n "SELECT COUNT(*) FROM registrations WHERE cohort_key IS NULL;")"
chk "payments.cohort_key NULL"      "0" "$(n "SELECT COUNT(*) FROM payments WHERE cohort_key IS NULL;")"

echo "-- defaults applied --"
chk "payments.channel NULL"           "0" "$(n "SELECT COUNT(*) FROM payments WHERE channel IS NULL;")"
chk "guardian_accounts.updated_at NULL" "0" "$(n "SELECT COUNT(*) FROM guardian_accounts WHERE updated_at IS NULL;")"

echo "-- integrity --"
ic=$(n "PRAGMA integrity_check;"); chk "integrity_check" "ok" "$ic"
fk=$(n "PRAGMA foreign_key_check;" | head -5)
if [ -z "$fk" ]; then echo "  OK   foreign_key_check                        clean"; else echo "  FAIL foreign_key_check: $fk"; fail=1; fi

echo "-- spot check: cohort_key distribution (registrations) --"
n "SELECT registration_type, cohort_key, COUNT(*) FROM registrations GROUP BY registration_type ORDER BY 3 DESC;" | sed 's/^/    /'

echo
if [ "$fail" = "0" ]; then echo "RESULT: PASS - migrated DB at $NEW"; else echo "RESULT: FAIL - see above"; exit 2; fi
