-- TRADE OS Phase F.2: Historical monetary reconciliation (READ ONLY)
-- Run only against a previously identified, approved TRADE OS target.
-- Never apply the divergent Phase 2 branch or use this to backfill/correct data.
-- Output contains account identifiers, monetary amounts and possible user data:
-- keep results in an encrypted, access-controlled private evidence store.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog;

-- Query 1: single-currency, account-by-account booked balance proof.
-- Expected = starting balance + realized closed trade P&L + net posted cash.
-- The balance event total is an independent delta-history cross-check.
WITH trade_agg AS (
  SELECT t.account_id,
    COUNT(*) AS trade_count,
    COUNT(*) FILTER (WHERE t.result <> 'open') AS settled_count,
    COALESCE(SUM(t.pnl) FILTER (WHERE t.result <> 'open'),0)::numeric(18,2) AS realized_pnl,
    COUNT(*) FILTER (WHERE t.currency IS NULL) AS unverified_trade_currency_count,
    COUNT(*) FILTER (WHERE t.currency IS NOT NULL AND t.currency <> a.currency) AS mismatched_trade_currency_count
  FROM public.trades t JOIN public.accounts a ON a.id=t.account_id
  GROUP BY t.account_id
),
cash_agg AS (
  SELECT m.account_id,
    COUNT(*) AS movement_count,
    COALESCE(SUM(CASE m.kind WHEN 'deposit' THEN m.amount ELSE -m.amount END),0)::numeric(18,2) AS net_cash,
    COUNT(*) FILTER (WHERE m.currency <> a.currency OR m.user_id <> a.user_id) AS mismatched_cash_count
  FROM public.account_cash_movements m JOIN public.accounts a ON a.id=m.account_id
  GROUP BY m.account_id
),
event_agg AS (
  SELECT e.account_id, COUNT(*) AS event_count,
    COALESCE(SUM(e.delta),0)::numeric(18,2) AS event_delta
  FROM public.account_balance_events e
  GROUP BY e.account_id
)
SELECT
  now() AT TIME ZONE 'UTC' AS audit_utc,
  a.id AS account_id,
  a.user_id AS owner_user_id,
  a.name AS account_name,
  a.currency AS configured_currency,
  (a.currency_confirmed_at IS NOT NULL) AS currency_confirmed,
  COALESCE(t.trade_count,0) AS trades,
  COALESCE(t.settled_count,0) AS settled_trades,
  COALESCE(t.unverified_trade_currency_count,0) AS trade_currency_unreviewed,
  COALESCE(t.mismatched_trade_currency_count,0) AS trade_currency_mismatches,
  COALESCE(c.movement_count,0) AS cash_movement_count,
  COALESCE(c.mismatched_cash_count,0) AS cash_currency_or_owner_mismatches,
  a.starting_balance,
  COALESCE(t.realized_pnl,0)::numeric(18,2) AS realized_trade_pnl,
  COALESCE(c.net_cash,0)::numeric(18,2) AS net_recorded_cash,
  a.current_balance AS booked_current_balance,
  (a.starting_balance + COALESCE(t.realized_pnl,0) + COALESCE(c.net_cash,0))::numeric(18,2) AS expected_balance,
  (a.current_balance - a.starting_balance - COALESCE(t.realized_pnl,0) - COALESCE(c.net_cash,0))::numeric(18,2) AS variance,
  COALESCE(e.event_count,0) AS balance_event_count,
  (a.starting_balance + COALESCE(e.event_delta,0))::numeric(18,2) AS event_derived_balance,
  (a.current_balance - a.starting_balance - COALESCE(e.event_delta,0))::numeric(18,2) AS event_variance,
  CASE
    WHEN a.currency_confirmed_at IS NULL
      OR COALESCE(t.unverified_trade_currency_count,0)>0
      OR COALESCE(t.mismatched_trade_currency_count,0)>0
      OR COALESCE(c.mismatched_cash_count,0)>0
      THEN 'BLOCK_CURRENCY_REVIEW'
    WHEN ABS(a.current_balance - a.starting_balance
      - COALESCE(t.realized_pnl,0) - COALESCE(c.net_cash,0))>0.005
      THEN 'BLOCK_BOOKED_BALANCE_VARIANCE'
    WHEN ABS(a.current_balance-a.starting_balance-COALESCE(e.event_delta,0))>0.005
      THEN 'BLOCK_EVENT_LEDGER_VARIANCE'
    ELSE 'MATCHES_RECORDED_LEDGER_NOT_BROKER_VERIFIED'
  END AS reconciliation_status
FROM public.accounts a
LEFT JOIN trade_agg t ON t.account_id=a.id
LEFT JOIN cash_agg c ON c.account_id=a.id
LEFT JOIN event_agg e ON e.account_id=a.id
ORDER BY reconciliation_status, a.user_id, a.id;

-- Query 2: every cash movement must produce exactly one matching
-- signed balance event, with correct account, owner, amount and movement ID.
WITH linked AS (
  SELECT m.id, m.account_id, m.user_id, m.kind, m.amount, m.currency,
    COUNT(e.id) AS matching_rows,
    COUNT(e.id) FILTER (WHERE e.account_id=m.account_id AND e.user_id=m.user_id
      AND e.change_type = CASE WHEN m.kind='deposit' THEN 'cash_deposit' ELSE 'cash_withdrawal' END
      AND e.delta = CASE WHEN m.kind='deposit' THEN m.amount ELSE -m.amount END) AS correctly_signed_rows
  FROM public.account_cash_movements m
  LEFT JOIN public.account_balance_events e ON e.cash_movement_id=m.id
  GROUP BY m.id,m.account_id,m.user_id,m.kind,m.amount,m.currency
)
SELECT id AS cash_movement_id,account_id,user_id,kind,amount,currency,
  matching_rows,correctly_signed_rows,
  CASE WHEN matching_rows=1 AND correctly_signed_rows=1 THEN 'PASS' ELSE 'BLOCK_UNMATCHED_CASH_EVENT' END AS status
FROM linked
WHERE matching_rows <> 1 OR correctly_signed_rows <> 1
ORDER BY account_id,id;

-- Query 3: events referring to missing cash movements, or to cash-movement IDs
-- not matching the event account, must be investigated.
SELECT e.id AS balance_event_id,e.account_id,e.user_id,e.cash_movement_id,e.delta,e.change_type
FROM public.account_balance_events e
LEFT JOIN public.account_cash_movements m ON m.id=e.cash_movement_id
WHERE (e.change_type IN ('cash_deposit','cash_withdrawal') AND (m.id IS NULL OR
         m.account_id<>e.account_id OR m.user_id<>e.user_id))
   OR (m.id IS NOT NULL AND e.change_type NOT IN ('cash_deposit','cash_withdrawal'))
ORDER BY e.account_id,e.id;

-- Query 4: import provenance and canonical dedupe review (reported only).
SELECT t.account_id,t.import_source,t.source_key,COUNT(*) AS occurrences,
  COUNT(DISTINCT t.user_id) AS user_scopes
FROM public.trades t
WHERE t.source_key IS NOT NULL
GROUP BY t.account_id,t.import_source,t.source_key
HAVING COUNT(*)>1 OR COUNT(DISTINCT t.user_id)>1
ORDER BY t.account_id,t.source_key;

COMMIT;
