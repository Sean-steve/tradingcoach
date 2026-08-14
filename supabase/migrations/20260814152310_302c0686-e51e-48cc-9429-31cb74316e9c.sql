CREATE UNIQUE INDEX IF NOT EXISTS insight_lifecycle_unique_key ON public.insight_lifecycle (user_id, account_id, insight_key);
CREATE UNIQUE INDEX IF NOT EXISTS memory_entries_unique_key ON public.memory_entries (user_id, account_id, entry_key) WHERE entry_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS advice_outcomes_unique_key ON public.advice_outcomes (user_id, account_id, advice_key);