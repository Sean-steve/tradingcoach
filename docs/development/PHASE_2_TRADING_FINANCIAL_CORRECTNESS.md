# Phase 2 — Trading & Financial Correctness

Status: code implemented on review branch; database migration unactivated and unverified against a live TRADE OS project.

## Exact changes
- Binary contracts have explicit contract_type, outcome (pending/win/loss/push/void), expiry, stake, payout percentage, refund and fees.
- Binary profits are NET payouts: 100 stake @ 80% win -> +80; loss -> -100; fully refunded push/void -> 0 (excluding fees).
- The database calculates settlement P&L and result on INSERT/UPDATE, disallowing browser-supplied conflicting numbers.
- Import records carry deterministic source keys (broker ticket recommended, otherwise a hash of canonical row fields). The database uses a unique index and transaction-scoped RPC to prevent repeated imports from double-booking account P&L.
- Each batch of up to 500 rows is atomic. Earlier completed batches remain committed if a later batch fails; retrying is safe with stable source keys.
- Analytics include dedicated binary win/loss and payout metrics and exclude push/void outcomes from decisive win rate.
- Active-account analytics now respect the selected account; monthly and weekday reporting is UTC.
- Account financial review is read-only. It never automatically rewrites balances.

## Migration sequence (must use the correct TRADE OS Supabase project)
1. Back up the database and verify restore procedure.
2. Apply and verify `supabase/migrations/20261030170000_foundation_repair.sql` from Phase 1.
3. Apply `supabase/migrations/20261030220000_binary_options_and_import_integrity.sql`.
4. Confirm `tradeos_foundation_ready()` and `tradeos_phase2_ready()` return true using an authenticated user.
5. Verify winning/losing/void/push/pending binary transactions under the database trigger.
6. Confirm cross-account and cross-user imported records fail, no balance changes occur on duplicate imports, and balances change exactly once for unique trades.
7. Run read-only `tradeos_balance_variances()`, compare its results with actual broker statements, deposits, withdrawals, and allocation history. Do not auto-backfill legacy balances.
8. Check protected worker scheduling, queued intelligence revisions and correct report state after import.
9. Verify file upload E2E, multi-account dashboard, old spot trade workflows, and recovery from a failed batch.

## Known limits
- The live TRADE OS Supabase project is not accessible through this assistant's connected Supabase account. Migrations have NOT been applied, and staging E2E is pending.
- To avoid false claims, the UI refuses binary trades/imports before Phase 2 migration activates; ordinary trade journaling remains compatible.
- Identical CSV transactions without unique provider tickets share a deterministic key and may be treated as duplicates. Users must supply ticket mappings to preserve truly distinct identical transactions.
- CSV timestamps without explicit offsets are interpreted in the importing browser's local timezone.
- Historical trades are not silently reclassified as binary; manual classification/reconciliation is a separate supervised data migration.
- Payout-aware break-even figures assume fixed win profit per stake, full stake loss, and no fees unless otherwise indicated.
- The existing account allocation model requires a separate ledger reconciliation exercise; this phase adds visibility but does not mutate historical balances.
- Production-safe refresh performance, large imports, broker authority and alerting require staging testing.

## Acceptance checklist
- [ ] CI build, tests and typecheck pass
- [ ] Phase 1 migration activated and verified
- [ ] Phase 2 migration activated and verified
- [ ] Binary settlements checked with database inserts, edits and refunds
- [ ] Repeated imports skip duplicates and preserve account balances
- [ ] Cross-user resource isolation verified
- [ ] All historical balance discrepancies investigated
- [ ] Full account-level E2E review passed
- [ ] Production deployment explicitly approved

Do not declare Phase 2 production-certified while unchecked database items remain.
