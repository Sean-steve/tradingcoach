// Server-only orchestration for the intelligence core:
// trades -> behavior events -> evidence-gated statistics -> validated insights
// -> root causes -> arbitrated recommendations.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  deriveBehaviorEvents,
  deriveDecisionScore,
  behaviorCategoryOf,
  behaviorSeverityOf,
  type BehaviorTradeLike,
  type CheckinLike,
  type ManualLimits,
} from "@/lib/behavior";
import { computeInsights, buildRootCauses, buildRecommendations, type TruthTrade } from "@/lib/truth";
import { diffInsights, computeMilestones, type LifecycleRow, type MemoryEntryDraft } from "@/lib/memory";
import { buildGraph, type GraphInsight } from "@/lib/graph";
import { scoreAdvice, applyMetaWeights, type RecLike, type IvLike, type CheckLike } from "@/lib/meta";

type DB = SupabaseClient<Database>;

/** Legacy mistake catalog codes -> canonical behavior taxonomy codes. */
export const MISTAKE_TO_BEHAVIOR: Record<string, string> = {
  early_entry: "early_entry",
  fear_exit: "fear",
  fomo: "fomo",
  greed_exit: "greed",
  ignored_rules: "rule_break",
  ignored_trend: "confirmation",
  late_entry: "late_entry",
  moved_stop: "moved_stop",
  news_violation: "rule_break",
  no_confirmation: "early_entry",
  no_stop: "no_stop",
  overconfidence: "overconfidence",
  oversized: "oversize",
  overtrading: "overtrading",
  poor_timing: "hesitation",
  revenge: "revenge_trade",
  wrong_asset: "no_plan",
  wrong_session: "no_plan",
};

export interface PipelineResult {
  account_id: string;
  trades_analyzed: number;
  behavior_events: number;
  decision_scores: number;
  insights_total: number;
  insights_validated: number;
  root_causes: number;
  recommendations: { title: string; action: string; priority: number }[];
  interventions_evaluated: number;
  memory_entries: number;
  graph_nodes: number;
  graph_edges: number;
  advice_scored: number;
}

