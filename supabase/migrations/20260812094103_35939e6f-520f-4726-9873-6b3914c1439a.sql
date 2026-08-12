CREATE TYPE public.intervention_status AS ENUM ('active','succeeded','failed','archived');
CREATE TYPE public.intervention_trigger AS ENUM ('loss_streak','stress_level','risk_above','trades_today','session','behavior_code','always');
CREATE TYPE public.intervention_trend AS ENUM ('improving','flat','regressing','insufficient_evidence');
CREATE TYPE public.guardrail_outcome AS ENUM ('respected','overridden','not_triggered');

CREATE TABLE public.interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  insight_id uuid REFERENCES public.insights(id) ON DELETE SET NULL,
  habit_id uuid REFERENCES public.habits(id) ON DELETE SET NULL,
  title text NOT NULL,
  action text NOT NULL,
  evidence text,
  trigger_type public.intervention_trigger NOT NULL DEFAULT 'always',
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_behavior_code text,
  baseline_rate numeric,
  target_rate numeric,
  observed_rate numeric,
  trend public.intervention_trend NOT NULL DEFAULT 'insufficient_evidence',
  sample_size integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  hard_block boolean NOT NULL DEFAULT false,
  status public.intervention_status NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  review_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interventions TO authenticated;
GRANT ALL ON public.interventions TO service_role;
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own interventions" ON public.interventions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_interventions_updated BEFORE UPDATE ON public.interventions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.guardrail_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_id uuid NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  triggered boolean NOT NULL DEFAULT true,
  outcome public.guardrail_outcome NOT NULL DEFAULT 'respected',
  note text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardrail_checks TO authenticated;
GRANT ALL ON public.guardrail_checks TO service_role;
ALTER TABLE public.guardrail_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own guardrail checks" ON public.guardrail_checks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.twin_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.twin_scenarios TO authenticated;
GRANT ALL ON public.twin_scenarios TO service_role;
ALTER TABLE public.twin_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own twin scenarios" ON public.twin_scenarios FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_twin_scenarios_updated BEFORE UPDATE ON public.twin_scenarios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();