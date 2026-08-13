CREATE TYPE public.memory_kind AS ENUM ('discovery', 'change', 'regression', 'milestone', 'manual_change', 'intervention');
CREATE TYPE public.lifecycle_status AS ENUM ('emerging', 'durable', 'archived');

CREATE TABLE public.memory_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind public.memory_kind NOT NULL,
  title text NOT NULL,
  body text,
  entry_key text,
  refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX memory_entries_dedupe ON public.memory_entries (user_id, account_id, kind, entry_key) WHERE entry_key IS NOT NULL;
CREATE INDEX memory_entries_time ON public.memory_entries (user_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_entries TO authenticated;
GRANT ALL ON public.memory_entries TO service_role;
ALTER TABLE public.memory_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory entries" ON public.memory_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.insight_lifecycle (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  insight_key text NOT NULL,
  claim text NOT NULL,
  category text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  confirmations integer NOT NULL DEFAULT 0,
  contradictions integer NOT NULL DEFAULT 0,
  last_observed_value numeric,
  status public.lifecycle_status NOT NULL DEFAULT 'emerging',
  archived_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX insight_lifecycle_key ON public.insight_lifecycle (user_id, account_id, insight_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_lifecycle TO authenticated;
GRANT ALL ON public.insight_lifecycle TO service_role;
ALTER TABLE public.insight_lifecycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insight lifecycle" ON public.insight_lifecycle FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_insight_lifecycle_updated BEFORE UPDATE ON public.insight_lifecycle FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.graph_nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  node_type text NOT NULL,
  label text NOT NULL,
  occurrences integer NOT NULL DEFAULT 0,
  impact_estimate numeric,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX graph_nodes_key ON public.graph_nodes (user_id, account_id, node_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.graph_nodes TO authenticated;
GRANT ALL ON public.graph_nodes TO service_role;
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own graph nodes" ON public.graph_nodes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.graph_edges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  edge_key text NOT NULL,
  source_key text NOT NULL,
  target_key text NOT NULL,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  impact_estimate numeric,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX graph_edges_key ON public.graph_edges (user_id, account_id, edge_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.graph_edges TO authenticated;
GRANT ALL ON public.graph_edges TO service_role;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own graph edges" ON public.graph_edges FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.advice_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  advice_key text NOT NULL,
  advice_type text NOT NULL,
  title text,
  intervention_id uuid REFERENCES public.interventions(id) ON DELETE SET NULL,
  accepted boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  respected_rate numeric,
  checks_total integer NOT NULL DEFAULT 0,
  worked boolean,
  weight numeric NOT NULL DEFAULT 1,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX advice_outcomes_key ON public.advice_outcomes (user_id, account_id, advice_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advice_outcomes TO authenticated;
GRANT ALL ON public.advice_outcomes TO service_role;
ALTER TABLE public.advice_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own advice outcomes" ON public.advice_outcomes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_advice_outcomes_updated BEFORE UPDATE ON public.advice_outcomes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();