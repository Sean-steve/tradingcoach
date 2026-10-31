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

## Phase E — automation and production packaging

The independent app has a protected 15-minute intelligence worker, DB liveness/readiness checks,
bounded batch processing and isolated production-container packaging. These changes do **not**
authorize use of a development Supabase stack as production infrastructure.

- **App health:** `GET /api/health`
- **Database readiness:** `GET /api/ready`
- **Protected queue status:** `GET /api/internal/intelligence` with a 32+ character Bearer secret.
- **Protected queue execution:** `POST /api/internal/intelligence` with the same token.
- **Preflight:** `bun run production:check` (requires approved production env values).
- **Release image:** `Dockerfile`; Compose and TLS sample under `deploy/`.
- **Backups:** `bun run ops:backup`; restore drills must use disposable DBs.
- **Local full certification:** `bun run local:certify`, now including real queued worker execution.

Read [the Phase E runbook](docs/development/PHASE_E_AUTOMATION_PRODUCTION_READINESS.md)
before configuring a server, linking any remote database or enabling GitHub Actions secrets.
**Remaining production blockers:** account currency/cash reconciliation (#8), React console
warning root cause (#9), remote security/staging, independent backups and restore proof.


## Phase F — staging verification and production safeguards

Phase F adds a staging-selectable production-equivalent Compose deployment, an environment marker in
`GET /api/health`, a **read-only remote staging verifier**, and separately protected manual
GitHub Actions gates for staging and production. Neither workflow deploys infrastructure, runs
migrations, executes queue jobs or turns on automated trading. **No live staging or production
environment has been activated.**

The staging verifier requires the exact full 40-character deployed `main` SHA, verified HTTPS,
real DB readiness, worker access denial for anonymous GET/POST and authenticated queue health.
The production verification gate additionally refuses to pass while issues #8 or #9 are open
and requires successful same-SHA foundation, database/browser, container and staging checks.

See [Phase F infrastructure and operator activation](docs/development/PHASE_F_STAGING_INFRASTRUCTURE_ACTIVATION.md).