export async function runIntelligencePipeline(supabase: DB, userId: string, accountId: string): Promise<PipelineResult> {
  const [{ data: acctRows }, { data: tradeRows }, { data: checkinRows }, { data: allManualRows }, { data: stratRows }, { data: mistakeRows }] =
    await Promise.all([
      supabase.from("accounts").select("*").eq("id", accountId).eq("user_id", userId).limit(1),
      supabase.from("trades").select("*").eq("account_id", accountId).order("entered_at", { ascending: true }),
      supabase.from("psychology_checkins").select("*").eq("user_id", userId),
      supabase.from("tom_versions").select("id,risk_limits").eq("user_id", userId),
      supabase.from("strategies").select("id,name").eq("user_id", userId),
      supabase.from("trade_mistakes").select("trade_id,mistake_code").eq("user_id", userId),
    ]);

  const acct = acctRows?.[0];
  if (!acct) throw new Error("Account not found");
  const trades = (tradeRows ?? []) as unknown as BehaviorTradeLike[];
  const preCheckins = (checkinRows ?? []) as unknown as CheckinLike[];
  const checkinByTrade = new Map<string, CheckinLike>();
  for (const c of preCheckins) {
    if (c.trade_id && c.phase === "pre" && !checkinByTrade.has(c.trade_id)) checkinByTrade.set(c.trade_id, c);
  }

  // ---------- 1. Behavior events (derived, idempotent) ----------
  const eventsByTrade = new Map<string, string[]>();
  const derivedRows: Database["public"]["Tables"]["behavior_events"]["Insert"][] = [];
  const scoreRows: Database["public"]["Tables"]["decision_scores"]["Insert"][] = [];

  const manualLimitsById = new Map(
    (allManualRows ?? []).map((m) => [m.id, (m.risk_limits ?? {}) as Record<string, unknown>]),
  );
  for (const t of trades) {
    const versionId = (t as unknown as { tom_version_id?: string | null }).tom_version_id;
    const historicalLimits = versionId ? manualLimitsById.get(versionId) : null;
    // Pinned trades are evaluated against their historical manual, never today's.
    // Pre-version legacy trades retain account-level limits as a documented fallback.
    const applicableLimits: ManualLimits = historicalLimits
      ? {
          maxRiskPct: numOrNull(historicalLimits["max_risk_pct"]),
          maxTradesPerDay: numOrNull(historicalLimits["max_trades_per_day"]),
          maxDailyLoss: numOrNull(historicalLimits["max_daily_loss"]),
        }
      : versionId ? { maxRiskPct: null, maxTradesPerDay: null, maxDailyLoss: null }
      : {
          maxRiskPct: numOrNull(acct.max_risk_pct),
          maxTradesPerDay: numOrNull(acct.max_trades_per_day),
          maxDailyLoss: numOrNull(acct.max_daily_loss),
        };
    const drafts = deriveBehaviorEvents(t, trades, checkinByTrade.get(t.id), applicableLimits);
    for (const d of drafts) {
      derivedRows.push({
        user_id: userId,
        account_id: accountId,
        trade_id: t.id,
        code: d.code,
        category: d.category,
        severity: d.severity,
        source: "derived",
        detector: d.detector,
        context: d.context as never,
        occurred_at: t.entered_at,
      });
    }
    const score = deriveDecisionScore(t, drafts, checkinByTrade.get(t.id));
    scoreRows.push({ user_id: userId, trade_id: t.id, source: "derived", ...score });
    eventsByTrade.set(t.id, drafts.map((d) => d.code));
  }

  // legacy tagged mistakes count as manually reported behavior
  for (const m of mistakeRows ?? []) {
    const code = MISTAKE_TO_BEHAVIOR[m.mistake_code];
    if (!code) continue;
    const list = eventsByTrade.get(m.trade_id);
    if (list && !list.includes(code)) list.push(code);
  }

  const tradeIds = trades.map((t) => t.id);
  if (tradeIds.length) {
    await supabase.from("behavior_events").delete().eq("user_id", userId).eq("source", "derived").in("trade_id", tradeIds);
    for (const chunk of chunks(derivedRows, 500)) {
      const { error } = await supabase.from("behavior_events").insert(chunk);
      if (error) throw error;
    }
    // never overwrite a manually adjusted decision score
    const { data: manualScores } = await supabase.from("decision_scores").select("trade_id").eq("user_id", userId).eq("source", "manual");
    const manual = new Set((manualScores ?? []).map((r) => r.trade_id));
    const upsertable = scoreRows.filter((r) => !manual.has(r.trade_id));
    for (const chunk of chunks(upsertable, 500)) {
      const { error } = await supabase.from("decision_scores").upsert(chunk, { onConflict: "trade_id" });
      if (error) throw error;
    }
  }

  // ---------- 2. Statistics -> validated insights ----------
  const processByTrade = new Map(scoreRows.map((r) => [r.trade_id, Number(r.process_score ?? 0)]));
  const insights = computeInsights({
    trades: trades as unknown as TruthTrade[],
    eventsByTrade,
    checkinByTrade: new Map([...checkinByTrade].map(([k, v]) => [k, { stress: v.stress, sleep_quality: v.sleep_quality, focus: v.focus }])),
    processByTrade,
    strategyNames: new Map((stratRows ?? []).map((s) => [s.id, s.name])),
  });

  const { data: priorInsightKeys, error: priorInsightError } = await supabase.from("insights")
    .select("insight_key").eq("user_id", userId).eq("account_id", accountId);
  if (priorInsightError) throw priorInsightError;
  const now = new Date();
  const windowStart = trades.length ? new Date(trades[0].entered_at) : now;
  const insightIdByKey = new Map<string, string>();

  for (const chunk of chunks(insights, 100)) {
    const { data, error } = await supabase
      .from("insights")
      .upsert(
        chunk.map((i) => ({
          user_id: userId,
          account_id: accountId,
          insight_key: i.insight_key,
          category: i.category,
          claim: i.claim,
          metric: i.metric,
          status: i.status,
          sample_size: i.sample_size,
          baseline_value: i.baseline_value,
          observed_value: i.observed_value,
          delta: i.delta,
          confidence: i.confidence,
          impact_estimate: i.impact_estimate,
          min_sample: i.min_sample,
          p_value: i.p_value ?? null,
          q_value: i.q_value ?? null,
          ci_low: i.ci_low ?? null,
          ci_high: i.ci_high ?? null,
          tests_in_run: i.tests_in_run ?? 1,
          window_start: windowStart.toISOString().slice(0, 10),
          window_end: now.toISOString().slice(0, 10),
          detail: i.detail as never,
        })),
        { onConflict: "user_id,account_id,insight_key" },
      )
      .select("id,insight_key");
    if (error) throw error;
    for (const row of data ?? []) insightIdByKey.set(row.insight_key, row.id);
  }

  const currentInsightKeys = new Set(insights.map((i) => i.insight_key));
  for (const chunk of chunks((priorInsightKeys ?? []).map((r) => r.insight_key).filter((k) => !currentInsightKeys.has(k)), 100)) {
    const { error } = await supabase.from("insights").update({ status: "invalidated" })
      .eq("user_id", userId).eq("account_id", accountId).in("insight_key", chunk);
    if (error) throw error;
  }

  // Refresh evidence projection without changing the insight's stable ID.
  for (const chunk of chunks([...insightIdByKey.values()], 100)) {
    const { error } = await supabase.from("insight_evidence").delete()
      .eq("user_id", userId).in("insight_id", chunk);
    if (error) throw error;
  }
  const evidenceRows = insights.flatMap((i) =>
    i.evidence.map((e) => ({
      insight_id: insightIdByKey.get(i.insight_key)!,
      user_id: userId,
      trade_id: e.trade_id ?? null,
      label: e.label,
      value: e.value,
      detail: (e.detail ?? {}) as never,
    })),
  ).filter((r) => r.insight_id);
  for (const chunk of chunks(evidenceRows, 500)) {
    const { error } = await supabase.from("insight_evidence").insert(chunk);
    if (error) throw error;
  }

  // ---------- 3. Root causes ----------
  const causes = buildRootCauses(insights);
  const { data: priorCauseKeys, error: priorCauseError } = await supabase.from("root_causes")
    .select("cause_key").eq("user_id", userId).eq("account_id", accountId);
  if (priorCauseError) throw priorCauseError;
  const causeIdByKey = new Map<string, string>();
  if (causes.length) {
    const { data, error } = await supabase
      .from("root_causes")
      .upsert(
        causes.map((c) => ({
          user_id: userId,
          account_id: accountId,
          cause_key: c.cause_key,
          is_current: true,
          title: c.title,
          explanation: c.explanation,
          chain: c.chain as never,
          insight_ids: c.insight_keys.map((k) => insightIdByKey.get(k)).filter((v): v is string => !!v),
          confidence: c.confidence,
          impact_estimate: c.impact_estimate,
        })),
        { onConflict: "user_id,account_id,cause_key" },
      )
      .select("id,cause_key");
    if (error) throw error;
    for (const row of data ?? []) causeIdByKey.set(row.cause_key, row.id);
  }

  const currentCauseKeys = new Set(causes.map((c) => c.cause_key));
  for (const chunk of chunks((priorCauseKeys ?? []).map((r) => r.cause_key).filter((k) => !currentCauseKeys.has(k)), 100)) {
    const { error } = await supabase.from("root_causes").update({ is_current: false })
      .eq("user_id", userId).eq("account_id", accountId).in("cause_key", chunk);
    if (error) throw error;
  }

  // ---------- 3b. Long-term memory: lifecycle diff + timeline ----------
  const { data: lifecycleRows } = await supabase
    .from("insight_lifecycle")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId);
  const prevLifecycle = (lifecycleRows ?? []).map((r) => ({
    insight_key: r.insight_key,
    claim: r.claim,
    category: r.category,
    first_seen_at: r.first_seen_at,
    last_confirmed_at: r.last_confirmed_at,
    confirmations: r.confirmations,
    contradictions: r.contradictions,
    last_observed_value: r.last_observed_value == null ? null : Number(r.last_observed_value),
    status: r.status,
  })) as LifecycleRow[];

  const diff = diffInsights(
    prevLifecycle,
    insights.map((i) => ({
      insight_key: i.insight_key,
      claim: i.claim,
      category: i.category,
      status: i.status,
      observed_value: Number(i.observed_value ?? 0),
      delta: Number(i.delta ?? 0),
      impact_estimate: Number(i.impact_estimate ?? 0),
    })),
    now,
  );

  if (diff.lifecycle.length) {
    const { error } = await supabase
      .from("insight_lifecycle")
      .upsert(
        diff.lifecycle.map((l) => ({ user_id: userId, account_id: accountId, ...l })),
        { onConflict: "user_id,account_id,insight_key" },
      );
    if (error) throw error;
  }

  // ---------- 4. Arbitrated recommendations (preserve user decisions) ----------
  const baseRecs = buildRecommendations(insights, causes);
  const { data: existingRecs } = await supabase
    .from("recommendations")
    .select("id,recommendation_key,title,status,resolved_at")
    .eq("user_id", userId)
    .eq("account_id", accountId);
  const prior = new Map((existingRecs ?? []).map((r) => [r.recommendation_key, r]));

  // meta-learning: grade the advice already given, then re-weight priority
  const [{ data: ivRows }, { data: checkRows }] = await Promise.all([
    supabase.from("interventions").select("*").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("guardrail_checks").select("intervention_id,triggered,outcome").eq("user_id", userId),
  ]);
  const outcomes = scoreAdvice(
    (existingRecs ?? []) as unknown as RecLike[],
    (ivRows ?? []) as unknown as IvLike[],
    (checkRows ?? []) as unknown as CheckLike[],
  );
  if (outcomes.length) {
    const { error } = await supabase.from("advice_outcomes").upsert(
      outcomes.map((o) => ({
        user_id: userId,
        account_id: accountId,
        advice_key: o.advice_key,
        advice_type: o.advice_type,
        title: o.title,
        intervention_id: o.intervention_id,
        accepted: o.accepted,
        dismissed: o.dismissed,
        respected_rate: o.respected_rate,
        checks_total: o.checks_total,
        worked: o.worked,
        weight: o.weight,
        measured_at: now.toISOString(),
      })),
      { onConflict: "user_id,account_id,advice_key" },
    );
    if (error) throw error;
  }
  const recs = applyMetaWeights(baseRecs, outcomes);

  const { data: priorRecKeys, error: priorRecError } = await supabase.from("recommendations")
    .select("recommendation_key").eq("user_id", userId).eq("account_id", accountId);
  if (priorRecError) throw priorRecError;
  if (recs.length) {
    const { error } = await supabase.from("recommendations").upsert(
      recs.map((r) => {
        const before = prior.get(r.recommendation_key);
        return {
          user_id: userId,
          account_id: accountId,
          recommendation_key: r.recommendation_key,
          is_current: true,
          root_cause_id: r.cause_key ? (causeIdByKey.get(r.cause_key) ?? null) : null,
          insight_id: r.insight_key ? (insightIdByKey.get(r.insight_key) ?? null) : null,
          title: r.title,
          action: r.action,
          rationale: r.rationale,
          priority: r.priority,
          impact_estimate: r.impact_estimate,
          confidence: r.confidence,
          status: before?.status ?? "active",
          resolved_at: before?.resolved_at ?? null,
        };
      }),
      { onConflict: "user_id,account_id,recommendation_key" },
    );
    if (error) throw error;
  }
  const currentRecKeys = new Set(recs.map((r) => r.recommendation_key));
  for (const chunk of chunks((priorRecKeys ?? []).map((r) => r.recommendation_key).filter((k) => !currentRecKeys.has(k)), 100)) {
    const { error } = await supabase.from("recommendations").update({ is_current: false })
      .eq("user_id", userId).eq("account_id", accountId).in("recommendation_key", chunk);
    if (error) throw error;
  }

  // ---------- 4b. Knowledge graph rebuild ----------
  const graph = buildGraph(
    insights.map((i) => ({
      insight_key: i.insight_key,
      category: i.category,
      claim: i.claim,
      status: i.status,
      sample_size: i.sample_size,
      delta: Number(i.delta ?? 0),
      confidence: Number(i.confidence ?? 0),
      impact_estimate: Number(i.impact_estimate ?? 0),
      detail: (i.detail ?? {}) as Record<string, unknown>,
    })) as GraphInsight[],
    eventsByTrade,
  );
  await supabase.from("graph_edges").delete().eq("user_id", userId).eq("account_id", accountId);
  await supabase.from("graph_nodes").delete().eq("user_id", userId).eq("account_id", accountId);
  for (const chunk of chunks(graph.nodes, 300)) {
    const { error } = await supabase.from("graph_nodes").insert(
      chunk.map((n) => ({ user_id: userId, account_id: accountId, ...n, detail: n.detail as never })),
    );
    if (error) throw error;
  }
  for (const chunk of chunks(graph.edges, 300)) {
    const { error } = await supabase.from("graph_edges").insert(
      chunk.map((e) => ({
        user_id: userId,
        account_id: accountId,
        ...e,
        detail: { ...e.detail, damage_path: graph.damagePath.keys.includes(e.source_key) } as never,
      })),
    );
    if (error) throw error;
  }

  // ---------- 5. Intervention outcome measurement ----------
  const { refreshInterventionOutcomes } = await import("@/lib/interventions.server");
  const ivOutcome = await refreshInterventionOutcomes(supabase, userId, accountId);

  // ---------- 6. Memory timeline (milestones + diff entries, deduped) ----------
  const milestones = computeMilestones(
    trades.map((t) => ({
      entered_at: t.entered_at,
      exited_at: t.exited_at ?? null,
      pnl: (t as unknown as { pnl: number }).pnl,
      result: (t as unknown as { result: string }).result,
      followed_plan: (t as unknown as { followed_plan: boolean | null }).followed_plan ?? null,
    })),
    ((ivRows ?? []) as unknown as { title: string; status: string; baseline_rate: number | null; observed_rate: number | null }[]),
    now,
  );
  const allEntries: MemoryEntryDraft[] = [...diff.entries, ...milestones];
  let memoryWritten = 0;
  if (allEntries.length) {
    const { data: existingEntries } = await supabase
      .from("memory_entries")
      .select("entry_key")
      .eq("user_id", userId)
      .eq("account_id", accountId);
    const seen = new Set((existingEntries ?? []).map((e) => e.entry_key));
    const fresh = allEntries.filter((e) => !seen.has(e.entry_key));
    for (const chunk of chunks(fresh, 200)) {
      const { error } = await supabase.from("memory_entries").insert(
        chunk.map((e) => ({
          user_id: userId,
          account_id: accountId,
          kind: e.kind,
          title: e.title,
          body: e.body,
          entry_key: e.entry_key,
          refs: e.refs as never,
          occurred_at: e.occurred_at,
        })),
      );
      if (error) throw error;
      memoryWritten += chunk.length;
    }
  }

  return {
    account_id: accountId,
    trades_analyzed: trades.length,
    behavior_events: derivedRows.length,
    decision_scores: scoreRows.length,
    insights_total: insights.length,
    insights_validated: insights.filter((i) => i.status === "validated").length,
    root_causes: causes.length,
    recommendations: recs.map((r) => ({ title: r.title, action: r.action, priority: r.priority })),
    interventions_evaluated: ivOutcome.evaluated,
    memory_entries: memoryWritten,
    graph_nodes: graph.nodes.length,
    graph_edges: graph.edges.length,
    advice_scored: outcomes.length,
  };
}

