# TRADE OS — Independent Local Development

**Canonical branch: `main`.** Develop on short-lived feature branches; changes become authoritative only when merged to `main` with full CI gates. The project is independent of Lovable. See [Phase D consolidation](docs/development/PHASE_D_REPOSITORY_CONSOLIDATION.md) for merge history, local certification and known financial/React exceptions.

TRADE OS is a discipline-first trading journal and performance intelligence app. It is built with **React 19, TanStack Start, TypeScript, Supabase (PostgreSQL/Auth/Storage), and Nitro**, without depending on Lovable Cloud.

The previous Lovable-hosted database is **not** required for development. The tracked `supabase/config.toml` uses the isolated identifier `trade-os-local`. Never run `supabase link` or `supabase db push` against a project without a reviewed backup and explicit target validation.

## Requirements

- Bun, Node.js 22+, Docker with Docker Compose / Docker API, and Git.
- Supabase CLI (version **2.84.2**) installed, or allow `bunx supabase@2.84.2` to run it.
- At least 7 GB free memory recommended to start the full stack.

## Quick start (Linux / macOS / WSL)

```bash
bun install --frozen-lockfile
bun run local:start     # starts Docker-based Supabase and writes ignored .env.local
bun run local:verify    # migration list, pgTAP, two-user API smoke test
bun run local:dev       # exports server secrets and runs app on http://127.0.0.1:8080
```

- App: **http://127.0.0.1:8080**
- Local Supabase API: **http://127.0.0.1:54321**
- Local Studio: **http://127.0.0.1:54323**
- Email test inbox: **http://127.0.0.1:55424**

`local:start` creates a Docker network bound to localhost and applies every tracked migration, including Phases 1–4. Auth emails can be tested with the local inbox. New local signups use email/password; Google OAuth is hidden by default until configured in Supabase.

### Database commands

```bash
bun run local:verify           # read-only schema + API smoke (creates isolated test users)
bun run local:reset            # destructive LOCAL ONLY: drops all local data, reapplies migrations and seed
bun run local:stop             # stops local containers
bash scripts/local/env.sh --force # rewrite .env.local from current local Supabase
```

No production data is preloaded. The seed does not invent accounts or monetary values. The smoke script creates isolated users and synthetic trades solely on localhost. It refuses to write to any non-local URL.

## AI support without Lovable

The AI provider is optional. Without an AI provider, the app supplies deterministic descriptive reviews (no market signals or profit guarantees).

To use a local model such as Ollama, add **server-only** settings to the ignored `.env.local`:

```dotenv
AI_API_BASE_URL="http://127.0.0.1:11434/v1"
AI_MODEL="qwen3:4b"
# AI_API_KEY="" # optional for local providers
```

Other OpenAI-compatible HTTPS providers are possible with `AI_API_BASE_URL`, `AI_MODEL`, `AI_API_KEY`. Only send financial/trading data to providers after reviewing privacy and consent.

## Production and deployment (not part of local phases)

Server environment: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TRADE_OS_CRON_SECRET` and optional AI variables. Client environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Never expose the secret/service role key with `VITE_`.

```bash
bun run build
node .output/server/index.mjs
```

Nitro uses the Node server preset. Background intelligence processing is protected by `TRADE_OS_CRON_SECRET` and scheduled separately; local development can invoke the worker endpoint explicitly.

## Migration history

All original migrations and the Phase 1–4 repairs are preserved in `supabase/migrations/`. They are applied **in chronological order to a fresh local instance**, not copied into the previously inaccessible Lovable database. The correct remote database must be linked and migrated later through a separate backup-and-reconciliation process.

See `docs/development/PHASES_A_B_LOCAL_INDEPENDENCE.md` for security, CI certification and known limitations.
