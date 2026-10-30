-- TRADE OS v2 Phase 4 — Personal Goals, Milestones & Lifestyle Reward Planning
-- Prerequisites: all prior migrations from Phase 1–3. Safe by default:
-- does not transfer cash, credit funded balances, or rewrite historical P&L.

ALTER TABLE public.goals
  ADD COLUMN horizon text NOT NULL DEFAULT 'custom'
    CHECK(horizon IN ('daily','weekly','monthly','quarterly','annual','custom')),
  ADD COLUMN target_mode text NOT NULL DEFAULT 'absolute'
    CHECK(target_mode IN ('absolute','incremental')),
  ADD COLUMN trading_weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[];
-- Existing goals retain absolute semantics. New goals may use incremental
-- targets relative to the creation-time starting_value snapshot.

CREATE TABLE public.goal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  target_value numeric(18,3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(goal_id,target_value)
);
CREATE INDEX goal_milestones_user_goal ON public.goal_milestones(user_id,goal_id);
ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goal milestones" ON public.goal_milestones FOR ALL TO authenticated
  USING ((select auth.uid())=user_id AND EXISTS (
    SELECT 1 FROM public.goals g WHERE g.id=goal_id AND g.user_id=(select auth.uid())
  ))
  WITH CHECK ((select auth.uid())=user_id AND EXISTS (
    SELECT 1 FROM public.goals g WHERE g.id=goal_id AND g.user_id=(select auth.uid())
  ));
GRANT SELECT,INSERT,DELETE ON public.goal_milestones TO authenticated;
GRANT ALL ON public.goal_milestones TO service_role;

-- Existing goals allow arbitrary account foreign keys if the user owns the
-- goal but not the account. Enforce account ownership at the DB boundary.
CREATE OR REPLACE FUNCTION public.tradeos_verify_goal_account()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id
  ) THEN RAISE EXCEPTION 'Goal account ownership mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_goal_owner BEFORE INSERT OR UPDATE OF account_id,user_id
 ON public.goals FOR EACH ROW EXECUTE FUNCTION public.tradeos_verify_goal_account();

CREATE TABLE public.lifestyle_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  linked_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description text,
  category text NOT NULL DEFAULT 'experience'
    CHECK (category IN ('travel','experience','purchase','education','other')),
  destination text,
  currency text NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  budget numeric(18,2) NOT NULL CHECK(budget > 0),
  funding_cap_pct numeric(5,2) NOT NULL DEFAULT 5.0
    CHECK(funding_cap_pct BETWEEN 0.1 AND 10),
  min_closed_trades integer NOT NULL DEFAULT 20
    CHECK(min_closed_trades BETWEEN 20 AND 10000),
  min_plan_adherence_pct numeric(5,2) NOT NULL DEFAULT 80
    CHECK(min_plan_adherence_pct BETWEEN 70 AND 100),
  target_date date,
  status text NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned','redeemed_reported','archived')),
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lifestyle_rewards_account ON public.lifestyle_rewards(user_id,account_id,created_at DESC);
ALTER TABLE public.lifestyle_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read and create own reward plans" ON public.lifestyle_rewards
 FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
CREATE POLICY "create own reward plans" ON public.lifestyle_rewards
 FOR INSERT TO authenticated WITH CHECK (
   (select auth.uid())=user_id AND EXISTS (
     SELECT 1 FROM public.accounts a WHERE a.id=account_id AND a.user_id=(select auth.uid())
   )
   AND status='planned' AND redeemed_at IS NULL
   AND (linked_goal_id IS NULL OR EXISTS (
     SELECT 1 FROM public.goals g WHERE g.id=linked_goal_id AND g.user_id=(select auth.uid())
       AND g.account_id=account_id AND g.metric IN ('pnl','trade_count')
   ))
 );
CREATE POLICY "update own reward plans" ON public.lifestyle_rewards
 FOR UPDATE TO authenticated
 USING ((select auth.uid())=user_id AND status='planned')
 WITH CHECK ((select auth.uid())=user_id AND status IN ('planned','archived')
  AND EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=account_id AND a.user_id=(select auth.uid())));
