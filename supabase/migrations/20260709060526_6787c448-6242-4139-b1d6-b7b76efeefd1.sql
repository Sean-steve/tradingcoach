-- GOALS
CREATE TYPE public.goal_metric AS ENUM ('pnl','win_rate','profit_factor','discipline_score','consistency','trade_count','max_drawdown_pct','performance_score');
CREATE TYPE public.goal_status AS ENUM ('active','achieved','failed','archived');

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metric public.goal_metric NOT NULL,
  target_value numeric NOT NULL,
  starting_value numeric,
  deadline date,
  status public.goal_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  achieved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- HABITS
CREATE TYPE public.habit_cadence AS ENUM ('daily','weekly');

CREATE TABLE public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  cadence public.habit_cadence NOT NULL DEFAULT 'daily',
  target_per_period int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own habits" ON public.habits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER habits_updated BEFORE UPDATE ON public.habits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  completed boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, log_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT ALL ON public.habit_logs TO service_role;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own habit logs" ON public.habit_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX habit_logs_user_date ON public.habit_logs(user_id, log_date DESC);

-- BADGES CATALOG (shared, readable to authenticated)
CREATE TYPE public.badge_tier AS ENUM ('bronze','silver','gold','platinum');
CREATE TYPE public.badge_category AS ENUM ('discipline','consistency','psychology','milestone','risk');

CREATE TABLE public.badges_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  category public.badge_category NOT NULL,
  tier public.badge_tier NOT NULL DEFAULT 'bronze',
  icon text,
  criteria jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.badges_catalog TO authenticated;
GRANT ALL ON public.badges_catalog TO service_role;
ALTER TABLE public.badges_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read catalog" ON public.badges_catalog FOR SELECT TO authenticated USING (true);

-- USER BADGES
CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges_catalog(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  UNIQUE (user_id, badge_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user badges" ON public.user_badges FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed badges catalog
INSERT INTO public.badges_catalog (code, name, description, category, tier, icon, criteria) VALUES
  ('first_trade','First Step','Logged your first trade','milestone','bronze','flag','{"type":"trade_count","gte":1}'),
  ('ten_trades','Journalist','Logged 10 trades','milestone','bronze','book','{"type":"trade_count","gte":10}'),
  ('fifty_trades','Chronicler','Logged 50 trades','milestone','silver','book-open','{"type":"trade_count","gte":50}'),
  ('hundred_trades','Century','Logged 100 trades','milestone','gold','trophy','{"type":"trade_count","gte":100}'),
  ('discipline_80','Disciplined','Discipline score at or above 80','discipline','silver','shield','{"type":"discipline_score","gte":80}'),
  ('discipline_90','Iron Discipline','Discipline score at or above 90','discipline','gold','shield-check','{"type":"discipline_score","gte":90}'),
  ('no_mistakes_week','Clean Week','7 days with zero mistakes logged','discipline','silver','sparkles','{"type":"clean_days","gte":7}'),
  ('streak_5','Hot Hand','5-trade win streak','consistency','silver','flame','{"type":"win_streak","gte":5}'),
  ('streak_10','Locked In','10-trade win streak','consistency','gold','zap','{"type":"win_streak","gte":10}'),
  ('pf_2','Edge Confirmed','Profit factor at or above 2.0','consistency','gold','trending-up','{"type":"profit_factor","gte":2}'),
  ('habit_7','Habit Formed','7-day habit streak','psychology','bronze','check-circle','{"type":"habit_streak","gte":7}'),
  ('habit_30','Ritualist','30-day habit streak','psychology','platinum','crown','{"type":"habit_streak","gte":30}');
