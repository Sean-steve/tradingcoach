-- Phase C defect fix: binary settlement updates may only explicitly set
-- binary_outcome. The BEFORE settlement trigger derives pnl and result, but
-- the old column-filtered AFTER trigger (UPDATE OF pnl,result,account_id,user_id)
-- does NOT fire unless those columns were in the SQL SET clause. Postgres'
-- column-specific trigger matching ignores column changes by BEFORE triggers.
--
-- Use a full-row UPDATE trigger. The existing delta function exits without
-- writing a ledger entry for changes where realized net P&L is unchanged.
-- This migration preserves all existing history and does not backfill data.
--
-- Historical balances affected by a previous deployed version, if any,
-- require an explicit read-only variance audit and supervised reconciliation.
DROP TRIGGER IF EXISTS trg_tradeos_trade_balance ON public.trades;
CREATE TRIGGER trg_tradeos_trade_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_trade_balance_trigger();
