#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
bash scripts/local/supabase.sh status >/dev/null
bash scripts/local/supabase.sh migration list --local
bash scripts/local/supabase.sh test db
if [[ -f .env.local ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env.local
  set +a
  node scripts/local/smoke.mjs
else
  echo "Skipping API smoke: .env.local not generated yet."
fi
