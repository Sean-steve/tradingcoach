#!/usr/bin/env bash
# Phase C — full-stack local certification, never touches hosted Supabase.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[[ -f .env.local ]] || { echo "Run bun run local:start before certification" >&2; exit 1; }
bash scripts/local/supabase.sh status >/dev/null
set -a
# shellcheck source=/dev/null
source .env.local
set +a
case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing to certify an external database" >&2; exit 1 ;;
esac
echo "Checking unit tests, TypeScript and standalone build..."
bun run test
bun run typecheck
bun run build
echo "Running live local pgTAP and Phase C API certification..."
bash scripts/local/supabase.sh test db
node scripts/local/certify-api.mjs
echo "Installing pinned, temporary Playwright runner..."
bun add --no-save playwright@1.64.1
bunx playwright install chromium
app_pid=""
if ! curl --silent --fail http://127.0.0.1:8080/ >/dev/null 2>&1; then
  bash scripts/local/dev.sh > /tmp/trade-os-local-certify-server.log 2>&1 &
  app_pid=$!
fi
cleanup() { [[ -z "$app_pid" ]] || kill "$app_pid" 2>/dev/null || true; }
trap cleanup EXIT
ready=0
for i in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8080/ >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
if [[ $ready -ne 1 ]]; then
  echo "TRADE OS server did not start. Check /tmp/trade-os-local-certify-server.log" >&2
  exit 1
fi
node scripts/local/certify-browser.mjs
node scripts/local/certify-worker.mjs
echo "Phase C local certification passed."
