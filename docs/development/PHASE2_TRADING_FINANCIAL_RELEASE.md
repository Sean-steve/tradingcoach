# TRADE OS v2 — Phase 2: Trading & Financial Correctness

**Implementation status:** Code and SQL migration committed on `feat/phase2-trading-financial-correctness`; GitHub CI must pass. Live database migration, cash reconciliation and E2E signoff are **NOT COMPLETE**.

## Scope and source of truth
This phase extends the existing trading journal rather than introducing parallel trading databases:
- Binary options as a first-class `instrument_type='binary_option'`.
- Net payout ratio, contract expiry, settlement, stake, optional principal rebate and fee treatment.
- Database-calculated settlement; the user-supplied net P&L for binary contracts is ignored by the trigger.
- User-account currency classification, accurate multi-currency handling (no FX conversion).
- A separate cash movement ledger for manually recorded deposits and withdrawals.
- Exact database-wide reconciliation RPC for legacy balances (no automatic rewrite).
- Idempotent CSV import with broker IDs/fingerprints, source timestamps and import runs.
- Dashboard, performance reports, trade details and breakdowns aligned to active account currency.
- Closed-loop tests for payout calculations, refunds, anomalies, FX segregation and import replay.

## Financial contract
**Binary payout percent is net profit as a share of stake**, not gross return. For stake 100.00, payout 80%, fees 2.00:
- WIN: net P&L = +78.00. The original 100 stake returned on win is **not** booked as profit.
- LOSS (no rebate): net P&L = -102.00.
- LOSS with 10.00 principal rebate: net P&L = -92.00.
- PUSH/VOID: full stake refunded; net P&L = -2.00 when fees of 2.00 apply.
- OPEN: no realized P&L and no recognized fees.
- Contract win rate excludes PUSH/VOID; P&L and expectancy reflect their fees where applicable.
- Break-even win probability for fixed stake, payout and fees: (stake + fees - expected loss rebate) / (stake*(1 + payout ratio) - expected loss rebate). This is an arithmetic threshold, **not** a prediction.

Postgres performs authoritative numeric(18,2) settlement in `tradeos_binary_contract_normalize`. The isomorphic TypeScript calculator gives an immediate UI preview. The database trigger prevents spoofing.

## Accounting distinctions
- **Trading balance** = prior booked cash + realized trade P&L + actual recorded deposits - actual recorded withdrawals.
- **Profit allocations** (tax/reinvest/reserve/withdraw earmarks) are planning labels, not proof of funds leaving the account. Allocations **do not** change cash balance.
- Account currencies are independent. USD and KES are never added to one monetary total.
- Financial history is authoritative **only after** the correct database migrations and reconciliation procedures have been verified.
- Historical `current_balance` was mutated by the browser. It may diverge from broker statements or the raw trade sum; the migration does not overwrite these values.

## Database activation prerequisites
1. Identify and back up the *TRADE OS / Lovable Cloud Supabase* project (the currently connected Supabase plugin exposes only an unrelated inactive project).
2. Apply and dry-run `20261030170000_foundation_repair.sql` FIRST in an isolated TRADE OS staging database. Confirm the job worker and account delta triggers behave correctly.
3. Apply `20261030210000_phase2_trading_financial.sql` SECOND. Confirm `tradeos_phase2_ready()` returns true to an authenticated test user.
4. Run Supabase database security advisors and review RLS, grants, overloaded RPCs, trigger safety, queue privileges.
5. Perform a read-only reconciliation for every account:
   ```sql
   SELECT * FROM public.tradeos_account_reconciliation()
   ORDER BY currency, account_id;
   ```
   When called with the end-user JWT, the RPC is scoped to that user's accounts. Administrative review requires an appropriately authorized read-only method. Do not auto-correct historical discrepancies.
6. Manually compare all variances with broker statements, trading history, prior browser balance updates, and cash movement history. Record signed-off adjustments separately if necessary.
7. Activate the Phase 1 worker using its server-only service role key and cron secret; verify queued imports and manual trades reach `succeeded`.
8. Execute staging end-to-end tests before approving the PR for `main` and before enabling Phase 2 in production.

## Staging verification matrix
| Test | Expected |
|---|---|
| Binary WIN 100 stake at 80% (fee 2) | Net P&L 78, result WIN |
| Binary LOSS 100 stake (fee 2, rebate 10) | Net P&L -92, result LOSS |
| Binary VOID/PUSH with fees | Refund principal, P&L = negative fee |
| Binary OPEN | P&L 0, settlement NULL |
| Forged binary P&L from client | Server trigger overrides |
| Expiry earlier than entry | Rejected |
| Cross-user trade/account/import reference | Rejected |
| Import same file twice | Second run adds 0 duplicate trades and 0 P&L |
| Two concurrent imports with same fingerprint | DB UNIQUE prevents duplicate insert |
| Cash deposit repeated with same idempotency key | Duplicate blocked; no second balance delta |
| Cash withdrawal exceeds recorded balance | Rejected |
| Account currency changed after activity | Rejected |
| Mixed-currency accounts | Separate totals, no conversion |
| Full-history reconciliation | All trade and cash records, no PostgREST row-limit truncation |
| Legacy account with mismatched booked balance | Variance identified; not overwritten |

## Deliberately remaining work
- Historical broker statement import and reconciliation is not fully automated.
- Currency conversion is intentionally unsupported until verifiable FX source and accounting policy exist.
- Synchronous broker integration and automatic funds settlement remain out of scope.
- Full cross-browser E2E and Postgres migration tests cannot run without access to the actual TRADE OS database.
- The generic CSV importer blocks writing until Phase 2 activation; this prevents creating more unreconcilable/duplicated entries in an unprotected database.
- The statistical Truth Engine still needs separate causality and data-quality evaluation for forecasting; payout mathematics alone does not certify AI recommendations.
- The data-query layer uses paginated browser tables for some dashboards; full historical analytics require server-side aggregation before very large user histories are certified.
