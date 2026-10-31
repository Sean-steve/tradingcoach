begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
select has_function('public','tradeos_guard_opening_capital',array[]::text[],
  'Phase E immutable opening-capital enforcement exists');
select has_trigger('public','accounts','trg_tradeos_guard_opening_capital',
  'Account updates are guarded by a financial trigger');
select * from finish();
rollback;
