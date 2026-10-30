-- TRADE OS v2 Phase 2: deterministic binary settlement, protected imports and financial review.
-- REQUIRES migration 20261030170000_foundation_repair.sql to have been applied first.
-- No historical monetary balances or trades are automatically reclassified/backfilled.

ALTER TABLE public.trades ADD COLUMN contract_type text NOT NULL DEFAULT 'spot'
  CHECK (contract_type IN ('spot','binary'));
ALTER TABLE public.trades ADD COLUMN binary_outcome text
  CHECK (binary_outcome IN ('pending','win','loss','push','void'));
ALTER TABLE public.trades ADD COLUMN payout_percent numeric(8,3)
  CHECK (payout_percent BETWEEN 0 AND 500);
ALTER TABLE public.trades ADD COLUMN expires_at timestamptz;
ALTER TABLE public.trades ADD COLUMN refund_amount numeric(18,2)
  CHECK (refund_amount >= 0);
ALTER TABLE public.trades ADD COLUMN import_source text
  CHECK (import_source IN ('csv','broker'));
ALTER TABLE public.trades ADD COLUMN source_key text;
ALTER TABLE public.trades ADD CONSTRAINT tradeos_import_pair
  CHECK ((import_source IS NULL AND source_key IS NULL)
      OR (import_source IS NOT NULL AND source_key IS NOT NULL AND length(source_key) BETWEEN 12 AND 128));
CREATE UNIQUE INDEX tradeos_import_unique
 ON public.trades (user_id,account_id,import_source,source_key) WHERE source_key IS NOT NULL;
CREATE INDEX tradeos_binary_expiry ON public.trades(user_id,account_id,expires_at) WHERE contract_type='binary';

-- Derived values are authoritative: a client cannot claim a win while
-- posting an inconsistent P&L, duration or status.
CREATE OR REPLACE FUNCTION public.tradeos_settle_binary_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE refunded numeric(18,2); fees_paid numeric(18,2);
BEGIN
  IF NEW.contract_type <> 'binary' THEN
    IF NEW.binary_outcome IS NOT NULL OR NEW.payout_percent IS NOT NULL OR NEW.expires_at IS NOT NULL OR NEW.refund_amount IS NOT NULL THEN
      RAISE EXCEPTION 'Binary contract fields require contract_type=binary';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.binary_outcome IS NULL OR NEW.payout_percent IS NULL
     OR NEW.stake IS NULL OR NEW.stake <= 0 OR NEW.expires_at IS NULL
     OR NEW.expires_at <= NEW.entered_at
  THEN RAISE EXCEPTION 'Binary contract requires positive stake, payout, expiry after entry, and outcome'; END IF;
  IF NEW.binary_outcome <> 'pending' AND NEW.exited_at IS NULL THEN
    -- Settlement instant is the contract expiry by default.
    NEW.exited_at := NEW.expires_at;
  END IF;
  IF NEW.binary_outcome = 'pending' THEN
    IF NEW.exited_at IS NOT NULL THEN RAISE EXCEPTION 'Pending binary trade cannot have an exit'; END IF;
    NEW.pnl := 0;
    NEW.result := 'open';
  ELSE
    IF NEW.exited_at < NEW.entered_at THEN RAISE EXCEPTION 'Exit before entry'; END IF;
    fees_paid := COALESCE(NEW.fees,0);
    IF fees_paid < 0 THEN RAISE EXCEPTION 'Fees cannot be negative'; END IF;
    refunded := COALESCE(NEW.refund_amount, NEW.stake);
    IF refunded < 0 OR refunded > NEW.stake THEN RAISE EXCEPTION 'Invalid binary refund'; END IF;
    NEW.pnl := CASE NEW.binary_outcome
      WHEN 'win' THEN round(NEW.stake * NEW.payout_percent / 100 - fees_paid,2)
      WHEN 'loss' THEN -NEW.stake - fees_paid
      ELSE refunded - NEW.stake - fees_paid
    END;
    NEW.result := CASE WHEN NEW.pnl > 0 THEN 'win'
      WHEN NEW.pnl < 0 THEN 'loss' ELSE 'breakeven' END;
  END IF;
  NEW.duration_seconds := extract(epoch from (NEW.expires_at - NEW.entered_at))::integer;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tradeos_settle_binary ON public.trades;
