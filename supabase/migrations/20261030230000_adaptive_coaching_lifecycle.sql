-- TRADE OS v2 — Phase 3 adaptive coaching lifecycle.
-- Apply only after 20261030170000 and 20261030220000 on the correct TRADE OS project.
-- No historical records are erased or force-completed.

-- A recommendation cannot be resolved by editing arbitrary JSON or mutable client state.
-- Each state transition and optional guardrail activation happens in one DB transaction.
CREATE TABLE public.recommendation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('accept','activate','dismiss','complete')),
  previous_status public.recommendation_status NOT NULL,
  new_status public.recommendation_status NOT NULL,
  note text,
  intervention_id uuid REFERENCES public.interventions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendation_actions_user_account_time
 ON public.recommendation_actions(user_id,account_id,created_at DESC);
CREATE INDEX recommendation_actions_recommendation_time
 ON public.recommendation_actions(recommendation_id,created_at DESC);
ALTER TABLE public.recommendation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own recommendation actions" ON public.recommendation_actions
 FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
GRANT SELECT ON public.recommendation_actions TO authenticated;
GRANT ALL ON public.recommendation_actions TO service_role;

ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS baseline_n integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_n integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjusted_q numeric,
  ADD COLUMN IF NOT EXISTS win_rate_effect_points numeric;
CREATE INDEX IF NOT EXISTS interventions_recommendation_idx
 ON public.interventions(recommendation_id);

-- Do not expose raw INSERT/UPDATE privileges on system-computed recommendation
-- and intervention outcomes to clients. All transitions use the protected RPC.
REVOKE INSERT, UPDATE, DELETE ON public.recommendations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.recommendation_actions FROM authenticated;
-- Users may still modify their explicitly configured guardrails (e.g. hard-block
-- flag); measured outcome fields are owned by the server worker.
REVOKE INSERT, UPDATE, DELETE ON public.interventions FROM authenticated;
GRANT UPDATE (hard_block, status, resolved_at, updated_at)
  ON public.interventions TO authenticated;

-- Authenticated clients can archive their guardrail or change its advisory
-- hard-block preference; only background workers may mark evidence-based success.
CREATE OR REPLACE FUNCTION public.tradeos_guard_client_intervention_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'archived'::public.intervention_status THEN
      RAISE EXCEPTION 'Only the measurement service may grade a guardrail';
    END IF;
    IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
      AND NEW.status <> 'archived'::public.intervention_status THEN
      RAISE EXCEPTION 'Review date cannot be assigned by a client';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tradeos_guard_client_intervention_update
 BEFORE UPDATE ON public.interventions
 FOR EACH ROW EXECUTE FUNCTION public.tradeos_guard_client_intervention_update();

