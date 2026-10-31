# Phase F.2 — Staging activation, historical financial reconciliation and release gates

**State as of 2026-10-31:** Source/CI hardening underway. The connected Supabase inventory provides only one project, **AGENCY OS v1** (inactive). No Trade OS staging project or accessible, verified staging VPS has been identified. No remote project was created, no migration applied, and no server or DNS changed. Do not represent a local Supabase Docker instance as independent staging.

## 1. Dedicated staging activation (operator-controlled, not completed)

1. Choose the target Supabase organization and approve any nonzero project cost **before project creation**. Create a new project specifically named TRADE OS — Staging. Never reuse AGENCY OS or an unknown project.
2. Record its 20-character project ref in the private staging environment and in GitHub protected environment `trade-os-staging` secret `TRADE_OS_STAGING_PROJECT_REF`. Also configure distinct prod ref in `trade-os-production` secret `TRADE_OS_PRODUCTION_PROJECT_REF`; do not use the staging project for production.
3. Create staging-only application DNS + TLS, a dedicated server with only ingress ports 80/443, loopback-bound app port 18081, a non-root deployment account, secrets stored outside Git, and an encrypted off-host backup destination.
4. Copy `deploy/.env.staging.example` to ignored `.env.staging` on the server, replace placeholders, `chmod 600`. Run `TRADE_OS_ENV_FILE=.env.staging bash scripts/ops/staging-preflight.sh`, refusing any mismatch. Deploy only to the approved staging project after a backup/restore plan and migration-history review.
5. Apply canonical SQL migrations **in order** after an explicit snapshot and human review. Do not apply the incompatible PR #2 Phase 2 migration; do not seed imported production data. Verify RLS, auth redirects, Storage, SMTP, queue, monitoring and exact 40-character SHA.
6. Run `Phase F Staging Verification` manually on **the same main SHA**. The verifier checks public HTTPS release/environment identity; read-only database financial-schema readiness; the exact Supabase project reference; worker anonymous denial and aggregate queue health. It performs no financial writes.
7. Complete a 24–48h operator-monitored staging window with alerts and negative-path recovery tests (duration is a recommendation, not automated evidence). A successful smoke check alone is not production certification.

**Environment secret names:** `TRADE_OS_APP_URL`, `TRADE_OS_CRON_SECRET`, `TRADE_OS_STAGING_PROJECT_REF` in protected `trade-os-staging`. `TRADE_OS_APP_URL`, `TRADE_OS_CRON_SECRET`, `TRADE_OS_PRODUCTION_PROJECT_REF` in protected `trade-os-production`. `TRADE_OS_STAGING_PROJECT_REF` in separate `trade-os-financial-review`. For both manual workflows, set environment protection (required reviewers), restrict to `main` and never paste secret values into workflow inputs. The available GitHub connector cannot configure these protected environments and secret permissions.

## 2. Read-only historical financial audit

Use the newly added `scripts/ops/historical-financial-audit.sql` in an **approved, exclusively Trade OS** database with **read-only** operator credentials. The query begins a repeatable-read, READ ONLY transaction, and reports four areas:

- Account-by-account starting balance + settled trade P&L + net recorded deposits/withdrawals = expected booked balance; compare independent balance event deltas.
- Currency unreviewed, trade currency mismatch, cash movement owner/currency mismatch, unexpected journal variance.
- Missing, duplicate or incorrectly signed linked cash balance events.
- Duplicate canonical import identities and unverified historical provenance.

**No backfills, corrections, transfers or updates are performed.** Every account must be externally reconciled against broker/bank statements and source import histories; even `MATCHES_RECORDED_LEDGER_NOT_BROKER_VERIFIED` means only internal arithmetic matched, not that external funds exist.

Safe manual procedure on an approved operator host (do not run against AGENCY OS):

```bash
umask 077
: "${TRADE_OS_AUDIT_READONLY_DATABASE_URL:?Read-only Trade OS audit DB URL required}"
mkdir -p ./private-audit
chmod 700 ./private-audit
psql -X -v ON_ERROR_STOP=1 \
  -d "$TRADE_OS_AUDIT_READONLY_DATABASE_URL" \
  -f scripts/ops/historical-financial-audit.sql \
  > ./private-audit/reconciliation.txt
chmod 600 ./private-audit/reconciliation.txt
sha256sum ./private-audit/reconciliation.txt
```

Do not commit, upload to a public artifact, or paste report contents into chat. Encrypt off-host, preserve DB snapshot timestamp, redact personal data in review summaries, and retain accountable reviewer approval. If there is no existing Trade OS historical database, record **zero historical records verified**, not "all historical records reconciled".

## 3. React warning and strict browser gate

Issue #9 was tracked because the previous browser verifier *allowed* the one React 19 pre-mount warning. F.2 removes the allowlist and treats **every** browser console error and page exception as a failed certification. The root auth subscription now defers query/router invalidation until after the render phase and cancels scheduled work on unmount; the login session effect rejects late redirects after unmount. A full local authenticated browser certification and production-container build must pass the strict gate before issue #9 can be closed. If the warning persists, inspect logs and keep issue #9 open; do not weaken the assertion.

## 4. Production release gate and human review

The production workflow is **verification-only, not deployment**. Its exact-current-`main`-SHA admission requires:

- Closed blocker issues #8 and #9, with documented evidence;
- same-SHA Foundation CI, full-system local certification, production-container smoke and live staging smoke;
- same-SHA protected manual `Phase F.2 Financial Release Review`, including hashes of privately retained historical audit and actual restore evidence, an exact staging project ref, and explicit operator approvals.

The manual review **checks metadata and operator assertions, not the contents of the private source evidence**. If the underlying evidence is missing, this check must not be run or regarded as proof. Both live staging and production remain gated by project selection, infrastructure, secrets, DNS/TLS, migrations, real reconciliation, backup/restore and external approval.

**Do not close issue #8 merely because local finance tests pass. Do not activate production automatically.**
