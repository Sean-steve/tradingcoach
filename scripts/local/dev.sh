#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[[ -f .env.local ]] || { echo "Run bun run local:start first" >&2; exit 1; }
# The local command never starts the app with a remote Supabase URL.
case "$(grep '^SUPABASE_URL=' .env.local | head -n 1)" in
  'SUPABASE_URL="http://127.0.0.1:'*|'SUPABASE_URL="http://localhost:'*) ;;
  *) echo "Refusing to use non-local Supabase in local:dev. Re-run local:env --force." >&2; exit 1 ;;
esac
# Explicitly export server-only values for TanStack Start server functions.
set -a
# shellcheck source=/dev/null
source .env.local
set +a
exec bun run dev
