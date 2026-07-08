
-- Enums
CREATE TYPE public.app_role AS ENUM ('user', 'admin');
CREATE TYPE public.account_type AS ENUM ('demo', 'personal', 'funded', 'prop_firm', 'crypto', 'forex', 'binary');
CREATE TYPE public.trade_direction AS ENUM ('long', 'short');
CREATE TYPE public.trade_result AS ENUM ('win', 'loss', 'breakeven', 'open');
CREATE TYPE public.trade_session AS ENUM ('asian', 'london', 'newyork', 'overlap_ln', 'overlap_ny', 'off_hours');
CREATE TYPE public.review_period AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly');

-- Helper timestamp trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT DEFAULT 'UTC',
  base_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile_all" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_roles (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_own_roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Auto-provision profile + default role + default account on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.accounts (user_id, name, account_type, starting_balance, current_balance, is_default)
  VALUES (NEW.id, 'Main Account', 'personal', 10000, 10000, true);
  RETURN NEW;
END; $$;

-- accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  broker TEXT,
  account_type account_type NOT NULL DEFAULT 'personal',
  starting_balance NUMERIC(18,2) NOT NULL DEFAULT 10000,
  current_balance NUMERIC(18,2) NOT NULL DEFAULT 10000,
  max_daily_loss NUMERIC(18,2),
  max_weekly_loss NUMERIC(18,2),
  max_risk_pct NUMERIC(6,3) DEFAULT 1.0,
  max_trades_per_day INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_accounts_all" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_accounts_user ON public.accounts(user_id);

-- strategies
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategies TO authenticated;
GRANT ALL ON public.strategies TO service_role;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_strategies_all" ON public.strategies FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_strategies_user ON public.strategies(user_id);

-- rules
CREATE TABLE public.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO authenticated;
GRANT ALL ON public.rules TO service_role;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_rules_all" ON public.rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_rules_user ON public.rules(user_id);

-- trades
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  asset TEXT NOT NULL,
  market TEXT,
  setup TEXT,
  direction trade_direction NOT NULL,
  session trade_session,
  entered_at TIMESTAMPTZ NOT NULL,
  exited_at TIMESTAMPTZ,
  entry_price NUMERIC(18,6),
  exit_price NUMERIC(18,6),
  stop_loss NUMERIC(18,6),
  take_profit NUMERIC(18,6),
  position_size NUMERIC(18,4),
  stake NUMERIC(18,2),
  risk_pct NUMERIC(6,3),
  planned_rr NUMERIC(8,3),
  realized_rr NUMERIC(8,3),
  pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  fees NUMERIC(18,2) DEFAULT 0,
  result trade_result NOT NULL DEFAULT 'open',
  duration_seconds INTEGER,
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 10),
  setup_quality INTEGER CHECK (setup_quality BETWEEN 1 AND 10),
  checklist_completed BOOLEAN DEFAULT false,
  followed_plan BOOLEAN DEFAULT true,
  pre_notes TEXT,
  post_notes TEXT,
  reason_entry TEXT,
  reason_exit TEXT,
  lessons TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_trades_all" ON public.trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_trades_updated BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_trades_user_time ON public.trades(user_id, entered_at DESC);
CREATE INDEX idx_trades_account ON public.trades(account_id, entered_at DESC);
CREATE INDEX idx_trades_strategy ON public.trades(strategy_id);
CREATE INDEX idx_trades_asset ON public.trades(user_id, asset);

-- trade_screenshots
CREATE TABLE public.trade_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'before',
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_screenshots TO authenticated;
GRANT ALL ON public.trade_screenshots TO service_role;
ALTER TABLE public.trade_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_screenshots_all" ON public.trade_screenshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_screenshots_trade ON public.trade_screenshots(trade_id);

