ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS tom_version_id uuid REFERENCES public.tom_versions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trades_tom_version ON public.trades(tom_version_id);
CREATE INDEX IF NOT EXISTS idx_trades_user_account_entered ON public.trades(user_id, account_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_events_user_account_occurred ON public.behavior_events(user_id, account_id, occurred_at DESC);

ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS ci_low numeric;
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS ci_high numeric;
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS p_value numeric;
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS q_value numeric;
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS tests_in_run integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fn text NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  allowed boolean NOT NULL DEFAULT true,
  reason text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_request_log TO authenticated;
GRANT ALL ON public.ai_request_log TO service_role;
ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own ai request log" ON public.ai_request_log
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_user_fn_created ON public.ai_request_log(user_id, fn, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_snapshots_account_day ON public.daily_snapshots(account_id, day);