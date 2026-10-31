# TRADE OS — Phase F.1 Financial Correctness & Staging Provisioning

**Branch/authority:** short-lived feature branch -> reviewed PR -> `main`. **Production activation is NOT authorized by this work.** This release requires the externally provisioned TRADE OS staging database, TLS hostname, off-host backups and operator credentials before a real staging verdict exists.

## Canonical schema reconciliation (alternate PR #2 is not applied)

| Divergent branch #2 | Canonical, additive Phase F.1 |
|---|---|
| `instrument_type=binary_option` | Retain `contract_type=binary`; no alternate settlement trigger |
| `binary_expiry_at` | Retain `expires_at` |
| `binary_payout_ratio` | Retain `payout_percent` (percentage, NOT ratio) |
| `binary_settlement` | Retain `binary_outcome` (pending/win/loss/push/void) |
| `binary_refund_amount` | Retain `refund_amount` |
| `source_trade_id`, `import_fingerprint` | Retain canonical `source_key` + scoped `(user_id, account_id, import_source, source_key)` unique index |
| `currency` default on all historical rows | Existing accounts require explicit review; historical trade currencies stay NULL (unreviewed) |
| Cash movement table | Privileged, authenticated, idempotent `tradeos_record_cash_movement` RPC with account row lock and transactional cash + audit entries |
| Import run counters | Server-authored `trade_import_runs` entries on each canonical CSV RPC; duplicate rows stay skipped |
| Read-only account reconciliation | `tradeos_account_reconciliation` includes starting capital, closed P&L, net recorded cash and variance |
| Single-currency grouping | UI groups by confirmed account currency; unknown historical currency is displayed as unreviewed; never sums USD with KES or other currencies |

## Financial authority and invariants

**Expected booked balance = immutable starting balance + realized closed-trade P&L + net recorded deposits − recorded withdrawals.** The account's `current_balance` is updated by database triggers within the cash/trade transaction. Positive amounts use NUMERIC(18,2), no floating point in PostgreSQL.

A cash movement is *self-recorded, not bank-verified*. It **does not** initiate a transfer, clear settlement, or imply broker-side funds exist. Unique (account,idempotency_key) prevents replay and rejects mismatched payloads. Clients may only invoke the explicitly owned-account RPC; they cannot directly insert/update/delete cash ledger rows. Balance events link to movement IDs; deletions of trade rows continue to obey historical FK ON DELETE SET NULL, so privileged database event history must be handled under an operator data retention policy.

Profit allocations are **earmarks only**, do not subtract from stored booked balance; serialized guards prevent users from earmarking more than realized, unallocated profits. The UI now displays separately grouped booked balance / realized P&L / earmarked profit per currency.

No implicit FX conversion. Trades inherit their account's confirmed currency on new writes. Transfers of trades across differing or unreviewed currencies are denied. Historical accounts have `currency_confirmed_at=NULL` even though a compatibility `currency='USD'` default is present; **this is NOT a claim about original historical settlement currency**. Historical trades retain `currency=NULL`. Existing accounts with trade/ledger history require a reviewed, manual, non-destructive currency-and-balance reconciliation before remote activation. There is **no automatic backfill or overwrite**.

**Import scope:** canonical CSV imports only. This is not authenticated broker ingestion or bank reconciliation. Provider verification, webhook authentication, encrypted provenance, and broker statements remain outside F.1 and cannot be declared certified by import-run logs.

## Testing and certification

A brand-new **local** Supabase instance runs migrations in order. Full-system CI executes:
- unit/build/TypeScript, pgTAP checks, existing financial lifecycle;
- `node scripts/local/certify-finance.mjs`: real owned users, idempotent deposit, replay, foreign-user denial, overdraft denial, withdrawal, cash append-only, trade P&L, allocation earmark, cross-currency move refusal, canonical import rollback/dedupe, import run audit, reconciliation;
- browser/worker certification, then production container smoke.

The local finance test **refuses every non-loopback URL**. Do not run `local:reset`, production `db push`, fixture creators, or test database scripts against staging or production. Existing production accounts must get a read-only variances report and independent reconciliation worksheet; no silent live migration/backfill.

## Staging provisioning — safe handoff

No TRADE OS staging project has been identified from the connected Supabase account; the only project exposed in that integration was an unrelated, inactive **AGENCY OS v1**. It must not be reused. Provisioning a new hosted project can incur a fee and requires explicit operator cost approval. This PR intentionally **does not create billable remote projects or contact a VPS**.

1. Provision a **dedicated staging Supabase** instance (new project or a production-grade self-hosted stack, not `supabase start`). Record the exact project reference and compare it with a separately recorded production reference. Enable Auth email confirmation, staging-only redirects and SMTP, private Storage, RLS audit, database SSL/network restrictions, MFA and backups.
2. Allocate a staging hostname, TLS certificate and staging host. Install the staging Nginx template, bind Trade OS only to `127.0.0.1:18081`, expose only 80/443 externally and protect privileged network/DB ports. No demo live data.
3. On the staging server, create ignored `.env.staging` with permissions 600, using `deploy/.env.staging.example`. Populate `TRADE_OS_STAGING_PROJECT_REF` and explicit `TRADE_OS_PRODUCTION_PROJECT_REF` (the refs must differ), `TRADE_OS_DEPLOYMENT_ENV=staging`, `TRADE_OS_HOST_PORT=18081` and the exact full release SHA. Do not commit or share secrets.
4. Execute `TRADE_OS_ENV_FILE=.env.staging bash scripts/ops/staging-preflight.sh`. The script checks **configuration only**, not server or database readiness. Do not deploy on failure.
5. Review immutable target identity, existing migration history, backup and recovery strategy. Only then, after operator approval, apply canonical migrations to staging **in order**. Never apply the incompatible PR #2 migration. Document and investigate historical variances before allowing trade/account operations.
6. Release the approved image using `TRADE_OS_ENV_FILE=.env.staging TRADE_OS_HOST_PORT=18081 docker compose --project-name trade-os-staging --env-file .env.staging -f deploy/compose.prod.yml up -d --build`; configure valid HTTPS ingress.
7. Create protected GitHub Actions `trade-os-staging` environment with separate `TRADE_OS_APP_URL` and `TRADE_OS_CRON_SECRET` secrets. Run manual **Phase F Staging Verification** with exact `main` SHA. Record full audit evidence (auth, RLS, finance, import, browser, backup restore and alerts) separately; the remote smoke test is intentionally read-only.
8. After staging proves 24–48h of acceptable behavior and issues #8/#9 are closed with evidence, run the controlled production promotion gate from Phase F.1's parent phase. Production remains explicitly not activated here.

## Remaining gates / no claims

- Remote staging project identity, DNS/TLS, MFA, SMTP, RLS and storage not yet checked;
- No staging migration, backup or restore drill completed;
- Issue #9 React warning remains a separate production-release blocker;
- Issue #8 may only close after this implementation's **real local finance tests** pass, and a formal assessment that no unreconciled dashboards silently mix currencies exists;
- Independently reconciling any *actual historical* account balances is required before migration of remote user data.

**Decision:** do not infer production readiness from GitHub CI alone.
