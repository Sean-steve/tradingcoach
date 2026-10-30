# TRADE OS v2 — Codebase Reconciliation & Foundation Repair

**Branch:** `fix/foundation-reconciliation-20261030`
**Baseline:** `de47adba4096e6ed14e541bff92959d6de4b9900`
**Status:** Engineering changes committed on a review branch; migration NOT applied to production; live E2E NOT certified.

## 1. Reconciled foundation
- Preserve all existing screens, historical trades, and Lovable integration.
- New trades now require and reference an active TOM version; older trades retain their historical state.
- The intelligence pipeline evaluates pinned trades using the associated TOM version, not the current manual.
- The Truth Engine now uses conservative expected-count gates, an interval for differences in win rate, and a Benjamini–Yekutieli false-discovery-rate adjustment across overlapping segments. Adjusted q-values are NOT posterior probabilities.
- Insight and recommendation identities are preserved by upsert. Stale findings are invalidated or marked non-current, not deleted as history. Evidence rows and graph projections remain materialized outputs that are refreshed.
- Trade balances are recalculated by database triggers in the same transaction as trade insertion, update, or deletion, with an append-only delta ledger.
- A per-account intelligence queue is populated by trade triggers, including a first refresh for existing accounts. Workers use claim/finish RPCs with retry, lease expiry and revision checks.
- The external worker endpoint is protected by a long random bearer secret and uses a server-only service-role client.
- Hourly AI function quotas are recorded by atomic Postgres RPC; user-editable AI request log permissions are revoked.
- Settings, Rewards, and Forecasting now respect the active account.
- Added Node 22 foundation tests and GitHub Actions build/typecheck workflow.

## 2. Required deployment order
1. Create a database backup / restore point of the **correct** TRADE OS Supabase project.
2. Review migration `supabase/migrations/20261030170000_foundation_repair.sql` against staging database, then apply **before** deploying app changes. Do not apply to an unrelated project.
3. Test RLS ownership, TOM version references, trade insert/update/delete deltas, retry/lease behavior and rate limiting against staging.
4. Deploy app code with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and **server-only** `SUPABASE_SERVICE_ROLE_KEY`.
5. Set a random 32+ character `TRADE_OS_CRON_SECRET` in the app's server environment.
6. Configure GitHub Actions secrets `TRADE_OS_APP_URL` and `TRADE_OS_CRON_SECRET` (must match the app secret); enable actions for the repository.
7. Invoke `POST /api/internal/intelligence` with `Authorization: Bearer <secret>` and confirm jobs leave `pending` to `succeeded`.
8. Verify subsequent trade creation enqueues newer revisions, no double counting occurs, and the coach displays only currently validated insights.
9. Complete full regression/E2E testing before merging to `main`.

## 3. Existing balances: important migration warning
Do **not** overwrite prior balances blindly. The old app updated `accounts.current_balance` in the browser; current values may include differences not represented in trade rows (manual changes, transfers, or import anomalies). The new trigger only applies **future trade deltas**. It intentionally does not backfill or rewrite old balances.

Read-only discrepancy query for authorized operations:

```sql
SELECT a.id, a.name, a.starting_balance, a.current_balance,
       a.starting_balance + COALESCE(SUM(t.pnl) FILTER (WHERE t.result <> 'open'),0) AS expected_from_trades,
       a.current_balance - (a.starting_balance + COALESCE(SUM(t.pnl) FILTER (WHERE t.result <> 'open'),0)) AS variance
FROM public.accounts a
LEFT JOIN public.trades t ON t.account_id = a.id
GROUP BY a.id, a.name, a.starting_balance, a.current_balance;
```

Reconcile any variances against broker/account statements and `profit_allocations`; do not automatically replace `current_balance` with the calculated figure.

## 4. Known remaining limitations / prerequisites
- The Supabase account accessible through this assistant exposes only an unrelated inactive project; TRADE OS database migration and live tests could not be run here.
- Scheduled processing requires a running app deployment and correctly configured GitHub secrets. The workflow gracefully skips if secrets are absent.
- The current pipeline still recomputes across an account's entire trade history and uses non-transactional writes across some derived tables. Queued retry and stable IDs mitigate, but do not fully replace a transactional outbox/read-model architecture.
- Existing historical trades without `tom_version_id` remain unpinned; the pipeline uses legacy account-level limits rather than inventing their historical manual.
- Manual publication still uses the UI's two-step deactivation/insertion and should be replaced by an atomic publishing RPC before enterprise rollout.
- Canonical behavior taxonomy and complete custom-rule evaluation remain separate follow-up work.
- Binary-options payout/expiry contract modelling and real-life reward budgeting are not part of this foundation patch.
- Full incident response, privacy exports, integration adapters, OCR, voice and wearables remain future sprints.
- Production security certification, restoration drills, accessibility audits, and load testing remain pending.
- Do not merge without CI and a staging migration dry-run.

## 5. Acceptance criteria for this repair
- Node foundation tests pass.
- TypeScript compilation and production build pass.
- Trade creation succeeds only with active TOM and stores the correct version.
- New and updated closed trades alter account balance exactly once inside the transaction; failed inserts cannot change balance.
- Cross-user account/TOM references are rejected.
- Repeated intelligence runs preserve stable insight/recommendation IDs and lifecycle history.
- A pending intelligence job is claimed, processed and finalized by a correctly authenticated scheduler.
- A failed worker job retries with backoff without losing a concurrent new revision.
- AI rate limits reject excess requests without exposing internal credentials.
- Existing and new reports remain consistent with the underlying trades.

## 6. Review process
This branch intentionally targets a pull request into `main`. The repair must not be represented as production-certified before the correct Supabase project, migration dry-run, and CI outputs have been verified.
