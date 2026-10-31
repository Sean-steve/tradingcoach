-- Phase F.1: additive cash, currency and reconciliation authority.
-- Canonical Phase 2 remains contract_type/binary_outcome/payout_percent/expires_at.
-- No historical trades, cash balances or financial events are backfilled.
-- Migration must be reviewed against a snapshot before any REMOTE application.

ALTER TABLE public.accounts
  ADD COLUMN currency text NOT NULL DEFAULT 'USD'
    CONSTRAINT tradeos_account_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN currency_confirmed_at timestamptz;
-- Pre-existing accounts intentionally remain UNCONFIRMED; the default is not evidence
-- of their historical settlement currency.
CREATE OR REPLACE FUNCTION public.tradeos_new_account_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.currency_confirmed_at := now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_new_account_currency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tradeos_new_account_currency
  BEFORE INSERT ON public.accounts FOR EACH ROW
  EXECUTE FUNCTION public.tradeos_new_account_currency();

CREATE OR REPLACE FUNCTION public.tradeos_lock_account_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.currency_confirmed_at IS DISTINCT FROM OLD.currency_confirmed_at THEN
    IF EXISTS (SELECT 1 FROM public.trades WHERE account_id=OLD.id)
       OR EXISTS (SELECT 1 FROM public.account_balance_events WHERE account_id=OLD.id)
    THEN
      RAISE EXCEPTION 'Currency changes require supervised historical reconciliation'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_lock_account_currency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tradeos_lock_account_currency BEFORE UPDATE OF currency,currency_confirmed_at
 ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.tradeos_lock_account_currency();

-- Currency confirmation is an explicit action on an unused account only.
-- Historical accounts with trades require a separately reviewed manual migration.
CREATE OR REPLACE FUNCTION public.tradeos_confirm_account_currency(p_account uuid,p_currency text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); confirmed timestamptz;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    THEN RAISE EXCEPTION 'Three-letter uppercase currency required'; END IF;
  SELECT currency_confirmed_at INTO confirmed
    FROM public.accounts WHERE id=p_account AND user_id=caller FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF confirmed IS NOT NULL THEN
    RAISE EXCEPTION 'Currency already confirmed; no implicit FX changes';
  END IF;
  UPDATE public.accounts SET currency=p_currency,currency_confirmed_at=now()
   WHERE id=p_account AND user_id=caller;
  RETURN p_currency;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_confirm_account_currency(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_confirm_account_currency(uuid,text) TO authenticated;

ALTER TABLE public.trades ADD COLUMN currency text
 CONSTRAINT tradeos_trade_currency_format CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
-- Legacy rows retain NULL as a visible unreviewed historical-currency marker.
CREATE OR REPLACE FUNCTION public.tradeos_enforce_trade_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE booked_currency text; confirmed timestamptz;
 old_currency text; old_confirmed timestamptz;
BEGIN
  SELECT a.currency,a.currency_confirmed_at INTO booked_currency,confirmed
    FROM public.accounts a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id;
  IF booked_currency IS NULL OR confirmed IS NULL THEN
    RAISE EXCEPTION 'Confirm account currency before posting new trades';
  END IF;
  IF TG_OP='UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    SELECT a.currency,a.currency_confirmed_at INTO old_currency,old_confirmed
      FROM public.accounts a WHERE a.id=OLD.account_id AND a.user_id=OLD.user_id;
    IF old_confirmed IS NULL OR old_currency IS DISTINCT FROM booked_currency THEN
      RAISE EXCEPTION 'Cannot transfer trade across unverified or different account currencies';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.currency IS NOT NULL AND OLD.currency IS DISTINCT FROM booked_currency THEN
    RAISE EXCEPTION 'Trade currency is immutable';
  END IF;
  NEW.currency:=booked_currency;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_enforce_trade_currency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tradeos_enforce_trade_currency
  BEFORE INSERT OR UPDATE ON public.trades FOR EACH ROW
  EXECUTE FUNCTION public.tradeos_enforce_trade_currency();

CREATE TABLE public.account_cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('deposit','withdrawal')),
 amount numeric(18,2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 idempotency_key uuid NOT NULL,
 reference text CHECK (reference IS NULL OR length(reference) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,idempotency_key)
);
CREATE INDEX tradeos_cash_account_time ON public.account_cash_movements(account_id,created_at DESC);
ALTER TABLE public.account_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_cash_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.account_cash_movements TO authenticated;
GRANT ALL ON public.account_cash_movements TO service_role;
CREATE POLICY "cash movements read own" ON public.account_cash_movements
 FOR SELECT TO authenticated USING ((select auth.uid())=user_id);

