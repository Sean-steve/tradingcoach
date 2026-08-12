# Phase B — Intervention Loop + Digital Twin

Phase A produced evidence-backed recommendations. Phase B makes them act on your trading and shows what your discipline is actually worth.

## Part 1 — Intervention & Habit Loop

Turn each accepted recommendation into a live intervention that shows up before you trade and is measured afterwards.

**Intervention lifecycle**
- Accepting a recommendation on `/insights` creates an **intervention**: a rule with a trigger (e.g. "after 2 consecutive losses", "when stress >= 4", "risk above 1.5%"), a target behavior code to reduce, a baseline value captured at creation, and a review window (default 14 days).
- Each intervention can auto-create a matching habit so it appears in the existing habit tracker and streak system.

**Pre-trade guardrail (on the New Trade form)**
- Before submit, active interventions are evaluated against the trade being logged plus recent trade history and today's check-in.
- Matching triggers show an inline warning card: the rule, the evidence sentence from its insight, and a required acknowledgement checkbox. Hard-limit interventions reuse the existing reflection gate; soft ones only require acknowledgement.
- Every evaluation is recorded as a **guardrail check** with the outcome (respected / overridden), so overrides become measurable.

**Outcome tracking**
- The intelligence pipeline re-measures each intervention's target behavior rate and win rate since its start date, compares against its captured baseline, and marks it improving / flat / regressing with sample size and confidence — same evidence gate as insights, no verdicts on thin data.
- Interventions that clear their target close as **succeeded** and award a discipline badge; ones that regress escalate to a new higher-priority recommendation.

**New surface `/interventions`**
- Active interventions with trigger, target, progress bar vs baseline, respected-vs-overridden counts, streak.
- Completed/failed history.
- Today's Mission on the dashboard becomes the top active intervention (falling back to recommendation, then heuristic as today).

## Part 2 — Digital Twin / Simulation

A counterfactual engine that replays your real trades under disciplined rules.

- **Twin rules**, sourced from your Operating Manual and validated insights: fixed risk per trade, max trades per day, stop trading after N losses, no trading in your statistically worst session, skip trades tagged with your top violating behavior.
- **Replay**: your closed trades in chronological order, each re-sized to the twin's risk and dropped when a twin rule would have blocked it, producing a twin equity curve, twin win rate, twin max drawdown and twin profit factor.
- **New surface `/twin`**: real vs twin equity curves overlaid, headline "discipline gap" number (twin P&L minus actual P&L), a per-rule attribution table showing what each rule contributed, toggles to enable/disable individual rules and re-run instantly, and a saved-scenario list so runs can be compared over time.
- The discipline gap is added to the dashboard as a tile and fed into the coach prompt as evidence ("following your own manual would have been worth X").

## Technical notes

- New tables: `interventions` (user_id, account_id, recommendation_id, insight_id, title, trigger_type, trigger_config jsonb, target_behavior_code, baseline_rate, target_rate, hard_block boolean, status, starts_at, review_at, habit_id), `guardrail_checks` (intervention_id, trade_id, triggered, outcome, note), `twin_scenarios` (user_id, account_id, name, rules jsonb, result jsonb). RLS scoped to `auth.uid()` with explicit grants, matching existing style.
- `src/lib/interventions.ts` — trigger evaluation (pure, shared by the trade form and the server pipeline) and outcome measurement using the existing `proportionConfidence` helper from `src/lib/truth.ts`.
- `src/lib/twin.ts` — pure replay engine over `TradeRow[]` plus twin rules; no new AI calls, deterministic.
- `src/lib/intelligence.server.ts` extended to also refresh intervention outcomes; `src/lib/coach.server.ts` gains intervention adherence and the discipline gap as extra evidence.
- Query options added to `src/lib/queries.ts`; nav entries for Interventions and Digital Twin in `src/components/app-shell.tsx`; each new route gets its own head metadata.
