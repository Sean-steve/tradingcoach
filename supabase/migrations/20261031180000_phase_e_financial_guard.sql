-- TRADE OS Phase E: enforce opening capital semantics.
-- A starting balance is only editable before the first booked trade or ledger
-- event. After that, corrections must use an audited cash movement process,
-- which is NOT implemented until issue #8 is resolved.
-- No historical records are rewritten or backfilled by this migration.
CREATE OR REPLACE FUNCTION public.tradeos_guard_opening_capital()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.starting_balance IS DISTINCT FROM OLD.starting_balance THEN
    IF EXISTS(SELECT 1 FROM public.trades t WHERE t.account_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.account_balance_events e WHERE e.account_id=OLD.id)
    THEN
      RAISE EXCEPTION 'Starting balance is locked after trading begins; use audited accounting corrections'
        USING ERRCODE='23514';
    END IF;
    -- Updating the baseline on a genuinely unused account must also update
    -- the initial booked balance, otherwise it introduces silent drift.
    NEW.current_balance:=NEW.starting_balance;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.tradeos_guard_opening_capital() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_tradeos_guard_opening_capital ON public.accounts;
CREATE TRIGGER trg_tradeos_guard_opening_capital
  BEFORE UPDATE OF starting_balance ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_guard_opening_capital();
