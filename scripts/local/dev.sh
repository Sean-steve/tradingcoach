#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[[ -f .env.local ]] || { echo "Run bun run local:start first" >&2; exit 1; }
# Explicitly export server-only values for TanStack Start server functions.
set -a
# shellcheck source=/dev/null
source .env.local
set +a
exec bun run dev
