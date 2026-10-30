# TRADE OS v2 — Phase 4: Complete Personal Trading Experience

**Status:** code implemented on a stacked feature branch. No migration applied to the TRADE OS production database, no claim of live financial verification.

## Implemented
- Goals: reuse existing goals domain, add daily/weekly/monthly/quarterly/annual/custom horizons and legacy-safe absolute/incremental target modes.
- Goal pace: profile-timezone calendar day, configured planning weekdays, remaining amount, required arithmetic daily/weekly average, comparison with at least 10 historical settled-session observations.
- Clear guardrail: the calculator cannot request stake increases, trading frequency increases, or a compulsory daily income quota. Unrealistic pace prompts deadline/target changes instead.
- Milestones: account-scoped goals with separate milestones and live metric-based threshold tracking, including inverse max drawdown.
- Rewards: existing badges are retained, with added lifestyle rewards (travel, experiences, education, purchases), budgets, currency, location, dates, process requirements and 0.1–10% reward-specific profit earmarking limits.
- Funding: append-only planned-pledge and **self-reported external transfer** events. Funding is **not verified**, nor is it treated as withdrawable cash. No API executes actual payments or withdrawals.
- Conservative financial cap: pledges cannot exceed the smaller of 10% of positive account-level net P&L after recorded tax/reserve allocations, reward-level cap, and remaining reward budget. Limits enforced within a transaction under an account row lock.
- Rewards require 20+ closed trades and 80%+ recorded rule-plan adherence before a user may mark a reward redeemed. Redemption is labeled self-reported; it cannot verify an external expense.
- Account isolation: Goals, Rewards and Dashboard now use active account selection. New tables have RLS and account ownership checks.
- Dashboard: goal roadmap, arithmetic planning pace, reward funding progress with explicit verification disclaimer.

## Migration and rollout sequence
1. Verify TRADE OS Supabase ownership/access, backup/restore, and staging environment.
2. Apply Phase 1 migration: `20261030170000_foundation_repair.sql`.
3. Apply Phase 2 migration: `20261030220000_binary_options_and_import_integrity.sql`.
4. Apply Phase 3 migration: `20261030230000_adaptive_coaching_lifecycle.sql`.
5. Apply Phase 4 migration: `20261031010000_personal_goals_lifestyle_rewards.sql`.
6. Confirm authenticated `tradeos_phase4_ready()` returns true. Grant SELECT as written, with RLS enabled.
7. Validate different users and different trading accounts cannot access each other's goals, milestones, rewards or funding events.
8. Test concurrent `tradeos_reward_event` calls; the total earmarked amount must remain beneath the cap.
9. Test demo account block, capital/tax-reserve deductions, negative-profit period block, repeated transfer receipt block, and redemption requiring process and budget criteria.
10. Test legacy absolute goals, incremental goals, deadline changes, zero trading days, and profile timezone boundaries in the browser.
11. Review current account balances against broker statements. Financial P&L from manually logged trades is **not** evidence of cash availability.
12. Configure independent bank/broker integration in a future sprint before any verified-funding feature can be presented.

## Important limitations
- Migration application and database integration tests could not be completed: the connected Supabase account does not expose the TRADE OS project.
- Phase 2 PR #3 and Phase 3 PR #4 are still open. Phase 4 is stacked on Phase 3 and must not land independently in `main`.
- New goals show an arithmetic requirement, **not** a trading instruction or expected return.
- Planning-day calculations use profile timezone; historical active-session grouping currently uses settlement UTC dates.
- Reward funding events are user statements only. Verified funding remains zero until a trusted external source is integrated; status `redeemed_reported` does not constitute a payment or bank verification.
- Profit-allocation cap uses historical trade P&L from the journal, not broker-cleared withdrawals. Results can change when trades or allocations are corrected; no cash moves.
- Existing `profit_allocations` may include transactions without confirmed bank settlement and require separate external reconciliation.
- Badges and certain older challenge milestones remain client-computed; they are not authoritative payout eligibility.
- Currency conversion is not performed; reward plans use the user's profile base currency and reject mismatched funding.
- This phase does not create a cross-OS Mission/Wealth Engine, broker automation, or investment advice.

## Acceptance gates
- [ ] Test suite passes
- [ ] Build and typecheck pass
- [ ] Live Supabase project accessible
- [ ] All four migrations applied/validated in order
- [ ] Staging RLS, concurrency, reconciliation, funding safety checks pass
- [ ] Multi-account end-to-end UX passes
- [ ] Browser accessibility and responsiveness verified
- [ ] Production readiness/release approved

**Do not merge or deploy solely because build/typecheck are green.**
