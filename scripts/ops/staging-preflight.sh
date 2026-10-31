#!/usr/bin/env bash
# Read-only target verification before staging deploy. No remote mutations.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
env_file="${TRADE_OS_ENV_FILE:-.env.staging}"
if [[ "$env_file" != ".env.staging" ]]; then
  echo "Refusing unexpected staging env file: expected .env.staging" >&2
  exit 1
fi
[[ -f "$env_file" && ! -L "$env_file" ]] || { echo "Private .env.staging required" >&2; exit 1; }
if [[ "$(stat -c '%a' "$env_file")" != "600" ]]; then
  echo "Staging env file must be chmod 600" >&2; exit 1
fi
set -a
# File supplied and owned by trusted staging operator only.
# shellcheck disable=SC1090
source "$env_file"
set +a
[[ "${TRADE_OS_DEPLOYMENT_ENV:-}" == "staging" ]] || { echo "Staging environment marker required" >&2; exit 1; }
[[ "${TRADE_OS_HOST_PORT:-}" == "18081" ]] || { echo "Staging must bind port 18081" >&2; exit 1; }
[[ "${TRADE_OS_RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || { echo "Full 40-char release SHA required" >&2; exit 1; }
[[ "${TRADE_OS_STAGING_PROJECT_REF:-}" =~ ^[a-z0-9]{20}$ ]] || { echo "Explicit staging Supabase project ref required" >&2; exit 1; }
[[ "${SUPABASE_URL:-}" == "https://${TRADE_OS_STAGING_PROJECT_REF}.supabase.co" ]] ||
  { echo "Supabase URL does not match approved staging project ref" >&2; exit 1; }
[[ "${VITE_SUPABASE_URL:-}" == "${SUPABASE_URL}" ]] ||
  { echo "Browser API must match staging target" >&2; exit 1; }
[[ "${TRADE_OS_APP_URL:-}" == https://* ]] ||
  { echo "HTTPS app URL required" >&2; exit 1; }
[[ "${TRADE_OS_APP_URL}" != *example* && "${TRADE_OS_APP_URL}" != *localhost* ]] ||
  { echo "Placeholder/localhost app URL forbidden" >&2; exit 1; }
[[ "${TRADE_OS_PRODUCTION_PROJECT_REF:-}" != "${TRADE_OS_STAGING_PROJECT_REF}" ]] ||
  { echo "Staging and production project refs must differ" >&2; exit 1; }
command -v node >/dev/null || { echo "Node required" >&2; exit 1; }
node --experimental-strip-types scripts/ops/preflight.mjs
echo "Staging configuration preflight PASS: identity, isolation marker, HTTPS, secrets policy."
echo "Note: no live database migration, backup, DNS or restore has been verified."