/** Validated insights + the active operating manual — the only context the coach may use. */
export async function loadTruthContext(supabase: DB, userId: string, accountId: string) {
  const [{ data: insights }, { data: causes }, { data: recs }, { data: toms }, { data: memory }, { data: gEdges }, { data: outcomes }] = await Promise.all([
    supabase.from("insights").select("*").eq("user_id", userId).eq("account_id", accountId).eq("status", "validated").order("impact_estimate", { ascending: true }).limit(15),
    supabase.from("root_causes").select("*").eq("user_id", userId).eq("account_id", accountId).eq("is_current", true),
    supabase.from("recommendations").select("*").eq("user_id", userId).eq("account_id", accountId).eq("is_current", true).eq("status", "active").order("priority"),
    supabase.from("tom_versions").select("*").eq("user_id", userId).eq("is_active", true).limit(1),
    supabase.from("memory_entries").select("kind,title,body,occurred_at").eq("user_id", userId).eq("account_id", accountId).order("occurred_at", { ascending: false }).limit(12),
    supabase.from("graph_edges").select("source_key,target_key,relation,weight,sample_size,confidence,impact_estimate,detail").eq("user_id", userId).eq("account_id", accountId).order("impact_estimate", { ascending: true }).limit(10),
    supabase.from("advice_outcomes").select("advice_type,accepted,dismissed,respected_rate,worked,weight").eq("user_id", userId).eq("account_id", accountId),
  ]);
  const tom = toms?.[0];
  return {
    manual: tom
      ? {
          version: tom.version,
          identity: tom.identity,
          markets: tom.markets,
          sessions: tom.sessions,
          strategies: tom.strategies,
          risk_limits: tom.risk_limits,
          non_negotiables: tom.non_negotiables,
        }
      : null,
    validated_insights: (insights ?? []).map((i) => ({
      claim: i.claim,
      sample_size: i.sample_size,
      confidence: Number(i.confidence),
      impact_estimate: Number(i.impact_estimate ?? 0),
      category: i.category,
    })),
    root_causes: (causes ?? []).map((c) => ({ title: c.title, explanation: c.explanation, confidence: Number(c.confidence) })),
    open_recommendations: (recs ?? []).map((r) => ({ priority: r.priority, title: r.title, action: r.action })),
    memory_timeline: (memory ?? []).map((m) => ({ kind: m.kind, title: m.title, when: m.occurred_at.slice(0, 10) })),
    graph_damage_edges: (gEdges ?? [])
      .filter((e) => e.relation === "hurts")
      .slice(0, 5)
      .map((e) => ({ from: e.source_key, to: e.target_key, sample_size: e.sample_size, confidence: Number(e.confidence), impact: Number(e.impact_estimate ?? 0) })),
    advice_history: (outcomes ?? []).map((o) => ({ type: o.advice_type, accepted: o.accepted, dismissed: o.dismissed, respected_rate: o.respected_rate, worked: o.worked })),
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
