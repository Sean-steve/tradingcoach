# TRADE OS v2 — Phase E: Automation & Production Readiness

**Status:** local/infrastructure implementation with CI gates; no production or remotely linked Supabase project has been accessed or changed.

## 1. Purpose

Build an independently deployable, monitored, recoverable, secure TRADE OS backend while retaining a discipline-first trading journal and evidence-based coach. **No automated order placement, guaranteed profits, or unverified cash redemption.**

### Implemented

| Workstream | Source | Acceptance |
|---|---|---|
| Worker isolation | `src/routes/api/internal/intelligence.ts`, `src/lib/worker-governance.ts` | Constant-time bearer secret, max 4 jobs, scrubbed errors, no public queue details |
| Queue monitoring | protected `GET /api/internal/intelligence` | 200 healthy; 503 on overdue/failed work; status counts only |
| Cron automation | `.github/workflows/intelligence-queue.yml` | 15-minute polling, non-overlap, secret activation, HTTPS, rejects failed jobs and degraded queue |
| Liveness | `GET /api/health` | 200 when server process responds; exposes only release identifier |
| Readiness | `GET /api/ready` | 200 only after real privileged PostgreSQL API round-trip; 503 when DB is unavailable |
| Production config | `src/lib/production-preflight.ts` / `bun run production:check` | Fatal on missing auth keys, weak worker secret, HTTP on public endpoints, VITE-secret exposure |
| Image packaging | `Dockerfile`, `deploy/compose.prod.yml` | multi-stage Bun/Node, non-root, read-only container, localhost bind, no database inside app container |
| TLS ingress | `deploy/nginx/trade-os.conf.example` | template requiring operator-managed certs, HTTPS redirect, no public database ports |
| Backup/recovery | `scripts/ops/backup.sh`, `restore-rehearsal.sh` | explicit intent and credential handling, archive inspection, no destructive remote reset |
| Financial safety | `20261031180000_phase_e_financial_guard.sql` | opening capital editable before any trade, immutable once trading/ledger exists |
| AI safety | `src/lib/*functions.ts`, `src/lib/coach.server.ts` | quota enforcement fails closed, user/account IDs explicitly bound |
| Automated certification | `.github/workflows/phase-c-local-certification.yml`, `production-container.yml` | real queue processing, DB + RLS + financial checks, 40 UI checks, isolated production image smoke |

## 2. Local development and full automation test

```bash
git switch feat/phase-e-automation-production-readiness-20261031
bun install --frozen-lockfile
bun run local:start
bun run local:certify
```

Only `127.0.0.1` / `localhost` targets are accepted by the certification runners. Local test data creates unique users and trades, never writes to a remote DB. CI additionally tests a production Node container with **no real secrets**. Once the PR is certified and merged, use `main`.

## 3. Production preflight — before any deployment

**No production credentials are in this repository.** Operator must provision a **separate production Supabase** stack, database backup service, Auth/Storage access controls and a secured HTTPS domain. Development CLI Supabase is **not** a production server.

Provision private `.env.production` (chmod 600) with:

```dotenv
NODE_ENV=production
SUPABASE_URL=https://supabase.example.com
SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_PUBLIC_API_KEY
SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_PRIVATE_SERVER_KEY
VITE_SUPABASE_URL=https://supabase.example.com
VITE_SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_PUBLIC_API_KEY
TRADE_OS_CRON_SECRET=REPLACE_WITH_A_RANDOM_SECRET_64_PLUS_CHARACTERS
TRADE_OS_APP_URL=https://trade.example.com
TRADE_OS_RELEASE_SHA=REPLACE_WITH_FULL_GIT_SHA
VITE_ENABLE_GOOGLE_OAUTH=false
TRADE_OS_WORKER_BATCH_SIZE=2
```

These are examples, **not working credentials**. Set `TRADE_OS_PUBLIC_SUPABASE_URL` when the trusted internal server URL differs from the browser-facing HTTPS URL. Private HTTP for the internal connection requires `TRADE_OS_PRIVATE_DB_HTTP=yes` and proven private networking.

```bash
set -a; source .env.production; set +a
bun run production:check
```

Only proceed with **zero blockers**. Warnings require owner acknowledgement; offline deterministic coaching is acceptable if explicitly chosen. Do not copy the local `.env.local` into production.

## 4. Infrastructure release sequence (operator action required)

