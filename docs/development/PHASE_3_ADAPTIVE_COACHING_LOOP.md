# TRADE OS v2 — Phase 3: Complete the Adaptive Coaching Loop

Status: implemented on stacked branch. CI and database activation are separate release gates.

## Goal
Close one controlled, evidence-grounded improvement loop:

Trade capture/import → canonical behavior events → statistical Truth Engine → evidence-backed recommendations → accepted/dismissed advice → opt-in pre-trade guardrail → recorded adherence → post-intervention behavior rates → adjusted significance gate → adaptive recommendation ranking → evidence-aware AI review.

This is an application-level advisory and discipline system, NOT broker-side order execution or guaranteed prevention of real trades.

## Existing components reused
- Trading Operating Manual with historical version references
- Behavior Event Engine, Truth Engine and arbitration
- Recommendations, interventions, guardrail checks, memory timeline
- Daily/weekly/monthly AI reviews, meta-learning
- Persistent intelligence jobs introduced by Phase 1

## Phase 3 changes
1. `recommendation_actions` records immutable actor-scoped accept, activate, dismiss and complete transitions. `tradeos_recommendation_action` atomically validates account ownership and a current validated insight (direct or associated root cause) before accepting advice. Guardrail creation happens in the same transaction and is idempotent.
2. Browser users cannot directly fabricate recommendation records, intervention insertions or measured outcome columns after migration. Background service credentials are isolated server-side and are used only after validating user/account ownership.
3. `intervention-measurement.ts` computes before/after canonical behavior rates using at least 20 trades in **each** period, a sparse-data-safe two-proportion test, and Benjamini–Yekutieli false-discovery-rate correction over the interventions evaluated together. Less evidence produces `insufficient_evidence`, not success.
4. The same outcome evaluator powers server measurement; trends are observational associations, not proven causal intervention effects.
5. The intelligence pipeline remeasures guardrails **before** calculating advice effectiveness and changing recommendation priorities.
6. Meta-learning no longer equates acceptance with effectiveness. Only evidence-qualified improving/regressing outcomes are graded.
7. Accepted recommendations stay visible and may be explicitly completed or dismissed. Guardrail activation uses an atomic RPC after migration.
8. `behavior_code` guardrails trigger only from observed canonical recent events, not an unconditional fallback.
9. The AI Coach receives accepted recommendations and transparent prior outcomes; unsupported psychological or causal claims remain prohibited.

## Deployment sequence
1. Confirm the **correct** TRADE OS Supabase project, take backup and verify restoration.
2. Apply and validate Phase 1 migration: `20261030170000_foundation_repair.sql`.
3. Apply and validate Phase 2 migration: `20261030220000_binary_options_and_import_integrity.sql`.
4. Apply and validate Phase 3 migration: `20261030230000_adaptive_coaching_lifecycle.sql`.
5. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and processing queue/cron secrets.
6. Test per-user ownership, accepted root-cause recommendations, atomic guardrail activation, duplicate activation, disallowed transitions, timestamped action log, client denial of computed outcome fields and foreign-account operations.
7. Verify actual new trades enqueue intelligence, update derived behaviors, evaluate outcomes, store `advice_outcomes`, and produce evidence-aware AI reviews. Use valid 20+ before AND after behavior samples for statistical certification.
8. Verify no historical recommendations or interventions have been silently marked complete.
9. Run integration, E2E, security, restoration and browser checks before merge/deploy.

## Acceptance criteria
- [x] Changes committed on an isolated branch
- [ ] CI unit/typecheck/build green
- [ ] All 3 migrations applied on correct Supabase project
- [ ] Staging RPC / RLS tests pass
- [ ] Durable queue and background service tested
- [ ] Complete multi-user cross-account authorization verified
- [ ] End-to-end coached trade flow verified against real staging data
- [ ] Production deployment and monitoring approved

## Constraints / known risks
- The connected Supabase account exposes only an unrelated inactive project; TRADE OS migrations and live-state tests have NOT been executed.
- Phase 2 is still a draft PR. This Phase 3 PR is stacked on the Phase 2 branch and cannot safely land independently.
- Before migration activation, UI actions retain pre-existing compatibility behavior. The new audit/atomicity guarantees begin only after Phase 3 migration is applied.
- Behavior-event completeness, manual logging accuracy and imported-data quality limit evidence quality.
- The previous client-side pre-trade guardrail operates inside TRADE OS; it cannot stop external broker execution. Server-enforced broker gating requires a future supported integration.
- Improvement following a guardrail is observational; the system cannot infer causation without controlled study.
- No claims of production certification until staging tests and database safety checks pass.
