-- TRADE OS Phase 2. Apply only AFTER 20261030170000_foundation_repair.sql,
-- following backup, staging dry run, row-level security checks and ledger reconciliation.
-- Currency conversion is intentionally not performed. Each account is one currency.
ALTER TABLE public.accounts
  ADD COLUMN currency text NOT NULL DEFAULT 'USD'
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE public.trades
  ADD COLUMN instrument_type text NOT NULL DEFAULT 'spot'
    CHECK (instrument_type IN ('spot','binary_option')),
  ADD COLUMN currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN binary_expiry_at timestamptz,
  ADD COLUMN binary_payout_ratio numeric(12,6),
  ADD COLUMN binary_settlement text
    CHECK (binary_settlement IN ('win','loss','push','void')),
  ADD COLUMN binary_refund_amount numeric(18,2)
    CHECK (binary_refund_amount IS NULL OR binary_refund_amount >= 0),
  ADD COLUMN import_source text,
  ADD COLUMN source_trade_id text,
  ADD COLUMN import_fingerprint text
    CHECK (import_fingerprint IS NULL OR import_fingerprint ~ '^[a-f0-9]{64}$');

UPDATE public.trades t SET currency = a.currency
  FROM public.accounts a WHERE t.account_id = a.id;

CREATE UNIQUE INDEX tradeos_import_fingerprint_uniq
  ON public.trades(account_id,import_fingerprint);

CREATE INDEX tradeos_binary_account_expiry
  ON public.trades(account_id,binary_expiry_at DESC)
  WHERE instrument_type = 'binary_option';

CREATE OR REPLACE FUNCTION public.tradeos_account_currency_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency AND (
    EXISTS (SELECT 1 FROM public.trades t WHERE t.account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.account_cash_movements m WHERE m.account_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Account currency cannot change after the first trade';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_account_currency_guard BEFORE UPDATE OF currency
ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.tradeos_account_currency_guard();

CREATE OR REPLACE FUNCTION public.tradeos_binary_contract_normalize()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE account_currency text;
BEGIN
  SELECT a.currency INTO account_currency FROM public.accounts a
    WHERE a.id = NEW.account_id AND a.user_id = NEW.user_id;
  IF account_currency IS NULL THEN
    RAISE EXCEPTION 'Invalid account or currency ownership';
  END IF;
  NEW.currency := account_currency;

  IF NEW.instrument_type = 'spot' THEN
    IF NEW.binary_expiry_at IS NOT NULL OR NEW.binary_payout_ratio IS NOT NULL
       OR NEW.binary_settlement IS NOT NULL OR NEW.binary_refund_amount IS NOT NULL THEN
      RAISE EXCEPTION 'Binary fields require instrument_type=binary_option';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stake IS NULL OR NEW.stake <= 0 OR NEW.stake > 100000000
     OR NEW.binary_payout_ratio IS NULL OR NEW.binary_payout_ratio < 0
     OR NEW.binary_payout_ratio > 100 OR NEW.binary_expiry_at IS NULL
     OR NEW.binary_expiry_at <= NEW.entered_at THEN
    RAISE EXCEPTION 'Invalid binary stake, net payout ratio, or contract expiry';
  END IF;
  IF NEW.fees IS NULL THEN NEW.fees := 0; END IF;
  IF NEW.fees < 0 THEN RAISE EXCEPTION 'Fees must not be negative'; END IF;

  IF NEW.binary_settlement IS NULL THEN
    IF NEW.result <> 'open' OR NEW.fees <> 0 THEN
      RAISE EXCEPTION 'Unsettled binary options must be open with no realized fees';
    END IF;
    NEW.pnl := 0;
    NEW.binary_refund_amount := 0;
    NEW.exited_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.binary_refund_amount IS NULL THEN
    NEW.binary_refund_amount :=
      CASE WHEN NEW.binary_settlement IN ('push','void') THEN NEW.stake ELSE 0 END;
  END IF;
  IF NEW.binary_refund_amount > NEW.stake THEN
    RAISE EXCEPTION 'Refund cannot exceed principal stake';
  END IF;
  NEW.exited_at := NEW.binary_expiry_at;
  NEW.duration_seconds := floor(extract(epoch FROM (NEW.binary_expiry_at - NEW.entered_at)))::integer;
  CASE NEW.binary_settlement
    WHEN 'win' THEN
      IF NEW.binary_refund_amount <> 0 THEN RAISE EXCEPTION 'Winning contract cannot have refund'; END IF;
      NEW.pnl := round(NEW.stake * NEW.binary_payout_ratio - NEW.fees, 2);
      NEW.result := 'win';
    WHEN 'loss' THEN
      NEW.pnl := round(-NEW.stake + NEW.binary_refund_amount - NEW.fees, 2);
      NEW.result := 'loss';
    WHEN 'push' THEN
      IF NEW.binary_refund_amount <> NEW.stake THEN RAISE EXCEPTION 'Push requires full refund'; END IF;
      NEW.pnl := -NEW.fees;
      NEW.result := 'breakeven';
    WHEN 'void' THEN
      IF NEW.binary_refund_amount <> NEW.stake THEN RAISE EXCEPTION 'Void requires full refund'; END IF;
      NEW.pnl := -NEW.fees;
      NEW.result := 'breakeven';
    ELSE RAISE EXCEPTION 'Invalid settlement';
  END CASE;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tradeos_binary_contract_normalize() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tradeos_binary_contract BEFORE INSERT OR UPDATE ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.tradeos_binary_contract_normalize();

-- Foundation's original balance trigger only listened to explicit UPDATE OF
-- pnl/result/account_id/user_id. A binary settlement edit can alter P&L inside
-- this BEFORE trigger without those columns appearing in the SET list.
-- Listen to every UPDATE so NEW.pnl vs OLD.pnl always posts its delta once.
DROP TRIGGER IF EXISTS trg_tradeos_trade_balance ON public.trades;
CREATE TRIGGER trg_tradeos_trade_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_trade_balance_trigger();

-- Account cash movements are independent of earmarked profit allocations.
-- Only actual deposits/withdrawals affect the authoritative cash balance.
CREATE TABLE public.account_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key uuid NOT NULL,
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,idempotency_key)
);
CREATE INDEX account_cash_movements_account_time ON public.account_cash_movements(account_id,created_at DESC);
ALTER TABLE public.account_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_cash_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.account_cash_movements TO authenticated;
GRANT ALL ON public.account_cash_movements TO service_role;
CREATE POLICY "read own cash movements" ON public.account_cash_movements
FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "create own cash movements" ON public.account_cash_movements
FOR INSERT TO authenticated WITH CHECK (
  (select auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = (select auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.tradeos_cash_movement_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE acct_currency text;
        acct_balance numeric;
BEGIN
  SELECT currency, current_balance INTO acct_currency, acct_balance FROM public.accounts
    WHERE id = NEW.account_id AND user_id = NEW.user_id FOR UPDATE;
  IF acct_currency IS NULL OR acct_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Cash movement account/currency mismatch';
  END IF;
  IF NEW.kind = 'withdrawal' AND acct_balance < NEW.amount THEN
    RAISE EXCEPTION 'Recorded withdrawal exceeds available account cash balance';
  END IF;
  -- A deposit/withdrawal is manually recorded, NOT a verified bank settlement.
  PERFORM public.tradeos_post_balance_delta(
    NEW.account_id, NEW.user_id, NULL,
    CASE WHEN NEW.kind = 'deposit' THEN 'cash_deposit' ELSE 'cash_withdrawal' END,
    CASE WHEN NEW.kind = 'deposit' THEN NEW.amount ELSE -NEW.amount END
  );
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tradeos_cash_movement_post() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.account_balance_events DROP CONSTRAINT IF EXISTS account_balance_events_change_type_check;
ALTER TABLE public.account_balance_events ADD CONSTRAINT account_balance_events_change_type_check
  CHECK (change_type IN (
    'trade_insert','trade_update','trade_delete','trade_move',
    'cash_deposit','cash_withdrawal'
  ));
CREATE TRIGGER trg_tradeos_cash_movement_post AFTER INSERT
ON public.account_cash_movements FOR EACH ROW EXECUTE FUNCTION public.tradeos_cash_movement_post();

-- Import journal: user can create/run, but cannot falsify recorded inserted counts.
CREATE TABLE public.trade_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('csv','mt4','mt5','binary_csv')),
  filename text,
  attempted_rows integer NOT NULL DEFAULT 0 CHECK (attempted_rows BETWEEN 0 AND 200000),
  inserted_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trade_import_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trade_import_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trade_import_runs TO authenticated;
GRANT INSERT (user_id, account_id, source, filename, attempted_rows)
  ON public.trade_import_runs TO authenticated;
GRANT ALL ON public.trade_import_runs TO service_role;
CREATE POLICY "read own imports" ON public.trade_import_runs FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "create own imports" ON public.trade_import_runs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = (select auth.uid())
  ));
