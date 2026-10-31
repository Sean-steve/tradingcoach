#!/usr/bin/env bash
# Restores ONLY into an empty disposable database with a different server/db
# identity from the source. Never use --clean, --create or a production URL.
set -euo pipefail
umask 077
: "${TRADE_OS_RESTORE_URL:?Scratch database URL required}"
: "${TRADE_OS_DATABASE_URL:?Source database URL required for safety comparison}"
if [[ "${TRADE_OS_RESTORE_APPROVED:-}" != "YES" ]]; then
  echo "Explicit disposable-database restore approval required" >&2; exit 1
fi
if [[ "$#" -ne 1 || ! -f "$1" ]]; then
  echo "Usage: restore-rehearsal.sh <backup.dump>" >&2; exit 2
fi
command -v pg_restore >/dev/null || { echo "pg_restore not found" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found" >&2; exit 1; }
if [[ "$TRADE_OS_RESTORE_URL" == "$TRADE_OS_DATABASE_URL" ]]; then
  echo "Refusing restore into source database" >&2; exit 1
fi
# Database identity is resolved by the server (not by comparing DSN strings).
# Different usernames, URL query strings and hostnames can resolve to the
# SAME physical database: compare actual server address, port and DB name.
identity_sql="SELECT concat_ws('|',coalesce(inet_server_addr()::text,'unix'),coalesce(inet_server_port()::text,'0'),current_database())"
source_id="$(psql -X -qAt -v ON_ERROR_STOP=1 --dbname="$TRADE_OS_DATABASE_URL" -c "$identity_sql")"
target_id="$(psql -X -qAt -v ON_ERROR_STOP=1 --dbname="$TRADE_OS_RESTORE_URL" -c "$identity_sql")"
if [[ -z "$source_id" || -z "$target_id" || "$source_id" == "$target_id" ]]; then
  echo "Refusing restore: source and target database identity is identical or unknown" >&2
  exit 1
fi
# A fresh DB should contain no user tables, views, sequences, or other relations.
# Never use --clean to bypass this requirement; even an unexpectedly populated
# scratch DB must fail closed.
check_sql="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND c.relkind IN ('r','p','v','m','f','S')"
count="$(psql -X -qAt -v ON_ERROR_STOP=1 --dbname="$TRADE_OS_RESTORE_URL" -c "$check_sql")"
if [[ ! "$count" =~ ^[0-9]+$ || "$count" -ne 0 ]]; then
  echo "Refusing restore: scratch database is not empty" >&2
  exit 1
fi
if [[ -f "$1.sha256" ]]; then
  (cd "$(dirname "$1")" && sha256sum --check "$(basename "$1").sha256")
else
  echo "Restore rehearsal requires a SHA-256 manifest from the approved backup" >&2
  exit 1
fi
pg_restore --list "$1" >/dev/null
pg_restore --single-transaction --exit-on-error --no-owner --no-acl --dbname="$TRADE_OS_RESTORE_URL" "$1"
echo "Restore completed into a distinct, previously empty scratch database."
echo "Run schema, permission and application checks; restore success is not a DR certificate."
