// Long-Term Memory Engine — pure, isomorphic.
// Diffs the previous insight lifecycle against the newly computed insight set
// and turns the difference into an immutable timeline of what changed.

export type MemoryKind = "discovery" | "change" | "regression" | "milestone" | "manual_change" | "intervention";
export type LifecycleStatus = "emerging" | "durable" | "archived";

export interface LifecycleRow {
  insight_key: string;
  claim: string;
  category: string | null;
  first_seen_at: string;
  last_confirmed_at: string | null;
  confirmations: number;
  contradictions: number;
  last_observed_value: number | null;
  status: LifecycleStatus;
}

export interface InsightLike {
  insight_key: string;
  claim: string;
  category: string;
  status: string;
  observed_value: number;
  delta: number;
  impact_estimate: number;
}

export interface LifecycleUpsert {
  insight_key: string;
  claim: string;
  category: string | null;
  first_seen_at: string;
  last_confirmed_at: string | null;
  last_seen_at: string;
  confirmations: number;
  contradictions: number;
  last_observed_value: number | null;
  status: LifecycleStatus;
  archived_reason: string | null;
}

export interface MemoryEntryDraft {
  kind: MemoryKind;
  title: string;
  body: string;
  entry_key: string;
  refs: Record<string, unknown>;
  occurred_at: string;
}

export interface MemoryDiff {
  lifecycle: LifecycleUpsert[];
  entries: MemoryEntryDraft[];
}

const DURABLE_AT = 3;
const ARCHIVE_AT = 2;
/** percentage points a validated claim must move before it counts as a change */
const MOVE_THRESHOLD = 5;

const day = (d: Date) => d.toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function diffInsights(prev: LifecycleRow[], current: InsightLike[], now = new Date()): MemoryDiff {
  const iso = now.toISOString();
  const stamp = day(now);
  const prevByKey = new Map(prev.map((p) => [p.insight_key, p]));
  const validated = current.filter((i) => i.status === "validated");
  const validatedKeys = new Set(validated.map((i) => i.insight_key));

  const lifecycle: LifecycleUpsert[] = [];
  const entries: MemoryEntryDraft[] = [];

  for (const i of validated) {
    const before = prevByKey.get(i.insight_key);

    if (!before) {
      lifecycle.push({
        insight_key: i.insight_key,
        claim: i.claim,
        category: i.category,
        first_seen_at: iso,
        last_confirmed_at: iso,
        last_seen_at: iso,
        confirmations: 1,
        contradictions: 0,
        last_observed_value: i.observed_value,
        status: "emerging",
        archived_reason: null,
      });
      entries.push({
        kind: "discovery",
        title: `New pattern found: ${labelOf(i.insight_key)}`,
        body: i.claim,
        entry_key: `discovery:${i.insight_key}`,
        refs: { insight_key: i.insight_key, category: i.category, impact_estimate: i.impact_estimate },
        occurred_at: iso,
      });
      continue;
    }

    const confirmations = before.confirmations + 1;
    const status: LifecycleStatus = confirmations >= DURABLE_AT ? "durable" : "emerging";
    lifecycle.push({
      insight_key: i.insight_key,
      claim: i.claim,
      category: i.category,
      first_seen_at: before.first_seen_at,
      last_confirmed_at: iso,
      last_seen_at: iso,
      confirmations,
      contradictions: before.contradictions,
      last_observed_value: i.observed_value,
      status,
      archived_reason: null,
    });

    const previousValue = before.last_observed_value;
    if (previousValue != null) {
      const move = i.observed_value - Number(previousValue);
      if (Math.abs(move) >= MOVE_THRESHOLD) {
        // For a damaging pattern (delta < 0) a rising segment win rate is progress.
        const damaging = i.delta < 0;
        const better = damaging ? move > 0 : move > 0;
        entries.push({
          kind: better ? "change" : "regression",
          title: `${labelOf(i.insight_key)} ${move > 0 ? "improved" : "worsened"} by ${r1(Math.abs(move))} points`,
          body: `${labelOf(i.insight_key)} moved from ${r1(Number(previousValue))}% to ${r1(i.observed_value)}% win rate. ${i.claim}`,
          entry_key: `${better ? "change" : "regression"}:${i.insight_key}:${stamp}`,
          refs: { insight_key: i.insight_key, from: r1(Number(previousValue)), to: r1(i.observed_value) },
          occurred_at: iso,
        });
      }
    }

    if (before.status !== "durable" && status === "durable") {
      entries.push({
        kind: "milestone",
        title: `Confirmed pattern: ${labelOf(i.insight_key)}`,
        body: `This claim has now held up across ${confirmations} independent measurements, so it is treated as durable. ${i.claim}`,
        entry_key: `durable:${i.insight_key}`,
        refs: { insight_key: i.insight_key, confirmations },
        occurred_at: iso,
      });
    }
  }

  for (const p of prev) {
    if (validatedKeys.has(p.insight_key)) continue;
    if (p.status === "archived") continue;
    const contradictions = p.contradictions + 1;
    const archived = contradictions >= ARCHIVE_AT;
    lifecycle.push({
      insight_key: p.insight_key,
      claim: p.claim,
      category: p.category,
      first_seen_at: p.first_seen_at,
      last_confirmed_at: p.last_confirmed_at,
      last_seen_at: new Date().toISOString(),
      confirmations: p.confirmations,
      contradictions,
      last_observed_value: p.last_observed_value,
      status: archived ? "archived" : p.status,
      archived_reason: archived ? "No longer supported by the evidence gate" : null,
    });
    if (archived) {
      entries.push({
        kind: "change",
        title: `Pattern no longer holds: ${labelOf(p.insight_key)}`,
        body: `${p.claim} This claim failed the evidence gate on ${contradictions} consecutive measurements and has been archived.`,
        entry_key: `archived:${p.insight_key}`,
        refs: { insight_key: p.insight_key },
        occurred_at: iso,
      });
    }
  }

  return { lifecycle, entries };
}

