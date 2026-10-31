#!/usr/bin/env bash
# Shared pinned CLI invocation. Use installed Supabase CLI when available, or
# Bun's package runner with an explicit tested stable CLI version.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if command -v supabase >/dev/null 2>&1; then
  exec supabase "$@"
fi
if ! command -v bunx >/dev/null 2>&1; then
  echo "Install Bun and the Supabase CLI before continuing." >&2
  exit 127
fi
exec bunx supabase@2.84.2 "$@"
