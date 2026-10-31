#!/usr/bin/env bash
# Restore rehearsal ONLY into an existing empty disposable database.
set -euo pipefail
umask 077
: "${TRADE_OS_RESTORE_URL:?Scratch database URL required}"
: "${TRADE_OS_DATABASE_URL:?Original database URL required for comparison}"
if [[ "${TRADE_OS_RESTORE_APPROVED:-}" != "YES" ]]; then
  echo "Explicit disposable-database restore approval required" >&2; exit 1
fi
if [[ "$TRADE_OS_RESTORE_URL" == "$TRADE_OS_DATABASE_URL" ]]; then
  echo "Refusing restore into source database" >&2; exit 1
fi
if [[ "$#" -ne 1 || ! -f "$1" ]]; then echo "Usage: restore-rehearsal.sh <backup.dump>" >&2; exit 2; fi
command -v pg_restore >/dev/null || { echo "pg_restore not found" >&2; exit 1; }
if [[ -f "$1.sha256" ]]; then (cd "$(dirname "$1")" && sha256sum --check "$(basename "$1").sha256"); fi
# Never --clean or --create here; test target must be fresh.
pg_restore --single-transaction --exit-on-error --no-owner --no-acl --dbname="$TRADE_OS_RESTORE_URL" "$1"
echo "Restore completed into disposable database. Execute schema/application smoke tests before certifying."
