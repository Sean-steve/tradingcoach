#!/usr/bin/env bash
# Creates a PostgreSQL custom-format backup. Never deletes old snapshots.
set -euo pipefail
umask 077
: "${TRADE_OS_DATABASE_URL:?Database URL is required from a private env file}"
: "${TRADE_OS_BACKUP_DIRECTORY:?Choose a private backup directory}"
mode="${TRADE_OS_BACKUP_TARGET:-local}"
if [[ "$mode" != "local" && "$mode" != "production" ]]; then
  echo "TRADE_OS_BACKUP_TARGET must be local or production" >&2; exit 1
fi
if [[ "$mode" == "production" && "${TRADE_OS_PRODUCTION_BACKUP_APPROVED:-}" != "YES" ]]; then
  echo "Explicit production backup approval required" >&2; exit 1
fi
command -v pg_dump >/dev/null || { echo "pg_dump not found" >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore not found" >&2; exit 1; }
mkdir -p "$TRADE_OS_BACKUP_DIRECTORY"
chmod 700 "$TRADE_OS_BACKUP_DIRECTORY"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$TRADE_OS_BACKUP_DIRECTORY/tradeos-$mode-$stamp-$$.dump"
tmp="$dest.partial"
trap 'rm -f "$tmp"' EXIT
pg_dump --no-owner --no-acl --format=custom --file="$tmp" --dbname="$TRADE_OS_DATABASE_URL"
pg_restore --list "$tmp" >/dev/null
mv "$tmp" "$dest"
sha256sum "$dest" > "$dest.sha256"
chmod 600 "$dest" "$dest.sha256"
echo "Backup created and pg_restore catalogue verified at $dest"
echo "Encrypt and transfer securely; a catalogue check does not replace a restore drill."
