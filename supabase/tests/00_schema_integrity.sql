begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'trades', 'Trade history is available');
select has_table('public', 'accounts', 'Trading accounts are available');
select has_table('public', 'tom_versions', 'Trading Operating Manual is versioned');
select has_table('public', 'intelligence_jobs', 'Phase 1 intelligence queue exists');
select has_table('public', 'account_balance_events', 'Phase 1 balance delta ledger exists');
select has_table('public', 'reward_funding_events', 'Phase 4 reward funding event ledger exists');
select has_table('public', 'lifestyle_rewards', 'Phase 4 lifestyle reward planning exists');
select has_table('public', 'recommendation_actions', 'Phase 3 coaching action audit exists');

select ok((select relrowsecurity from pg_class where oid='public.trades'::regclass),'Trades enforce RLS');
select ok((select relrowsecurity from pg_class where oid='public.intelligence_jobs'::regclass),'Queue enforces RLS');
select ok((select relrowsecurity from pg_class where oid='public.lifestyle_rewards'::regclass),'Rewards enforce RLS');
select ok((select relrowsecurity from pg_class where oid='public.reward_funding_events'::regclass),'Funding ledger enforces RLS');

select ok(to_regprocedure('public.tradeos_import_trades(uuid,jsonb)') is not null,'Protected import RPC exists');
select ok(to_regprocedure('public.tradeos_reward_event(uuid,text,numeric,text)') is not null,'Protected reward RPC exists');
select ok(to_regprocedure('public.claim_intelligence_jobs(integer)') is not null,'Queue worker RPC exists');
select ok(to_regprocedure('public.tradeos_phase3_ready()') is not null,'Phase 3 migration applied');
select ok(to_regprocedure('public.tradeos_phase4_ready()') is not null,'Phase 4 migration applied');

select ok(EXISTS (
  SELECT 1 FROM storage.buckets WHERE id='trade-screenshots' AND public=false
),'Private trading screenshot bucket exists on fresh local install');

select * from finish();
rollback;