// --- milestones -------------------------------------------------------------

export interface MilestoneTrade {
  entered_at: string;
  exited_at: string | null;
  pnl: number | string;
  result: string;
  followed_plan: boolean | null;
}

export interface MilestoneIntervention {
  title: string;
  status: string;
  baseline_rate: number | string | null;
  observed_rate: number | string | null;
}

export function computeMilestones(trades: MilestoneTrade[], interventions: MilestoneIntervention[], now = new Date()): MemoryEntryDraft[] {
  const iso = now.toISOString();
  const out: MemoryEntryDraft[] = [];
  const closed = trades.filter((t) => t.result !== "open");
  if (!closed.length) return out;

  const days = new Set(closed.map((t) => day(new Date(t.exited_at ?? t.entered_at))));
  for (const threshold of [30, 100, 250]) {
    if (days.size >= threshold) {
      out.push({
        kind: "milestone",
        title: `${threshold} trading days logged`,
        body: `You have journalled ${threshold} separate trading days. Every claim in the system rests on this record.`,
        entry_key: `days_logged:${threshold}`,
        refs: { days: days.size },
        occurred_at: iso,
      });
    }
  }
  for (const threshold of [50, 100, 250, 500]) {
    if (closed.length >= threshold) {
      out.push({
        kind: "milestone",
        title: `${threshold} closed trades`,
        body: `Sample size reached ${threshold} closed trades, which raises the confidence of every segment comparison.`,
        entry_key: `trades_closed:${threshold}`,
        refs: { trades: closed.length },
        occurred_at: iso,
      });
    }
  }

  // longest run of consecutive trades where the plan was followed
  let run = 0;
  let best = 0;
  for (const t of closed
    .slice()
    .sort((a, b) => +new Date(a.exited_at ?? a.entered_at) - +new Date(b.exited_at ?? b.entered_at))) {
    if (t.followed_plan) {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  for (const threshold of [10, 25, 50]) {
    if (best >= threshold) {
      out.push({
        kind: "milestone",
        title: `${threshold} disciplined trades in a row`,
        body: `You followed your plan on ${threshold} consecutive trades. That streak is the mechanism behind any durable improvement.`,
        entry_key: `disciplined_streak:${threshold}`,
        refs: { streak: best },
        occurred_at: iso,
      });
    }
  }

  for (const iv of interventions.filter((i) => i.status === "succeeded")) {
    out.push({
      kind: "intervention",
      title: `Guardrail graduated: ${iv.title}`,
      body: `The behavior this guardrail targeted fell from ${r1(Number(iv.baseline_rate ?? 0))}% to ${r1(Number(iv.observed_rate ?? 0))}% of trades, so the rule closed as successful.`,
      entry_key: `graduated:${iv.title}`,
      refs: { title: iv.title },
      occurred_at: iso,
    });
  }

  return out;
}

// --- labels -----------------------------------------------------------------

export function labelOf(insightKey: string): string {
  if (insightKey.startsWith("behavior_")) return insightKey.slice(9).replace(/_/g, " ");
  if (insightKey.startsWith("state_")) return insightKey.slice(6).replace(/_/g, " ");
  if (insightKey.startsWith("session_")) return `${insightKey.slice(8).replace(/_/g, " ")} session`;
  if (insightKey.startsWith("asset_")) return insightKey.slice(6);
  if (insightKey.startsWith("strategy_")) return "a strategy";
  if (insightKey.startsWith("weekday_")) {
    const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    return names[Number(insightKey.slice(8))] ?? "a weekday";
  }
  return insightKey.replace(/_/g, " ");
}