CREATE OR REPLACE FUNCTION public.tradeos_recommendation_action(
 p_recommendation uuid, p_action text, p_note text DEFAULT NULL, p_guardrail jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 uid uuid := auth.uid();
 rec public.recommendations%ROWTYPE;
 insight_state public.insight_status;
 next_state public.recommendation_status;
 iv_id uuid;
 iv_trigger text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_action NOT IN ('accept','activate','dismiss','complete') THEN RAISE EXCEPTION 'Invalid recommendation action'; END IF;
 IF length(coalesce(p_note,'')) > 1000 THEN RAISE EXCEPTION 'Feedback is too long'; END IF;

 SELECT * INTO rec FROM public.recommendations
  WHERE id=p_recommendation AND user_id=uid AND is_current=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation not found or not current'; END IF;
 IF rec.account_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.accounts a WHERE a.id=rec.account_id AND a.user_id=uid
 ) THEN RAISE EXCEPTION 'Invalid account ownership'; END IF;

 IF p_action IN ('accept','activate') THEN
  IF rec.status NOT IN ('active','accepted') THEN RAISE EXCEPTION 'Recommendation is no longer actionable'; END IF;
  -- A recommendation can be backed by an explicit insight OR by a root
  -- cause that references one or more currently validated insights.
  IF rec.insight_id IS NOT NULL THEN
    SELECT status INTO insight_state FROM public.insights
      WHERE id=rec.insight_id AND user_id=uid AND account_id=rec.account_id;
  ELSIF rec.root_cause_id IS NOT NULL THEN
    SELECT i.status INTO insight_state
    FROM public.root_causes cause
    JOIN public.insights i ON i.id = ANY(cause.insight_ids)
    WHERE cause.id=rec.root_cause_id AND cause.user_id=uid
      AND cause.account_id=rec.account_id AND cause.is_current=true
      AND i.user_id=uid AND i.account_id=rec.account_id
      AND i.status='validated'::public.insight_status
    LIMIT 1;
  END IF;
  IF insight_state IS DISTINCT FROM 'validated'::public.insight_status THEN
    RAISE EXCEPTION 'Recommendation no longer has validated evidence';
  END IF;
  next_state := 'accepted';
 ELSIF p_action='complete' THEN
  IF rec.status <> 'accepted' THEN RAISE EXCEPTION 'Accept the recommendation before completing it'; END IF;
  next_state := 'completed';
 ELSE
  IF rec.status NOT IN ('active','accepted') THEN RAISE EXCEPTION 'Cannot dismiss a closed recommendation'; END IF;
  next_state := 'dismissed';
 END IF;

 IF p_action='activate' THEN
  IF p_guardrail IS NULL OR jsonb_typeof(p_guardrail) <> 'object' THEN RAISE EXCEPTION 'Guardrail configuration required'; END IF;
  iv_trigger := p_guardrail->>'trigger_type';
  IF iv_trigger NOT IN ('loss_streak','stress_level','risk_above','trades_today','session','behavior_code','always')
   THEN RAISE EXCEPTION 'Invalid intervention trigger'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interventions WHERE user_id=uid AND recommendation_id=rec.id) THEN
    INSERT INTO public.interventions(
      user_id,account_id,recommendation_id,insight_id,title,action,trigger_type,
      trigger_config,hard_block,target_behavior_code,evidence,confidence
    ) VALUES (
      uid,rec.account_id,rec.id,rec.insight_id,
      left(rec.title,500),left(rec.action,2000),iv_trigger::public.intervention_trigger,
      coalesce(p_guardrail->'trigger_config','{}'::jsonb),coalesce((p_guardrail->>'hard_block')::boolean,false),
      nullif(left(coalesce(p_guardrail->>'target_behavior_code',''),100),''),
      rec.rationale,rec.confidence
    ) RETURNING id INTO iv_id;
  ELSE
    SELECT id INTO iv_id FROM public.interventions WHERE user_id=uid AND recommendation_id=rec.id ORDER BY created_at LIMIT 1;
  END IF;
 END IF;

 IF next_state <> rec.status THEN
  UPDATE public.recommendations SET status=next_state,
    resolved_at=CASE WHEN next_state IN ('completed','dismissed') THEN now() ELSE NULL END
   WHERE id=rec.id AND user_id=uid;
 END IF;
 -- 'activate' is idempotent: no duplicate event for same active guardrail.
 IF p_action <> 'activate' OR NOT EXISTS(
   SELECT 1 FROM public.recommendation_actions WHERE recommendation_id=rec.id
      AND action='activate' AND intervention_id=iv_id
 ) THEN
  INSERT INTO public.recommendation_actions(user_id,account_id,recommendation_id,action,
    previous_status,new_status,note,intervention_id)
  VALUES(uid,rec.account_id,rec.id,p_action,rec.status,next_state,nullif(trim(p_note),''),iv_id);
 END IF;
 RETURN jsonb_build_object('status',next_state,'intervention_id',iv_id);
END $$;
REVOKE ALL ON FUNCTION public.tradeos_recommendation_action(uuid,text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradeos_recommendation_action(uuid,text,text,jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.tradeos_phase3_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT true; $$;
REVOKE ALL ON FUNCTION public.tradeos_phase3_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradeos_phase3_ready() TO authenticated;