CREATE TRIGGER trg_tradeos_settle_binary BEFORE INSERT OR UPDATE ON public.trades
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_settle_binary_contract();

-- Prevent changing a source identity to evade deduplication silently.
CREATE OR REPLACE FUNCTION public.tradeos_guard_import_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.source_key IS NOT NULL AND
     (NEW.source_key IS DISTINCT FROM OLD.source_key OR NEW.import_source IS DISTINCT FROM OLD.import_source)
  THEN RAISE EXCEPTION 'Imported source identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_guard_import_identity BEFORE UPDATE ON public.trades
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_guard_import_identity();

-- Read-only, client-accessible phase activation probe.
CREATE OR REPLACE FUNCTION public.tradeos_phase2_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT true; $$;
REVOKE ALL ON FUNCTION public.tradeos_phase2_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_phase2_ready() TO authenticated;

-- Trusted user-scoped import RPC is a single transaction:
-- duplicates are skipped by the unique source index; any other error rolls back
-- the complete import (including trade triggers, balance deltas and jobs).
CREATE OR REPLACE FUNCTION public.tradeos_import_trades(p_account uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  caller uuid := auth.uid();
  x jsonb;
  added integer := 0;
  dupes integer := 0;
  n integer := 0;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id=p_account AND user_id=caller)
    THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000
    THEN RAISE EXCEPTION 'Expected an array of up to 1000 normalized trades'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    n := n + 1;
    IF x->>'import_source' <> 'csv' OR length(COALESCE(x->>'source_key','')) < 12 THEN
      RAISE EXCEPTION 'Import source and deterministic key required for row %',n;
    END IF;
    INSERT INTO public.trades(user_id,account_id,asset,direction,session,entered_at,exited_at,
      entry_price,exit_price,stop_loss,take_profit,position_size,stake,pnl,fees,result,
      duration_seconds,contract_type,binary_outcome,payout_percent,expires_at,refund_amount,
      import_source,source_key)
    VALUES (caller,p_account,upper(x->>'asset'),(x->>'direction')::public.trade_direction,
      NULLIF(x->>'session','')::public.trade_session,(x->>'entered_at')::timestamptz,
      NULLIF(x->>'exited_at','')::timestamptz, NULLIF(x->>'entry_price','')::numeric,
      NULLIF(x->>'exit_price','')::numeric,NULLIF(x->>'stop_loss','')::numeric,
      NULLIF(x->>'take_profit','')::numeric,NULLIF(x->>'position_size','')::numeric,
      NULLIF(x->>'stake','')::numeric,COALESCE((x->>'pnl')::numeric,0),
      COALESCE((x->>'fees')::numeric,0),(x->>'result')::public.trade_result,
      NULLIF(x->>'duration_seconds','')::integer,COALESCE(x->>'contract_type','spot'),
      NULLIF(x->>'binary_outcome',''),NULLIF(x->>'payout_percent','')::numeric,
      NULLIF(x->>'expires_at','')::timestamptz,NULLIF(x->>'refund_amount','')::numeric,
      'csv',x->>'source_key')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN added := added+1; ELSE dupes := dupes+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('inserted',added,'skipped_duplicates',dupes);
END $$;
REVOKE ALL ON FUNCTION public.tradeos_import_trades(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_import_trades(uuid,jsonb) TO authenticated;

-- Read-only balance review, not automated repair: deposits, withdrawals,
-- transfers and prior manual adjustments must be independently reconciled.
CREATE OR REPLACE FUNCTION public.tradeos_balance_variances()
RETURNS TABLE(account_id uuid,account_name text,starting_balance numeric,current_balance numeric,
  trade_pnl numeric,variance numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT a.id,a.name,a.starting_balance,a.current_balance,
   COALESCE(sum(t.pnl) FILTER (WHERE t.result <> 'open'),0),
   a.current_balance - a.starting_balance -
      COALESCE(sum(t.pnl) FILTER (WHERE t.result <> 'open'),0)
 FROM public.accounts a LEFT JOIN public.trades t ON t.account_id=a.id
 WHERE a.user_id=auth.uid()
 GROUP BY a.id,a.name,a.starting_balance,a.current_balance
$$;
REVOKE ALL ON FUNCTION public.tradeos_balance_variances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_balance_variances() TO authenticated;
