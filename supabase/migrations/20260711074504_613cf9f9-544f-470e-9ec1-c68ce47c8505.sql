
-- Notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Challenges catalog
CREATE TABLE public.challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  duration_days INTEGER NOT NULL,
  reward_badge_slug TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read challenges" ON public.challenges FOR SELECT TO authenticated USING (true);

-- Challenge progress
CREATE TABLE public.challenge_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id, started_at)
);
CREATE INDEX idx_cp_user ON public.challenge_progress(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_progress TO authenticated;
GRANT ALL ON public.challenge_progress TO service_role;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress" ON public.challenge_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.challenge_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a few challenges
INSERT INTO public.challenges (slug, title, description, metric, target_value, duration_days, reward_badge_slug) VALUES
  ('discipline-7', '7-Day Discipline Streak', 'Log a trade with zero rule violations for 7 consecutive trading days.', 'clean_days', 7, 14, 'discipline_streak'),
  ('journal-30', '30 Journaled Trades', 'Journal 30 trades with pre-trade notes and setup quality.', 'journaled_trades', 30, 30, 'journal_master'),
  ('profit-factor-2', 'Profit Factor 2.0', 'Reach a rolling profit factor of 2.0 across at least 20 trades.', 'profit_factor', 2, 30, 'pf_2'),
  ('no-revenge-14', 'No Revenge Trades (14d)', 'Zero revenge-trade mistakes tagged for 14 days.', 'no_revenge_days', 14, 14, 'cool_head');
