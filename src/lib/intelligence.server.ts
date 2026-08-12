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
}

export async function runIntelligencePipeline(supabase: DB, userId: string, accountId: string): Promise<PipelineResult> {
  const [{ data: acctRows }, { data: tradeRows }, { data: checkinRows }, { data: tomRows }, { data: stratRows }, { data: mistakeRows }] =
    await Promise.all([
      supabase.from("accounts").select("*").eq("id", accountId).limit(1),
      supabase.from("trades").select("*").eq("account_id", accountId).order("entered_at", { ascending: true }),
      supabase.from("psychology_checkins").select("*").eq("user_id", userId),
      supabase.from("tom_versions").select("*").eq("user_id", userId).eq("is_active", true).limit(1),
      supabase.from("strategies").select("id,name").eq("user_id", userId),
      supabase.from("trade_mistakes").select("trade_id,mistake_code").eq("user_id", userId),
    ]);

  const acct = acctRows?.[0];
  if (!acct) throw new Error("Account not found");
  const tom = tomRows?.[0];
  const riskLimits = (tom?.risk_limits ?? {}) as Record<string, unknown>;

  const limits: ManualLimits = {
    maxRiskPct: numOrNull(riskLimits["max_risk_pct"]) ?? numOrNull(acct.max_risk_pct),
    maxTradesPerDay: numOrNull(riskLimits["max_trades_per_day"]) ?? numOrNull(acct.max_trades_per_day),
    maxDailyLoss: numOrNull(riskLimits["max_daily_loss"]) ?? numOrNull(acct.max_daily_loss),
  };

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

  for (const t of trades) {
    const drafts = deriveBehaviorEvents(t, trades, checkinByTrade.get(t.id), limits);
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

  await supabase.from("insights").delete().eq("user_id", userId).eq("account_id", accountId);
  const now = new Date();
  const windowStart = trades.length ? new Date(trades[0].entered_at) : now;
  const insightIdByKey = new Map<string, string>();

  for (const chunk of chunks(insights, 100)) {
    const { data, error } = await supabase
      .from("insights")
      .insert(
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
          window_start: windowStart.toISOString().slice(0, 10),
          window_end: now.toISOString().slice(0, 10),
          detail: i.detail as never,
        })),
      )
      .select("id,insight_key");
    if (error) throw error;
    for (const row of data ?? []) insightIdByKey.set(row.insight_key, row.id);
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
  await supabase.from("root_causes").delete().eq("user_id", userId).eq("account_id", accountId);
  const causeIdByKey = new Map<string, string>();
  if (causes.length) {
    const { data, error } = await supabase
      .from("root_causes")
      .insert(
        causes.map((c) => ({
          user_id: userId,
          account_id: accountId,
          cause_key: c.cause_key,
          title: c.title,
          explanation: c.explanation,
          chain: c.chain as never,
          insight_ids: c.insight_keys.map((k) => insightIdByKey.get(k)).filter((v): v is string => !!v),
          confidence: c.confidence,
          impact_estimate: c.impact_estimate,
        })),
      )
      .select("id,cause_key");
    if (error) throw error;
    for (const row of data ?? []) causeIdByKey.set(row.cause_key, row.id);
  }

  // ---------- 4. Arbitrated recommendations (preserve user decisions) ----------
  const recs = buildRecommendations(insights, causes);
  const { data: existingRecs } = await supabase
    .from("recommendations")
    .select("recommendation_key,status,resolved_at")
    .eq("user_id", userId)
    .eq("account_id", accountId);
  const prior = new Map((existingRecs ?? []).map((r) => [r.recommendation_key, r]));

  await supabase.from("recommendations").delete().eq("user_id", userId).eq("account_id", accountId);
  if (recs.length) {
    const { error } = await supabase.from("recommendations").insert(
      recs.map((r) => {
        const before = prior.get(r.recommendation_key);
        return {
          user_id: userId,
          account_id: accountId,
          recommendation_key: r.recommendation_key,
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
    );
    if (error) throw error;
  }

  // ---------- 5. Intervention outcome measurement ----------
  const { refreshInterventionOutcomes } = await import("@/lib/interventions.server");
  const ivOutcome = await refreshInterventionOutcomes(supabase, userId, accountId);

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
  };
}

/** Validated insights + the active operating manual — the only context the coach may use. */
export async function loadTruthContext(supabase: DB, userId: string, accountId: string) {
  const [{ data: insights }, { data: causes }, { data: recs }, { data: toms }] = await Promise.all([
    supabase.from("insights").select("*").eq("user_id", userId).eq("account_id", accountId).eq("status", "validated").order("impact_estimate", { ascending: true }).limit(15),
    supabase.from("root_causes").select("*").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("recommendations").select("*").eq("user_id", userId).eq("account_id", accountId).eq("status", "active").order("priority"),
    supabase.from("tom_versions").select("*").eq("user_id", userId).eq("is_active", true).limit(1),
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
