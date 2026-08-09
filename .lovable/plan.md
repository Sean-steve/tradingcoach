# TRADE OS v2 — Next Step: Build the Intelligence Core (Truth Layer)

## What the document changes

The uploaded spec (ESAS v2, Volumes 0–XIII) is not a bigger feature list — it is a **different architecture**. v1 (what we have) computes metrics from trades and asks an LLM to comment. v2 says intelligence must flow through a fixed chain, and the AI is never allowed to jump from raw data to advice:

```text
Trade + Decision  ->  Behavior Events  ->  Statistics (evidence-gated)
   ->  Validated Insight (Truth Engine)  ->  Root Cause
   ->  Recommendation  ->  Intervention  ->  Learning
```

Core v2 concepts we do **not** have today: Trading Operating Manual (TOM), Behavior Event Engine, Statistical Engine with minimum-evidence rules, Truth Engine (every insight carries evidence + sample size + confidence), Root Cause Engine, Insight Arbitration, Knowledge Graph, Long-Term Memory, Decision Quality Score, Cognitive Bias engine, Digital Twin, Meta-Learning, Mission Tracker.

What we already have maps cleanly onto v2's **Foundation Layer** (trades, screenshots, psychology check-ins, mistakes, rules, accounts, snapshots) and **Experience Layer** (dashboard, journal, analytics, per-dimension dashboards, goals/habits/rewards/challenges, reports, notifications). The missing piece is the middle: the Intelligence + Truth layers.

## Recommended next step

Build **Phase A — the Intelligence Core**, in this order. It is the one piece every other v2 volume depends on, and it upgrades the whole app rather than adding another page.

### A1. Trading Operating Manual (TOM)
A single versioned document per trader: identity, strategies, risk limits, session windows, rules, non-negotiables. Becomes the single source of truth every engine and every AI prompt reads from. Versioned so changes are auditable and performance can be compared across TOM versions.

### A2. Behavior Event Engine
Replaces ad-hoc mistake tags with a canonical taxonomy from the spec: Emotional (FOMO, fear, greed, frustration, overconfidence, stress, calm), Decision (late/early entry, hesitation, moved stop, no plan), Discipline (rule break, oversize, revenge trade, overtrading), Risk (escalation, ignored stop), Cognitive Bias (anchoring, recency, confirmation, loss aversion, gambler's fallacy). Events are derived automatically from each trade + check-in, plus manually taggable, and stored immutably with severity and context.

### A3. Statistical Engine with minimum-evidence rules
Every correlation ("after 3 losses your win rate drops 19%") is computed with sample size, baseline, delta, and confidence — and is **suppressed** below the evidence threshold. No claim without evidence.

### A4. Truth Engine
Turns statistics into Validated Insights. Each insight stores: claim, evidence rows, sample size, confidence, time window, status (validated / insufficient evidence / invalidated). Only validated insights are allowed into AI prompts or the UI.

### A5. Root Cause Engine + Recommendations
Chains insights into causes ("oversizing follows losing streaks, which follow poor sleep"), then generates one prioritized recommendation set — with an arbitration step so the trader sees the 3 highest-impact items, not 20 competing ones.

### A6. New surfaces
- **/insights** — validated insights with evidence drill-down and confidence badges.
- **Decision Quality Score** on the trade form and detail (process quality, independent of P&L).
- **Truth-backed AI Coach** — the coach prompt is rebuilt to consume only validated insights + TOM, and must output findings -> evidence -> recommendation.
- **Today's Mission** on the dashboard, sourced from the top recommendation.

## Deferred to later phases

Knowledge Graph, Long-Term Memory Engine, Digital Twin, Meta-Learning, Workflow/Automation engine, voice notes, public API + integration volume, containerization/CI-CD volumes (not applicable on this hosting), and the enterprise ops volumes.

## Technical notes

- New tables: `tom_versions`, `behavior_events`, `behavior_taxonomy`, `insights`, `insight_evidence`, `root_causes`, `recommendations`, `decision_scores`. RLS scoped to `auth.uid()` with explicit grants, per existing migration style.
- Derivation runs in server functions (`createServerFn`) so behavior events and statistics are computed server-side and cached, instead of the current client-side metric recomputation.
- `src/lib/metrics.ts` stays as the numeric layer; a new `src/lib/behavior.ts` + `src/lib/truth.ts` sit above it.
- AI stays on the Lovable AI Gateway; prompts are refactored to receive validated insights only, never raw trade dumps.
- Existing `mistake_catalog` / `trade_mistakes` data is mapped into the new taxonomy rather than discarded.

Phase A is a substantial build. If you would rather start narrower, the highest-value single slice is **A2 + A3 + A4 + /insights** (behavior events -> evidence-gated statistics -> validated insights), with TOM and root cause following next.
