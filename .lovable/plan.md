# Phase C — Long-Term Memory, Knowledge Graph & Meta-Learning

Phase A built the truth layer, Phase B made it act on your trading. Phase C gives the system a memory: it remembers what it told you, checks whether it was right, and learns which of its own advice actually works for you.

## Part 1 — Long-Term Memory Engine

Today every pipeline run rebuilds insights from scratch, so history is lost. Phase C keeps a timeline.

- Every pipeline run writes an immutable **memory entry**: what changed since the last run (new validated insight, insight invalidated, behavior rate moved, intervention outcome, manual version change, milestone).
- Insights get lifecycle tracking — first seen, last confirmed, times confirmed, times contradicted — instead of being deleted and recreated. Repeatedly confirmed insights gain "durable" status; contradicted ones are archived with the reason.
- **New surface `/memory`**: a scrollable trader timeline (Discovery / Change / Regression / Milestone), filterable by period, with each entry linking to its insight, intervention, or trade.
- The coach reads memory so it can say "we found this in June, you fixed it in July, it came back last week" instead of treating every session as new.

## Part 2 — Knowledge Graph

A structured map of how your trading actually connects, built from existing insights and behavior events — no new data entry.

- Nodes: behaviors, states (stress/sleep/focus bands), strategies, sessions, assets, outcomes, rules.
- Edges: statistically supported relationships only, each carrying sample size, confidence and impact, reusing the Phase A evidence gate.
- **New surface `/graph`**: interactive force-directed map, node colored by impact (cost vs edge), click a node to see its connected evidence, top chain highlighted as "your main damage path".
- Chains feed the Root Cause engine, replacing today's hardcoded chain templates with graph-derived paths.

## Part 3 — Meta-Learning Engine

The system grades itself.

- Every recommendation and intervention outcome is scored: accepted, ignored, respected, worked, backfired.
- Aggregated into a **coach scorecard**: which advice types work for you, which triggers you always override, which behaviors resist change.
- Future recommendation priority is re-weighted by that history — advice you consistently ignore drops down, advice that works for you gets surfaced first.
- Shown on `/memory` as an "what's actually working" panel plus a plain-language confidence statement about the system's own accuracy.

## Part 4 — Milestones & progress narrative

- Automatic milestone detection from memory: first 30 days logged, behavior rate halved, longest disciplined streak, first graduated intervention, new equity high with rules respected.
- Milestones award existing badges and appear on the dashboard as a single "trajectory" line: where you were, where you are, what changed it.

## Technical notes

- New tables: `memory_entries` (user_id, account_id, kind, title, body, refs jsonb, occurred_at), `insight_lifecycle` (user_id, insight_key, first_seen_at, last_confirmed_at, confirmations, contradictions, status), `graph_nodes` / `graph_edges` (derived, rebuilt per run, with sample_size / confidence / impact), `advice_outcomes` (recommendation_key, intervention_id, accepted, respected_rate, worked boolean, measured_at). RLS scoped to `auth.uid()` with explicit grants, matching existing migrations.
- `src/lib/memory.ts` — pure diffing of previous vs current insight sets into memory entries; `src/lib/graph.ts` — pure node/edge construction plus chain ranking from insights and behavior events; `src/lib/meta.ts` — advice scoring and priority re-weighting.
- `src/lib/intelligence.server.ts` extended: after insights are computed, diff against `insight_lifecycle`, write memory entries, rebuild the graph, refresh advice outcomes, then apply meta-learning weights to recommendation priority.
- Insight upsert changes from delete-all-then-insert to keyed upsert so lifecycle counters survive.
- Graph rendering uses a lightweight canvas/SVG force layout; no new heavy dependency.
- New query options in `src/lib/queries.ts`, nav entries for Memory and Knowledge Graph in `src/components/app-shell.tsx`, each new route with its own head metadata; coach prompt gains memory timeline + graph chain as extra evidence.
