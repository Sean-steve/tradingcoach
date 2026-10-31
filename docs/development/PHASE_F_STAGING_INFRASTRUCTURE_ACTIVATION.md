# TRADE OS — Phase F: Staging Infrastructure & Production Activation

**Current implementation status:** Staging and production verification tooling delivered in code. **No live TRADE OS staging or production infrastructure has been provisioned, accessed, migrated or deployed.** No live production activation claim is permitted.

## Baseline / authoritative environment
- Source: `Sean-steve/tradingcoach`, `main`; React/TanStack Start, Nitro, Supabase Postgres/Auth/Storage.
- Phase E has a production image, cron, safety controls, TLS example, backup + disposable-restore scripts and local full-stack tests.
- Existing release debts: issue **#8** (cash ledger/multi-currency transactional correctness), issue **#9** (React async render warning). Neither can be waived by a passing build.
- User-selected local database remains independent. **Do not point Supabase CLI migrations, test fixtures or destructive smoke scripts at a live project.**
- This repository has no authenticated access to a deployed TRADE OS server, DNS zone, certificate manager, operational backup target or live release credentials.

## A. Staging environment provisioning (external operator)
1. Provision a **new, isolated** Supabase staging project or correctly operated self-hosted Supabase stack. Never reuse the local CLI stack, a different product's project, or production database. Record the project identity in a private operations register. Review current Supabase environment / production guides first.
2. Configure Auth Site URL and allowlist staging HTTPS redirects, email confirmations/custom SMTP, redirect/deep-link behavior, Storage permissions, PostgreSQL RLS, pool sizing, SSL enforcement, database network restrictions and security/performance advisors. Keep elevated keys server-only. Validate **user-to-account isolation**.
3. Apply migrations only after reviewed target identification, a fresh staging snapshot, a migration history diff and explicit approval. Do not use `supabase db push` against an unknown target. **Never apply the divergent Phase 2 migration from PR #2.**
4. Configure encryption and **off-host** PostgreSQL backups, secret rotation, retention, incident notifications and scratch-database restore; separately prove restored API/auth/data access. Record actual measured RPO/RTO.
5. Install Docker/Compose, reverse proxy, TLS, firewall rules, server logs and monitoring on the approved staging host. Make only 80/443 public. The app bind is localhost-only; the Supabase DB and privileged APIs must not be exposed via app container ports.
6. Create ignored repo-root `.env.staging` from `deploy/.env.staging.example`; keep `chmod 600`. Set SHA to the exact commit being deployed. Build-time `VITE_` values are **public**, no privileged API/database credentials may be put there.

## B. Staging release (operator on staging server)

```bash
git checkout main
git pull --ff-only
cp deploy/.env.staging.example .env.staging
chmod 600 .env.staging
# Edit staging-only credentials privately (do not print them / commit this file).
set -a; source .env.staging; set +a
bun run production:check
TRADE_OS_ENV_FILE=.env.staging TRADE_OS_HOST_PORT=18081 docker compose \
  --project-name trade-os-staging --env-file .env.staging \
  -f deploy/compose.prod.yml up -d --build
curl --fail http://127.0.0.1:18081/api/health
```

Install a **staging-specific** reverse proxy and genuine TLS certificate directing to `127.0.0.1:18081` (the existing Nginx example is for port 18080; copy and update it). Confirm redirect, HSTS, secure cookies, CSP and no cross-origin credential leakage. Ensure `TRADE_OS_DEPLOYMENT_ENV=staging` and `TRADE_OS_RELEASE_SHA` actually reach the container.

GitHub → Settings → Environments: create `trade-os-staging` and `trade-os-production`; configure environment-scoped `TRADE_OS_APP_URL`, `TRADE_OS_CRON_SECRET` and **required reviewers for production**. Use different credentials and URLs for each environment. A repository-level worker cron secret is not a substitute for separated environment secrets.

Run `TRADE OS — Phase F Staging Verification` via Actions **from main** and provide the exact deployed 40-character SHA. It verifies real public HTTPS and environment identity; live database readiness; unauthorized GET and POST denial; and authorized **read-only** queue health. It never dispatches the queue worker, creates users, applies migrations or mutates trades. Store its workflow run URL as evidence.

## C. Production release gates (mandatory, not bypassable by optimistic reporting)
- [ ] Issue #8 account currency / cash movements / reconciliation resolved with schema review and audited tests.
- [ ] Issue #9 React async warning fixed with regression tests, browser allowlist removed.
- [ ] All three original CI suites green on the exact release SHA.
- [ ] Staging remote verification green at the same SHA and its evidence recorded.
- [ ] Staging auth, RLS, Storage, financial lifecycle and cross-user tests executed **in an isolated staging-only dataset**, with written evidence; do not use local certification as a substitute.
- [ ] Encrypted offsite backup exists; isolated full restore and application verification are evidenced.
- [ ] Security review, TLS, DNS, incident alerts, monitoring and rollback operator are signed off.
- [ ] Production Supabase project identity, separately provisioned credentials, migration history, and current backup reviewed; any live schema change approved in advance.
- [ ] Rollback plan uses the prior immutable image + database forward-fix / restore decision; no unreviewed down-migration.

Only after all gates pass: release a **pinned commit or image digest** using `.env.production` on an approved production host, with separate Compose project and port 18080; configure TLS ingress and observe readiness. Production `TRADE_OS_DEPLOYMENT_ENV=production` must be set. Activate scheduled worker **after** production readiness and queue runbook approval; do not configure repo-level cron secrets prematurely. Run `TRADE OS — Phase F Production Gate (No Deployment)` to validate external production state. The workflow refuses open #8/#9 and missing same-SHA CI/staging evidence; it **verifies only**, and does not itself deploy or migrate.

## D. Rollback and operational handover
- Capture immutable image digest, commit SHA, schema migration IDs, maintenance owner and a fresh verified backup before production cutover.
- If app-only regression: remove traffic / stop worker, redeploy previous known-good image with compatible schema, run readiness + RLS/financial smoke, then resume only after owner approval.
- If irreversible DB/schema/data corruption: stop writes and worker; restore only through reviewed disaster-recovery procedure into verified isolated infrastructure. Never blindly `supabase db reset` or `db push` against production.
- Alert on 503 readiness or queue degradation; log release SHA and incident window, not service keys, PII or account details. Monitor initial 48 hours.
- No production trading/broker authority is granted by this software release.

## E. Acceptance summary
**Implemented in repository:** staging-aware compose overrides, deployment-environment marker, read-only external HTTPS smoke, failure tests, staging evidence workflow, production evidence gate and runbook.

**Blocked externally:** new TRADE OS staging/production infrastructure and credentials, live database migration/certification, restore proof, issue #8/#9 remediation, protected environment setup and real production cutover. Phase F is therefore **implementation-ready but not activated**.
