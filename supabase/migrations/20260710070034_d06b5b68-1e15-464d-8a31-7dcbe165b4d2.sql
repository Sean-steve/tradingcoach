
-- Profit allocation buckets
CREATE TYPE public.allocation_bucket AS ENUM ('withdraw', 'reinvest', 'tax', 'reserve');

CREATE TABLE public.profit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  bucket public.allocation_bucket NOT NULL,
  amount numeric NOT NULL,
  note text,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profit_allocations TO authenticated;
GRANT ALL ON public.profit_allocations TO service_role;

ALTER TABLE public.profit_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own allocations" ON public.profit_allocations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_profit_allocations_account ON public.profit_allocations(account_id, allocated_at DESC);

-- Allocation rules (target % per bucket per account)
CREATE TABLE public.allocation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  withdraw_pct numeric NOT NULL DEFAULT 30,
  reinvest_pct numeric NOT NULL DEFAULT 40,
  tax_pct numeric NOT NULL DEFAULT 20,
  reserve_pct numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_rules TO authenticated;
GRANT ALL ON public.allocation_rules TO service_role;

ALTER TABLE public.allocation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own allocation rules" ON public.allocation_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_allocation_rules_updated
  BEFORE UPDATE ON public.allocation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
