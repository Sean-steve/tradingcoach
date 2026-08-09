-- ENUMS
CREATE TYPE public.behavior_category AS ENUM ('emotional','decision','discipline','risk','cognitive_bias');
CREATE TYPE public.behavior_source AS ENUM ('derived','manual');
CREATE TYPE public.insight_status AS ENUM ('validated','insufficient_evidence','invalidated');
CREATE TYPE public.recommendation_status AS ENUM ('active','accepted','dismissed','completed');

-- 1. TOM VERSIONS
CREATE TABLE public.tom_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  identity text,
  markets text[] NOT NULL DEFAULT '{}',
  strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  sessions text[] NOT NULL DEFAULT '{}',
  risk_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  non_negotiables text[] NOT NULL DEFAULT '{}',
  routines jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tom_versions TO authenticated;
GRANT ALL ON public.tom_versions TO service_role;
ALTER TABLE public.tom_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tom versions" ON public.tom_versions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_tom_versions_updated BEFORE UPDATE ON public.tom_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. BEHAVIOR TAXONOMY (shared catalog)
CREATE TABLE public.behavior_taxonomy (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category public.behavior_category NOT NULL,
  default_severity integer NOT NULL DEFAULT 3,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.behavior_taxonomy TO authenticated;
GRANT ALL ON public.behavior_taxonomy TO service_role;
ALTER TABLE public.behavior_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxonomy readable" ON public.behavior_taxonomy FOR SELECT TO authenticated USING (true);

-- 3. BEHAVIOR EVENTS
CREATE TABLE public.behavior_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.trades(id) ON DELETE CASCADE,
  code text NOT NULL REFERENCES public.behavior_taxonomy(code),
  category public.behavior_category NOT NULL,
  severity integer NOT NULL DEFAULT 3,
  source public.behavior_source NOT NULL DEFAULT 'derived',
  detector text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX behavior_events_derived_unique
  ON public.behavior_events (trade_id, code) WHERE source = 'derived' AND trade_id IS NOT NULL;
CREATE INDEX behavior_events_user_time ON public.behavior_events (user_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavior_events TO authenticated;
GRANT ALL ON public.behavior_events TO service_role;
ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own behavior events" ON public.behavior_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. INSIGHTS
CREATE TABLE public.insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  insight_key text NOT NULL,
  category text NOT NULL,
  claim text NOT NULL,
  metric text NOT NULL,
  status public.insight_status NOT NULL DEFAULT 'insufficient_evidence',
  sample_size integer NOT NULL DEFAULT 0,
  baseline_value numeric,
  observed_value numeric,
  delta numeric,
  confidence numeric NOT NULL DEFAULT 0,
  impact_estimate numeric,
  min_sample integer NOT NULL DEFAULT 20,
  window_start date,
  window_end date,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id, insight_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO authenticated;
GRANT ALL ON public.insights TO service_role;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insights" ON public.insights FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_insights_updated BEFORE UPDATE ON public.insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. INSIGHT EVIDENCE
CREATE TABLE public.insight_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insight_id uuid NOT NULL REFERENCES public.insights(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  label text NOT NULL,
  value text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insight_evidence_insight ON public.insight_evidence (insight_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_evidence TO authenticated;
GRANT ALL ON public.insight_evidence TO service_role;
ALTER TABLE public.insight_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insight evidence" ON public.insight_evidence FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. ROOT CAUSES
CREATE TABLE public.root_causes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  cause_key text NOT NULL,
  title text NOT NULL,
  explanation text,
  chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  insight_ids uuid[] NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0,
  impact_estimate numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id, cause_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.root_causes TO authenticated;
GRANT ALL ON public.root_causes TO service_role;
ALTER TABLE public.root_causes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own root causes" ON public.root_causes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_root_causes_updated BEFORE UPDATE ON public.root_causes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. RECOMMENDATIONS
CREATE TABLE public.recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  recommendation_key text NOT NULL,
  root_cause_id uuid REFERENCES public.root_causes(id) ON DELETE SET NULL,
  insight_id uuid REFERENCES public.insights(id) ON DELETE SET NULL,
  title text NOT NULL,
  action text NOT NULL,
  rationale text,
  priority integer NOT NULL DEFAULT 3,
  impact_estimate numeric,
  confidence numeric NOT NULL DEFAULT 0,
  status public.recommendation_status NOT NULL DEFAULT 'active',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id, recommendation_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recommendations" ON public.recommendations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_recommendations_updated BEFORE UPDATE ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. DECISION SCORES
CREATE TABLE public.decision_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE UNIQUE,
  plan_adherence integer NOT NULL DEFAULT 3,
  entry_quality integer NOT NULL DEFAULT 3,
  risk_control integer NOT NULL DEFAULT 3,
  patience integer NOT NULL DEFAULT 3,
  exit_quality integer NOT NULL DEFAULT 3,
  process_score numeric NOT NULL DEFAULT 0,
  source public.behavior_source NOT NULL DEFAULT 'derived',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_scores TO authenticated;
GRANT ALL ON public.decision_scores TO service_role;
ALTER TABLE public.decision_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decision scores" ON public.decision_scores FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_decision_scores_updated BEFORE UPDATE ON public.decision_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SEED CANONICAL BEHAVIOR TAXONOMY
INSERT INTO public.behavior_taxonomy (code, name, category, default_severity, description) VALUES
  ('fomo','FOMO entry','emotional',4,'Entered because price was moving, not because the setup appeared.'),
  ('fear','Fear','emotional',3,'Hesitated or cut early because of fear of loss.'),
  ('greed','Greed','emotional',4,'Held or sized up beyond plan chasing more profit.'),
  ('frustration','Frustration','emotional',4,'Traded while frustrated after an adverse outcome.'),
  ('overconfidence','Overconfidence','emotional',4,'Traded larger or looser after a winning run.'),
  ('stress','Elevated stress','emotional',3,'Traded while stress was high relative to baseline.'),
  ('fatigue','Mental fatigue','emotional',3,'Traded while mentally fatigued or under-rested.'),
  ('calm','Calm execution','emotional',1,'Executed in a calm, regulated state.'),
  ('late_entry','Late entry','decision',3,'Entered after the planned trigger level.'),
  ('early_entry','Early entry','decision',3,'Entered before confirmation of the setup.'),
  ('hesitation','Hesitation','decision',2,'Delayed acting on a valid signal.'),
  ('no_plan','No plan','decision',5,'Traded without a defined plan or thesis.'),
  ('moved_stop','Moved stop','decision',5,'Moved the stop loss against the position.'),
  ('early_exit','Premature exit','decision',3,'Closed before the plan target or invalidation.'),
  ('rule_break','Rule break','discipline',5,'Violated a rule in the trading operating manual.'),
  ('checklist_skipped','Checklist skipped','discipline',3,'Executed without completing the pre-trade checklist.'),
  ('overtrading','Overtrading','discipline',4,'Exceeded the planned trade count for the session.'),
  ('revenge_trade','Revenge trade','discipline',5,'Re-entered quickly after a loss to recover it.'),
  ('journal_skipped','Journal skipped','discipline',2,'Closed a trade without a post-trade note.'),
  ('oversize','Position oversize','risk',5,'Risked more than the manual permits on a single trade.'),
  ('risk_escalation','Risk escalation','risk',5,'Increased risk after losses instead of reducing it.'),
  ('no_stop','No stop loss','risk',5,'Opened a position without a defined stop.'),
  ('daily_loss_breach','Daily loss breach','risk',5,'Continued trading past the daily loss limit.'),
  ('correlated_exposure','Correlated exposure','risk',3,'Stacked positions with overlapping risk.'),
  ('anchoring','Anchoring','cognitive_bias',3,'Anchored to an entry price or prior level.'),
  ('recency','Recency bias','cognitive_bias',3,'Weighted the most recent outcomes too heavily.'),
  ('confirmation','Confirmation bias','cognitive_bias',3,'Sought only evidence supporting the existing view.'),
  ('loss_aversion','Loss aversion','cognitive_bias',4,'Held a loser to avoid realising the loss.'),
  ('gamblers_fallacy','Gambler''s fallacy','cognitive_bias',4,'Assumed a reversal was due after a run.'),
  ('outcome_bias','Outcome bias','cognitive_bias',3,'Judged a decision purely by its profit or loss.');