ALTER TABLE public.account_balance_events
 DROP CONSTRAINT IF EXISTS account_balance_events_change_type_check;
ALTER TABLE public.account_balance_events
 ADD CONSTRAINT account_balance_events_change_type_check
 CHECK (change_type IN ('trade_insert','trade_update','trade_delete','trade_move','cash_deposit','cash_withdrawal'));
ALTER TABLE public.account_balance_events
 ADD COLUMN cash_movement_id uuid REFERENCES public.account_cash_movements(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.tradeos_post_cash_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_cash numeric(18,2); acct_currency text; confirmed timestamptz;
 signed_delta numeric(18,2);
BEGIN
  SELECT current_balance,currency,currency_confirmed_at
    INTO current_cash,acct_currency,confirmed
  FROM public.accounts
  WHERE id=NEW.account_id AND user_id=NEW.user_id FOR UPDATE;
  IF NOT FOUND OR confirmed IS NULL OR acct_currency IS DISTINCT FROM NEW.currency
    THEN RAISE EXCEPTION 'Cash posting requires a confirmed owned account currency'; END IF;
  IF NEW.kind='withdrawal' AND NEW.amount>current_cash
    THEN RAISE EXCEPTION 'Recorded withdrawal exceeds booked cash balance'; END IF;
  signed_delta:=CASE WHEN NEW.kind='deposit' THEN NEW.amount ELSE -NEW.amount END;
  UPDATE public.accounts SET current_balance=current_balance+signed_delta
    WHERE id=NEW.account_id AND user_id=NEW.user_id;
  INSERT INTO public.account_balance_events(account_id,user_id,trade_id,cash_movement_id,change_type,delta)
    VALUES (NEW.account_id,NEW.user_id,NULL,NEW.id,
      CASE WHEN NEW.kind='deposit' THEN 'cash_deposit' ELSE 'cash_withdrawal' END,signed_delta);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_post_cash_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_tradeos_post_cash_event AFTER INSERT ON public.account_cash_movements
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_post_cash_event();

-- Application users cannot mutate or directly insert accounting rows.
-- Even highly privileged service operations are prevented from silent edits.
CREATE OR REPLACE FUNCTION public.tradeos_deny_accounting_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Accounting history is append-only'; END; $$;
REVOKE ALL ON FUNCTION public.tradeos_deny_accounting_rewrite() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_tradeos_cash_immutable BEFORE UPDATE OR DELETE ON public.account_cash_movements
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_deny_accounting_rewrite();
-- Existing trade FK uses ON DELETE SET NULL and therefore updates linked event\n-- metadata on legitimate trade deletion. RLS/column privileges still prohibit\n-- client updates/deletes on the event ledger; do not block that FK operation.\nREVOKE UPDATE,DELETE ON public.account_balance_events FROM authenticated;\n
CREATE OR REPLACE FUNCTION public.tradeos_record_cash_movement(
 p_account uuid,p_kind text,p_amount numeric,p_idempotency_key uuid,p_reference text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); acct_currency text; confirmed timestamptz;
 existing public.account_cash_movements%ROWTYPE; new_id uuid; is_duplicate boolean:=false;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_idempotency_key IS NULL OR p_kind NOT IN ('deposit','withdrawal')
    OR p_kind IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>100000000
    OR p_amount<>round(p_amount,2)
    OR (p_reference IS NOT NULL AND (length(p_reference)<1 OR length(p_reference)>200))
  THEN RAISE EXCEPTION 'Invalid cash movement input'; END IF;
  SELECT currency,currency_confirmed_at INTO acct_currency,confirmed
   FROM public.accounts WHERE id=p_account AND user_id=caller FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF confirmed IS NULL THEN RAISE EXCEPTION 'Account currency requires review'; END IF;
  INSERT INTO public.account_cash_movements(account_id,user_id,kind,amount,currency,idempotency_key,reference)
    VALUES(p_account,caller,p_kind,p_amount,acct_currency,p_idempotency_key,p_reference)
  ON CONFLICT (account_id,idempotency_key) DO NOTHING
  RETURNING id INTO new_id;
  IF new_id IS NULL THEN
    SELECT * INTO existing FROM public.account_cash_movements
     WHERE account_id=p_account AND idempotency_key=p_idempotency_key;
    IF existing.id IS NULL OR existing.user_id<>caller OR existing.kind<>p_kind
      OR existing.amount<>p_amount OR existing.currency<>acct_currency
      OR existing.reference IS DISTINCT FROM p_reference
    THEN RAISE EXCEPTION 'Idempotency key reused for different movement'; END IF;
    new_id:=existing.id; is_duplicate:=true;
  END IF;
  RETURN jsonb_build_object('id',new_id,'duplicate',is_duplicate,'currency',acct_currency,
    'verification','user_recorded_unverified');
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_record_cash_movement(uuid,text,numeric,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_record_cash_movement(uuid,text,numeric,uuid,text) TO authenticated;

-- Import tracking extends the canonical import RPC without altering the unique
-- (user_id,account_id,import_source,source_key) deduplication contract.
CREATE TABLE public.trade_import_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 source text NOT NULL DEFAULT 'csv' CHECK(source='csv'),
 attempted_rows integer NOT NULL CHECK(attempted_rows BETWEEN 0 AND 1000),
 inserted_rows integer NOT NULL DEFAULT 0 CHECK(inserted_rows >= 0),
 skipped_duplicates integer NOT NULL DEFAULT 0 CHECK(skipped_duplicates >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trade_import_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trade_import_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.trade_import_runs TO authenticated;
GRANT ALL ON public.trade_import_runs TO service_role;
CREATE POLICY "import runs read own" ON public.trade_import_runs
 FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
ALTER TABLE public.trades ADD COLUMN import_run_id uuid REFERENCES public.trade_import_runs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tradeos_import_trades(p_account uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id=p_account AND a.user_id=caller
    AND a.currency_confirmed_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Confirmed owned account required'; END IF;
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>1000
    THEN RAISE EXCEPTION 'Expected an array of up to 1000 normalized trades'; END IF;
  -- The audited helper is intentionally not callable directly by clients.
  RETURN public.tradeos_import_trades_recorded(p_account,p_rows);
END; $$;

CREATE OR REPLACE FUNCTION public.tradeos_import_trades_recorded(p_account uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); x jsonb; added integer:=0; dupes integer:=0;
 n integer:=0; run_id uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id=p_account AND a.user_id=caller
     AND a.currency_confirmed_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Confirmed owned account required'; END IF;
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>1000
    THEN RAISE EXCEPTION 'Expected an array of up to 1000 normalized trades'; END IF;
  INSERT INTO public.trade_import_runs(user_id,account_id,attempted_rows)
    VALUES(caller,p_account,jsonb_array_length(p_rows)) RETURNING id INTO run_id;
  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    n:=n+1;
    IF x->>'import_source'<>'csv' OR length(coalesce(x->>'source_key',''))<12 THEN
      RAISE EXCEPTION 'Import source and deterministic key required for row %',n;
    END IF;
    INSERT INTO public.trades(user_id,account_id,asset,direction,session,entered_at,exited_at,
      entry_price,exit_price,stop_loss,take_profit,position_size,stake,pnl,fees,result,
      duration_seconds,contract_type,binary_outcome,payout_percent,expires_at,refund_amount,
      import_source,source_key,import_run_id)
    VALUES (caller,p_account,upper(x->>'asset'),(x->>'direction')::public.trade_direction,
      nullif(x->>'session','')::public.trade_session,(x->>'entered_at')::timestamptz,
      nullif(x->>'exited_at','')::timestamptz, nullif(x->>'entry_price','')::numeric,
      nullif(x->>'exit_price','')::numeric,nullif(x->>'stop_loss','')::numeric,
      nullif(x->>'take_profit','')::numeric,nullif(x->>'position_size','')::numeric,
      nullif(x->>'stake','')::numeric,coalesce((x->>'pnl')::numeric,0),
      coalesce((x->>'fees')::numeric,0),(x->>'result')::public.trade_result,
      nullif(x->>'duration_seconds','')::integer,coalesce(x->>'contract_type','spot'),
      nullif(x->>'binary_outcome',''),nullif(x->>'payout_percent','')::numeric,
      nullif(x->>'expires_at','')::timestamptz,nullif(x->>'refund_amount','')::numeric,
      'csv',x->>'source_key',run_id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN added:=added+1; ELSE dupes:=dupes+1; END IF;
  END LOOP;
  UPDATE public.trade_import_runs SET inserted_rows=added,skipped_duplicates=dupes WHERE id=run_id;
  RETURN jsonb_build_object('inserted',added,'skipped_duplicates',dupes);
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_import_trades_recorded(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tradeos_import_trades(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_import_trades(uuid,jsonb) TO authenticated;

-- Validate deferred imports: all recorded run references must share ownership.
CREATE OR REPLACE FUNCTION public.tradeos_check_import_run()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.import_run_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.trade_import_runs r WHERE r.id=NEW.import_run_id
     AND r.account_id=NEW.account_id AND r.user_id=NEW.user_id)
 THEN RAISE EXCEPTION 'Import run ownership mismatch'; END IF;
 IF TG_OP='UPDATE' AND OLD.import_run_id IS NOT NULL AND
    NEW.import_run_id IS DISTINCT FROM OLD.import_run_id
 THEN RAISE EXCEPTION 'Import origin cannot be changed'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_check_import_run() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_tradeos_check_import_run BEFORE INSERT OR UPDATE ON public.trades
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_check_import_run();

-- Earmarked allocations are NOT withdrawals and may not silently exceed profit.
CREATE OR REPLACE FUNCTION public.tradeos_guard_profit_allocations()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE owner uuid; realized numeric; already_allocated numeric;
BEGIN
 SELECT user_id INTO owner FROM public.accounts WHERE id=NEW.account_id FOR UPDATE;
 IF owner IS NULL OR owner<>NEW.user_id THEN
   RAISE EXCEPTION 'Allocation account ownership mismatch'; END IF;
 SELECT coalesce(sum(pnl),0) INTO realized FROM public.trades
   WHERE account_id=NEW.account_id AND result<>'open';
 SELECT coalesce(sum(amount),0) INTO already_allocated FROM public.profit_allocations
   WHERE account_id=NEW.account_id AND (TG_OP<>'UPDATE' OR id<>NEW.id);
 IF NEW.amount<=0 OR NEW.amount>greatest(0,realized)-already_allocated THEN
   RAISE EXCEPTION 'Allocation exceeds available realized profits'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tradeos_guard_profit_allocations() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_tradeos_guard_profit_allocations
 BEFORE INSERT OR UPDATE OF account_id,user_id,amount ON public.profit_allocations
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_guard_profit_allocations();

-- Read only full-dataset reconciliation (not client-side paginated sums).
CREATE OR REPLACE FUNCTION public.tradeos_account_reconciliation()
RETURNS TABLE (
 account_id uuid,account_name text,currency text,currency_confirmed boolean,
 starting_balance numeric,current_balance numeric,trade_pnl numeric,
 net_cash numeric,expected_balance numeric,variance numeric,status text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT a.id,a.name,a.currency,(a.currency_confirmed_at IS NOT NULL),
  a.starting_balance,a.current_balance,
  coalesce(t.pnl,0),coalesce(m.net,0),
  a.starting_balance+coalesce(t.pnl,0)+coalesce(m.net,0),
  a.current_balance-(a.starting_balance+coalesce(t.pnl,0)+coalesce(m.net,0)),
  CASE WHEN a.currency_confirmed_at IS NULL OR coalesce(t.unverified_currency,0)>0
      THEN 'currency_unreviewed'
       WHEN abs(a.current_balance-(a.starting_balance+coalesce(t.pnl,0)+coalesce(m.net,0)))>0.01
      THEN 'variance'
       ELSE 'balanced' END
 FROM public.accounts a
 LEFT JOIN LATERAL (
  SELECT sum(t.pnl) FILTER (WHERE t.result<>'open') AS pnl,
         count(*) FILTER (WHERE t.currency IS NULL) AS unverified_currency
  FROM public.trades t WHERE t.account_id=a.id
 ) t ON true
 LEFT JOIN LATERAL (
  SELECT sum(CASE WHEN m.kind='deposit' THEN m.amount ELSE -m.amount END) AS net
  FROM public.account_cash_movements m WHERE m.account_id=a.id
 ) m ON true
 WHERE a.user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.tradeos_account_reconciliation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_account_reconciliation() TO authenticated;

CREATE OR REPLACE FUNCTION public.tradeos_phase_f1_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.tradeos_phase_f1_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_phase_f1_ready() TO authenticated;