-- psychology_checkins
CREATE TABLE public.psychology_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('pre','post','daily')),
  mood INTEGER CHECK (mood BETWEEN 1 AND 10),
  energy INTEGER CHECK (energy BETWEEN 1 AND 10),
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 10),
  stress INTEGER CHECK (stress BETWEEN 1 AND 10),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  focus INTEGER CHECK (focus BETWEEN 1 AND 10),
  motivation INTEGER CHECK (motivation BETWEEN 1 AND 10),
  fear INTEGER CHECK (fear BETWEEN 1 AND 10),
  greed INTEGER CHECK (greed BETWEEN 1 AND 10),
  patience INTEGER CHECK (patience BETWEEN 1 AND 10),
  discipline INTEGER CHECK (discipline BETWEEN 1 AND 10),
  satisfaction INTEGER CHECK (satisfaction BETWEEN 1 AND 10),
  frustration INTEGER CHECK (frustration BETWEEN 1 AND 10),
  mental_fatigue INTEGER CHECK (mental_fatigue BETWEEN 1 AND 10),
  decision_quality INTEGER CHECK (decision_quality BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.psychology_checkins TO authenticated;
GRANT ALL ON public.psychology_checkins TO service_role;
ALTER TABLE public.psychology_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_checkins_all" ON public.psychology_checkins FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_checkins_user_time ON public.psychology_checkins(user_id, created_at DESC);
CREATE INDEX idx_checkins_trade ON public.psychology_checkins(trade_id);

-- mistake_catalog (global)
CREATE TABLE public.mistake_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 2,
  suggested_fix TEXT
);
GRANT SELECT ON public.mistake_catalog TO authenticated;
GRANT ALL ON public.mistake_catalog TO service_role;
ALTER TABLE public.mistake_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_catalog" ON public.mistake_catalog FOR SELECT TO authenticated USING (true);

INSERT INTO public.mistake_catalog (code, name, category, severity, suggested_fix) VALUES
('no_confirmation','No confirmation','execution',2,'Wait for your defined entry confirmation before firing.'),
('ignored_trend','Ignored trend','execution',3,'Trade with the higher-timeframe bias unless setup explicitly counter-trend.'),
('poor_timing','Poor timing','execution',2,'Use a timing filter (session, catalyst) to avoid dead zones.'),
('fear_exit','Fear exit','psychology',3,'Predefine SL/TP; do not close winners early on emotion.'),
('greed_exit','Greed exit / held too long','psychology',3,'Respect targets. Trail only via rules, not hope.'),
('oversized','Oversized position','risk',4,'Cap risk % per trade; use position size calculator.'),
('wrong_session','Wrong session','execution',2,'Only trade sessions your strategy is proven in.'),
('wrong_asset','Wrong asset','execution',2,'Trade instruments your edge is tested on.'),
('ignored_rules','Ignored trading plan','discipline',5,'Every trade must map to a checklist item. No exceptions.'),
('no_stop','No stop loss','risk',5,'Never enter without a hard stop.'),
('revenge','Revenge trade','psychology',5,'Enforce cool-down after 2 consecutive losses.'),
('overconfidence','Overconfidence','psychology',3,'Stick to standard size after a winning streak.'),
('fomo','FOMO entry','psychology',4,'Missed setups stay missed. Wait for the next one.'),
('overtrading','Overtrading','discipline',4,'Cap max trades per day.'),
('early_entry','Early entry','execution',2,'Wait for the trigger candle to close.'),
('late_entry','Late entry','execution',2,'Skip trades that exceed max distance from entry.'),
('moved_stop','Moved stop against you','risk',5,'Stops move to breakeven only; never widen.'),
('news_violation','Traded through news','risk',3,'Blackout window around high-impact news.');

-- trade_mistakes
CREATE TABLE public.trade_mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mistake_code TEXT NOT NULL REFERENCES public.mistake_catalog(code),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id, mistake_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_mistakes TO authenticated;
GRANT ALL ON public.trade_mistakes TO service_role;
ALTER TABLE public.trade_mistakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_trade_mistakes_all" ON public.trade_mistakes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_trade_mistakes_trade ON public.trade_mistakes(trade_id);
CREATE INDEX idx_trade_mistakes_user ON public.trade_mistakes(user_id, mistake_code);

-- rule_violations
CREATE TABLE public.rule_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id, rule_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rule_violations TO authenticated;
GRANT ALL ON public.rule_violations TO service_role;
ALTER TABLE public.rule_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_violations_all" ON public.rule_violations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_violations_user ON public.rule_violations(user_id);

-- daily_snapshots (cached metrics)
CREATE TABLE public.daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  starting_balance NUMERIC(18,2) NOT NULL,
  ending_balance NUMERIC(18,2) NOT NULL,
  pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  trades_count INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO authenticated;
GRANT ALL ON public.daily_snapshots TO service_role;
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_snapshots_all" ON public.daily_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_snapshots_user_day ON public.daily_snapshots(user_id, day DESC);

-- coach_reviews
CREATE TABLE public.coach_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  period review_period NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]',
  recommendations JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '{}',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_reviews TO authenticated;
GRANT ALL ON public.coach_reviews TO service_role;
ALTER TABLE public.coach_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_reviews_all" ON public.coach_reviews FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_reviews_user ON public.coach_reviews(user_id, period, period_start DESC);

-- Attach signup trigger LAST (accounts table now exists)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