ALTER TABLE public.trades ADD COLUMN import_run_id uuid REFERENCES public.trade_import_runs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tradeos_import_reference_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.import_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trade_import_runs r WHERE r.id = NEW.import_run_id
      AND r.account_id = NEW.account_id AND r.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'Import run must belong to the same user and account'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_import_reference BEFORE INSERT OR UPDATE OF import_run_id,account_id,user_id
ON public.trades FOR EACH ROW EXECUTE FUNCTION public.tradeos_import_reference_validate();

CREATE OR REPLACE FUNCTION public.tradeos_import_count_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.import_run_id IS NOT NULL THEN
    UPDATE public.trade_import_runs SET inserted_rows = inserted_rows + 1 WHERE id = NEW.import_run_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tradeos_import_count_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tradeos_import_count AFTER INSERT ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.tradeos_import_count_insert();

-- Read-only activation probe. Supabase PostgREST PGRST202 = not yet applied.
CREATE OR REPLACE FUNCTION public.tradeos_phase2_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.tradeos_phase2_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_phase2_ready() TO authenticated;

-- Full-dataset reconciliation; avoids PostgREST's default 1000-row query cap.
-- Read-only and SECURITY INVOKER: only rows allowed by the account RLS policy.
CREATE OR REPLACE FUNCTION public.tradeos_account_reconciliation()
RETURNS TABLE (
  account_id uuid, currency text, booked numeric, expected numeric, variance numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT a.id, a.currency, a.current_balance,
    round(a.starting_balance + coalesce(t.realized_pnl,0) + coalesce(c.net_cash,0),2),
    round(a.current_balance - (a.starting_balance + coalesce(t.realized_pnl,0) + coalesce(c.net_cash,0)),2)
  FROM public.accounts a
  LEFT JOIN LATERAL (
    SELECT sum(pnl) AS realized_pnl FROM public.trades t
    WHERE t.account_id = a.id AND t.result <> 'open'
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT sum(CASE WHEN kind='deposit' THEN amount ELSE -amount END) AS net_cash
    FROM public.account_cash_movements m WHERE m.account_id = a.id
  ) c ON true
  WHERE a.user_id = (select auth.uid());
$$;
REVOKE ALL ON FUNCTION public.tradeos_account_reconciliation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_account_reconciliation() TO authenticated;
