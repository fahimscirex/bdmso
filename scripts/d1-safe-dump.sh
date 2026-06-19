#!/usr/bin/env bash
# Emit a D1-loadable data dump (INSERTs only) from a SQLite DB.
# Uses quote() so control chars (newlines in addresses) become standard literals
# instead of unistr() - which D1's SQLite does not implement. Tables are emitted
# parents-first because D1 enforces foreign keys and can't disable them.
#
#   d1-safe-dump.sh <src.sqlite> <out.sql>
set -euo pipefail
DB=$1; OUT=$2
: > "$OUT"

# FK-dependency order: parents before children. Empty tables are skipped.
ORDER="guardian_accounts programs cohorts coupons posts press_mentions \
hall_of_fame_photos medalists team_members email_templates member_id_class_seq \
shurjopay_token_cache login_attempts action_attempts admin_audit_log \
registrations payments email_verification_tokens password_reset_tokens \
registration_option_changes attendance scores pending_publish publish_snapshots \
registration_notes broadcast_log triage_state sponsorship_enquiries invoice_seq sessions"

for t in $ORDER; do
  exists=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$t';")
  [ "$exists" = "1" ] || continue
  cnt=$(sqlite3 "$DB" "SELECT COUNT(*) FROM \"$t\";")
  [ "$cnt" = "0" ] && continue
  cols=$(sqlite3 "$DB" "SELECT name FROM pragma_table_info('$t');")
  collist=$(echo "$cols" | paste -sd,)
  qexpr=""
  for c in $cols; do
    [ -n "$qexpr" ] && qexpr="$qexpr||','||"
    qexpr="${qexpr}quote(\"$c\")"
  done
  sqlite3 "$DB" "SELECT 'INSERT INTO \"$t\" ($collist) VALUES ('||$qexpr||');' FROM \"$t\";" >> "$OUT"
  echo "  $t: $cnt rows" >&2
done
echo "wrote $(grep -c '^INSERT' "$OUT") inserts to $OUT" >&2
