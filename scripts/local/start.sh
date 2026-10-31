#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo "Docker is required for local Supabase" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Start the Docker daemon first" >&2; exit 1; }
# Restrict containers to loopback on untrusted LANs (see Supabase local docs).
NET="trade-os-local-network"
if ! docker network inspect "$NET" >/dev/null 2>&1; then
  docker network create -o 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' "$NET" >/dev/null
fi
bash scripts/local/supabase.sh start --network-id "$NET"
bash scripts/local/env.sh
echo "TRADE OS local stack configured. Start app with: bun run local:dev"