1. Create **staging** Supabase or securely self-host Supabase using its official deployment, **not** `supabase start` or its local Docker services. Configure private network, TLS, Auth confirmation/redirects, Storage, RLS and backups.
2. Snapshot staging, inspect existing migration history and rehearse all canonical migrations in chronological order. Do **not** apply alternate Phase 2 schema from the preserved branch (issue #8).
3. Run full staging E2E tests with staging-only test accounts. Confirm bank/broker authority is not implied by journal P&L.
4. Build the application from the approved Git commit:
   `docker compose --env-file .env.production -f deploy/compose.prod.yml up -d --build`.
   The app binds to **127.0.0.1:18080** only; enable the reverse-proxy sample after installing real certificates and updating `server_name`.
5. Probe `/api/health` then `/api/ready`. Confirm no browser-visible service key, that unauthenticated `/api/internal/intelligence` returns 401 and authenticated worker GET is only accessible over TLS.
6. Configure GitHub Actions repository secrets `TRADE_OS_APP_URL` and `TRADE_OS_CRON_SECRET` **only after** staging then production gates pass. The schedule runs every 15 min and fails on staleness/job errors; connect GitHub Actions failure alerts to your preferred incident channel.
7. Monitor 24–48h in staging, then release to production with verified backup and rollback instructions. If queue is failed, investigate rather than repeatedly pushing new updates. GitHub CI success does **not** prove production readiness.

## 5. Backup and disaster recovery

Supabase self-hosting places database backup/restore, snapshots and off-site replication under operator responsibility. The scripts are intentionally **not** scheduled or run until secure storage, approved credentials and a scratch restore target exist.

```bash
export TRADE_OS_DATABASE_URL='<private Postgres DSN>'
export TRADE_OS_BACKUP_DIRECTORY='/encrypted/tradeos-backups'
export TRADE_OS_BACKUP_TARGET=production
export TRADE_OS_PRODUCTION_BACKUP_APPROVED=YES
bun run ops:backup

# Disconnected EMPTY disposable DB; NEVER a production URL:
export TRADE_OS_RESTORE_URL='<new disposable Postgres DSN>'
export TRADE_OS_RESTORE_APPROVED=YES
bun run ops:restore-rehearsal -- /encrypted/tradeos-backups/<backup>.dump
```

Do not paste these URLs or credentials into PRs, logs or chat. `pg_restore --list` is an integrity sanity check only; a complete restore rehearsal must be proved separately. Enable off-host encrypted snapshots with retention and tested key escrow. Record test evidence and actual recovery duration before promising an RPO/RTO. Scripts have **no deletion policy**; configure operator-approved retention separately.

## 6. Security/financial release gates

- [ ] Correct production environment and HTTPS endpoints verified
- [ ] No browser-exposed secrets; RLS, server ownership and service-role separation verified
- [ ] Opening capital frozen once any trade or balance-ledger event exists
- [ ] **Issue #8:** cash deposits/withdrawals, account-specific currency segregation, and FX/no-cross-currency aggregation reconciled into canonical model, with a backup and tests
- [ ] **Issue #9:** React unmounted state warning root cause fixed; temporary warning allowlist removed
- [ ] Direct broker ingestion **NOT ENABLED** until provider-specific authentication, webhook signature/nonce/idempotency, reconciliation and authorization tests exist
- [ ] OCR/voice trade input **NOT ENABLED** until provenance, consent and human confirmation are implemented
- [ ] Protected queue job processor: UTC timestamps, stale leases, retry, alert and backpressure checked under load
- [ ] Restore rehearsal from encrypted backup into an isolated database succeeded
- [ ] Staging TLS, permissions, error logging, browser, mobile and queue tests passed
- [ ] Deployment/rollback owner approved
- [ ] Production monitoring and incident notifications connected

### Do not assume

- Running `supabase start` on a VPS is production Supabase. It is **development tooling only**.
- A trading P&L is withdrawable funds.
- A reward's self-reported transfer is verified cash.
- A backtest means profitable future trading.
- Passing a local CI suite means the production API, broker adapters, OCR, voice, AI model and disaster recovery are verified.

## 7. Release verdict

Phase E code becomes **locally certified** only when the application, database, worker and Docker release tests pass in the same PR and again on merged `main`. **Production authorization and deployment remain blocked** until the checklist above is closed with real infrastructure and owner approval.