GRANT SELECT, INSERT ON public.lifestyle_rewards TO authenticated;
GRANT UPDATE (title,description,category,destination,target_date,status,updated_at)
 ON public.lifestyle_rewards TO authenticated;
GRANT ALL ON public.lifestyle_rewards TO service_role;
CREATE TRIGGER trg_lifestyle_rewards_updated BEFORE UPDATE ON public.lifestyle_rewards
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable, user-visible earmarking and self-reported external transfers.
-- NONE of these records represents bank-verified or broker-verified funds.
CREATE TABLE public.reward_funding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES public.lifestyle_rewards(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK(event_type IN ('pledge','reported_transfer')),
  amount numeric(18,2) NOT NULL CHECK(amount > 0),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(event_type='pledge' OR length(trim(coalesce(source_reference,'')))>=5)
);
-- A self-reported transfer reference cannot be used twice across rewards.
CREATE UNIQUE INDEX reward_transfer_reference_once ON public.reward_funding_events(user_id,source_reference)
 WHERE event_type='reported_transfer';
CREATE INDEX reward_funding_reward_time ON public.reward_funding_events(user_id,reward_id,created_at DESC);
ALTER TABLE public.reward_funding_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own reward planning ledger" ON public.reward_funding_events
 FOR SELECT TO authenticated USING((select auth.uid())=user_id);
GRANT SELECT ON public.reward_funding_events TO authenticated;
GRANT ALL ON public.reward_funding_events TO service_role;

-- Locks the trading account across concurrent reward contributions.
-- 10% of cumulative POSITIVE net P&L is a global earmarking ceiling,
-- reduced further by existing tax/reserve allocations and each reward's cap.
-- Never pretends that a journaled winning trade is withdrawable cash.
CREATE OR REPLACE FUNCTION public.tradeos_reward_event(
  p_reward uuid,p_type text,p_amount numeric,p_reference text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid := auth.uid();
  reward public.lifestyle_rewards%ROWTYPE;
  acct public.accounts%ROWTYPE;
  realized numeric(18,2);
  reserved numeric(18,2);
  eligible numeric(18,2);
  global_planned numeric(18,2);
  reward_planned numeric(18,2);
  reward_transferred numeric(18,2);
  cap numeric(18,2);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_type NOT IN ('pledge','reported_transfer') THEN RAISE EXCEPTION 'Unsupported funding event'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN RAISE EXCEPTION 'Invalid contribution'; END IF;

  SELECT * INTO reward FROM public.lifestyle_rewards r
    WHERE r.id=p_reward AND r.user_id=uid AND r.status='planned' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward is not active or does not belong to you'; END IF;
  SELECT * INTO acct FROM public.accounts a WHERE a.id=reward.account_id
    AND a.user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account ownership mismatch'; END IF;
  IF acct.account_type='demo'::public.account_type THEN
    RAISE EXCEPTION 'Demo trading cannot fund real-life rewards';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=uid AND upper(coalesce(p.base_currency,'USD'))<>reward.currency
  ) THEN RAISE EXCEPTION 'Reward currency must match the trading profile base currency'; END IF;

  SELECT coalesce(sum(t.pnl),0) INTO realized FROM public.trades t
   WHERE t.account_id=acct.id AND t.user_id=uid AND t.result<>'open';
  SELECT coalesce(sum(p.amount),0) INTO reserved FROM public.profit_allocations p
   WHERE p.account_id=acct.id AND p.user_id=uid AND p.bucket IN ('tax','reserve');
  eligible := greatest(0,realized - greatest(0,reserved));
  SELECT coalesce(sum(f.amount),0) INTO global_planned FROM public.reward_funding_events f
   WHERE f.user_id=uid AND f.account_id=acct.id AND f.event_type='pledge';
  SELECT coalesce(sum(f.amount) FILTER(WHERE f.event_type='pledge'),0),
         coalesce(sum(f.amount) FILTER(WHERE f.event_type='reported_transfer'),0)
   INTO reward_planned,reward_transferred FROM public.reward_funding_events f
   WHERE f.reward_id=reward.id AND f.user_id=uid;

  IF p_type='pledge' THEN
    cap := round(eligible * LEAST(10.0,reward.funding_cap_pct) / 100,2);
    IF global_planned+p_amount > round(eligible*0.10,2) OR reward_planned+p_amount > cap
      OR reward_planned+p_amount > reward.budget THEN
      RAISE EXCEPTION 'Contribution exceeds reward budget or conservative profit allocation ceiling';
    END IF;
  ELSE
    IF length(trim(coalesce(p_reference,''))) < 5 THEN
      RAISE EXCEPTION 'External transfer reference and self-attestation required';
    END IF;
    IF reward_transferred+p_amount > reward_planned THEN
      RAISE EXCEPTION 'Cannot report more external transfers than previously planned';
    END IF;
    -- This is user-declared evidence, not payment verification. The application
    -- must label it as self-reported, not available/withdrawable money.
  END IF;

  INSERT INTO public.reward_funding_events(user_id,account_id,reward_id,event_type,amount,source_reference)
    VALUES(uid,acct.id,reward.id,p_type,round(p_amount,2),
           CASE WHEN p_type='reported_transfer' THEN trim(p_reference) ELSE NULL END);
  RETURN jsonb_build_object('event_type',p_type,'amount',round(p_amount,2),'verified',false);
