#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
echo "Resetting ONLY the isolated TRADE OS local Supabase database (all local test data will be lost)."
bash scripts/local/supabase.sh db reset --local --yes
echo "Database reset completed. Run bun run local:verify to recheck the schema."
