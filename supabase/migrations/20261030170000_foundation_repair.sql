-- TRADE OS foundation repair. Apply to staging before deploying the matching app code.
-- Intentionally NO retroactive balance backfill; reconcile existing accounts separately.

-- Prevent cross-user account associations through forged account IDs.
ALTER POLICY "own_trades_all" ON public.trades
  USING ((select auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id = trades.account_id AND a.user_id = (select auth.uid())
  ))
  WITH CHECK ((select auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id = trades.account_id AND a.user_id = (select auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.tradeos_validate_trade_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Account ownership mismatch';
  END IF;
  IF NEW.tom_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tom_versions m WHERE m.id = NEW.tom_version_id AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Manual version ownership mismatch';
  END IF;
  IF NEW.strategy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.strategies s WHERE s.id = NEW.strategy_id AND s.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Strategy ownership mismatch';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tradeos_validate_trade_reference() FROM PUBLIC;
CREATE TRIGGER trg_tradeos_trade_reference BEFORE INSERT OR UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_validate_trade_reference();

-- Transactional balance adjustments with an append-only audit ledger.
-- No separate client-side account.current_balance increments are allowed.
CREATE TABLE public.account_balance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  change_type text NOT NULL CHECK (change_type IN ('trade_insert','trade_update','trade_delete','trade_move')),
  delta numeric(18,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_balance_events_account_time ON public.account_balance_events(account_id, created_at DESC);
ALTER TABLE public.account_balance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own balance events" ON public.account_balance_events
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
GRANT SELECT ON public.account_balance_events TO authenticated;
GRANT ALL ON public.account_balance_events TO service_role;

CREATE OR REPLACE FUNCTION public.tradeos_balance_insert_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.current_balance := NEW.starting_balance;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_account_insert_balance BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_balance_insert_defaults();

CREATE OR REPLACE FUNCTION public.tradeos_balance_starting_delta()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Starting capital can change through Settings, but the recorded P&L is preserved.
  IF NEW.starting_balance IS DISTINCT FROM OLD.starting_balance THEN
    NEW.current_balance := OLD.current_balance + (NEW.starting_balance - OLD.starting_balance);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_account_starting_delta BEFORE UPDATE OF starting_balance ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_balance_starting_delta();

REVOKE UPDATE ON public.accounts FROM authenticated;
GRANT UPDATE (name, broker, account_type, starting_balance, max_daily_loss, max_weekly_loss,
  max_risk_pct, max_trades_per_day, is_default, is_archived, updated_at)
  ON public.accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.tradeos_post_balance_delta(
  p_account uuid, p_user uuid, p_trade uuid, p_type text, p_delta numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN RETURN; END IF;
  UPDATE public.accounts SET current_balance = current_balance + p_delta
    WHERE id = p_account AND user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade balance account missing or mismatched'; END IF;
  INSERT INTO public.account_balance_events(account_id,user_id,trade_id,change_type,delta)
    VALUES (p_account,p_user,p_trade,p_type,p_delta);
END $$;
REVOKE ALL ON FUNCTION public.tradeos_post_balance_delta(uuid,uuid,uuid,text,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tradeos_post_balance_delta(uuid,uuid,uuid,text,numeric) FROM authenticated;

CREATE OR REPLACE FUNCTION public.tradeos_trade_balance_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_delta numeric(18,2); new_delta numeric(18,2);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_delta := CASE WHEN OLD.result = 'open' THEN 0 ELSE OLD.pnl END;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_delta := CASE WHEN NEW.result = 'open' THEN 0 ELSE NEW.pnl END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.tradeos_post_balance_delta(NEW.account_id, NEW.user_id, NEW.id, 'trade_insert', new_delta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.tradeos_post_balance_delta(OLD.account_id, OLD.user_id, NULL, 'trade_delete', -old_delta);
    RETURN OLD;
  ELSIF OLD.account_id IS DISTINCT FROM NEW.account_id OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.tradeos_post_balance_delta(OLD.account_id, OLD.user_id, OLD.id, 'trade_move', -old_delta);
    PERFORM public.tradeos_post_balance_delta(NEW.account_id, NEW.user_id, NEW.id, 'trade_move', new_delta);
  ELSE
    PERFORM public.tradeos_post_balance_delta(NEW.account_id, NEW.user_id, NEW.id, 'trade_update', new_delta - old_delta);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tradeos_trade_balance_trigger() FROM PUBLIC;
CREATE TRIGGER trg_tradeos_trade_balance AFTER INSERT OR UPDATE OF pnl,result,account_id,user_id OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_trade_balance_trigger();

-- Durable coalescing queue: a trade commit always records a pending revision.
CREATE TABLE public.intelligence_jobs (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1,
  claimed_revision bigint,
  processed_revision bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intelligence_jobs_ready ON public.intelligence_jobs(status,next_attempt_at);
ALTER TABLE public.intelligence_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own intelligence jobs" ON public.intelligence_jobs
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
GRANT SELECT ON public.intelligence_jobs TO authenticated;
GRANT ALL ON public.intelligence_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.tradeos_enqueue_intelligence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a uuid; u uuid;
BEGIN
  -- If a trade moves accounts, both old and new account analytics change.
  FOR a, u IN
    SELECT DISTINCT account_id, user_id FROM (
      SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.account_id END AS account_id,
             CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END AS user_id
      UNION ALL
      SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.account_id END,
             CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END
    ) q WHERE account_id IS NOT NULL
  LOOP
    INSERT INTO public.intelligence_jobs(account_id,user_id)
      VALUES (a,u)
    ON CONFLICT (account_id) DO UPDATE SET
      revision = public.intelligence_jobs.revision + 1,
      status = CASE WHEN public.intelligence_jobs.status = 'running' THEN 'running' ELSE 'pending' END,
      attempts = CASE WHEN public.intelligence_jobs.status = 'running' THEN public.intelligence_jobs.attempts ELSE 0 END,
      next_attempt_at = now(), updated_at = now();
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.tradeos_enqueue_intelligence() FROM PUBLIC;
CREATE TRIGGER trg_tradeos_enqueue_intelligence AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.tradeos_enqueue_intelligence();

-- Claim/finish operations are restricted to the server service role.
CREATE OR REPLACE FUNCTION public.claim_intelligence_jobs(p_limit integer DEFAULT 2)
RETURNS SETOF public.intelligence_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY WITH eligible AS (
    SELECT j.account_id FROM public.intelligence_jobs j
    WHERE ((j.status = 'pending' AND j.next_attempt_at <= now())
       OR (j.status = 'running' AND j.locked_at < now() - interval '15 minutes'))
      AND j.attempts < 8
    ORDER BY j.updated_at
    LIMIT LEAST(GREATEST(p_limit,1),4)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.intelligence_jobs j
    SET status = 'running', claimed_revision = j.revision,
        locked_at = now(), attempts = j.attempts + 1, updated_at = now()
    FROM eligible e WHERE j.account_id = e.account_id
    RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_intelligence_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_intelligence_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_intelligence_job(
  p_account uuid, p_revision bigint, p_success boolean, p_error text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.intelligence_jobs j SET
    processed_revision = CASE WHEN p_success THEN GREATEST(j.processed_revision,p_revision) ELSE j.processed_revision END,
    status = CASE WHEN j.revision > p_revision THEN 'pending'
                  WHEN p_success THEN 'succeeded'
                  WHEN j.attempts >= 8 THEN 'failed' ELSE 'pending' END,
    next_attempt_at = CASE WHEN p_success OR j.revision > p_revision THEN now()
                           ELSE now() + make_interval(mins => LEAST(60, (2 ^ LEAST(j.attempts,6))::integer)) END,
    locked_at = NULL,
    attempts = CASE WHEN p_success OR j.revision > p_revision THEN 0 ELSE j.attempts END,
    last_error = CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error,'Pipeline failed'),500) END,
    updated_at = now()
  WHERE j.account_id = p_account AND j.claimed_revision = p_revision;
END $$;
REVOKE ALL ON FUNCTION public.finish_intelligence_job(uuid,bigint,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_intelligence_job(uuid,bigint,boolean,text) TO service_role;

-- Existing accounts also need a first full intelligence refresh after deployment.
INSERT INTO public.intelligence_jobs(account_id,user_id)
  SELECT id,user_id FROM public.accounts ON CONFLICT (account_id) DO NOTHING;

-- A per-user, per-function hourly quota, atomically consumed via a protected RPC.
CREATE TABLE public.ai_request_quota (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fn text NOT NULL,
  window_start timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,fn,window_start)
);
ALTER TABLE public.ai_request_quota ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ai_request_quota TO service_role;

-- Existing audit log must not be editable by end users.
REVOKE INSERT, UPDATE, DELETE ON public.ai_request_log FROM authenticated;
DROP POLICY IF EXISTS "Users manage their own ai request log" ON public.ai_request_log;
CREATE POLICY "read own ai request log" ON public.ai_request_log
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_function text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid; lim integer; total integer; allowed boolean; bucket timestamptz;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  lim := CASE p_function
    WHEN 'runIntelligence' THEN 6
    WHEN 'generateCoachReview' THEN 12
    WHEN 'generateDailyAdvice' THEN 18
    ELSE NULL END;
  IF lim IS NULL THEN RAISE EXCEPTION 'Unsupported AI function'; END IF;
  bucket := date_trunc('hour',now());
  INSERT INTO public.ai_request_quota AS q (user_id,fn,window_start,used)
    VALUES (uid,p_function,bucket,1)
  ON CONFLICT (user_id,fn,window_start) DO UPDATE
    SET used = q.used + 1 WHERE q.used < lim
    RETURNING used INTO total;
  allowed := total IS NOT NULL;
  INSERT INTO public.ai_request_log(user_id,fn,allowed,reason)
    VALUES (uid,p_function,allowed,CASE WHEN allowed THEN NULL ELSE 'hourly_quota' END);
  RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text) TO authenticated;

-- Preserve engine history instead of deleting and reinserting stable IDs.
ALTER TABLE public.root_causes ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS root_causes_current ON public.root_causes(user_id,account_id,is_current);
CREATE INDEX IF NOT EXISTS recommendations_current ON public.recommendations(user_id,account_id,is_current);

-- One active manual per trader. Historical versions remain unchanged.
CREATE UNIQUE INDEX IF NOT EXISTS tom_one_active_per_user ON public.tom_versions(user_id) WHERE is_active;

-- Used by older client builds during rolling deployments: a read-only
-- capability probe. Absent on pre-migration environments (PGRST202).
CREATE OR REPLACE FUNCTION public.tradeos_foundation_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT true; $$;
REVOKE ALL ON FUNCTION public.tradeos_foundation_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_foundation_ready() TO authenticated;