END $$;
REVOKE ALL ON FUNCTION public.tradeos_reward_event(uuid,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_reward_event(uuid,text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tradeos_report_reward_redemption(p_reward uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid := auth.uid(); reward public.lifestyle_rewards%ROWTYPE;
  reported numeric; trades_n integer; adherence numeric;
  linked public.goals%ROWTYPE; metric_value numeric; effective_target numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO reward FROM public.lifestyle_rewards r
   WHERE r.id=p_reward AND r.user_id=uid AND r.status='planned' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not available'; END IF;
  SELECT coalesce(sum(f.amount),0) INTO reported
    FROM public.reward_funding_events f WHERE f.reward_id=reward.id
    AND f.user_id=uid AND f.event_type='reported_transfer';
  IF reported<reward.budget THEN RAISE EXCEPTION 'Self-reported external savings do not meet budget'; END IF;
  SELECT count(*),coalesce(100.0*sum(CASE WHEN followed_plan=true THEN 1 ELSE 0 END)/nullif(count(*),0),0)
    INTO trades_n,adherence FROM public.trades t
   WHERE t.account_id=reward.account_id AND t.user_id=uid AND t.result<>'open';
  IF trades_n<reward.min_closed_trades OR adherence<reward.min_plan_adherence_pct THEN
    RAISE EXCEPTION 'Risk-discipline process requirements not met';
  END IF;
  IF reward.linked_goal_id IS NOT NULL THEN
    SELECT * INTO linked FROM public.goals g WHERE g.id=reward.linked_goal_id
      AND g.user_id=uid AND g.account_id=reward.account_id AND g.status<>'archived';
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked goal not available'; END IF;
    IF linked.metric='pnl'::public.goal_metric THEN
      SELECT coalesce(sum(t.pnl),0) INTO metric_value FROM public.trades t
        WHERE t.account_id=reward.account_id AND t.user_id=uid AND t.result<>'open';
    ELSIF linked.metric='trade_count'::public.goal_metric THEN
      metric_value:=trades_n;
    ELSE RAISE EXCEPTION 'Unsupported linked goal metric'; END IF;
    effective_target := CASE WHEN linked.target_mode='incremental' THEN
      coalesce(linked.starting_value,0)+linked.target_value ELSE linked.target_value END;
    IF metric_value<effective_target THEN RAISE EXCEPTION 'Linked goal not yet reached'; END IF;
  END IF;
  UPDATE public.lifestyle_rewards SET status='redeemed_reported',redeemed_at=now() WHERE id=reward.id;
  RETURN true; -- User declares they paid; DOES NOT process or verify payment.
END $$;
REVOKE ALL ON FUNCTION public.tradeos_report_reward_redemption(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_report_reward_redemption(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tradeos_phase4_ready() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT true$$;
REVOKE ALL ON FUNCTION public.tradeos_phase4_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_phase4_ready() TO authenticated;
