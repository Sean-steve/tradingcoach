// Intervention Engine — pure, isomorphic.
// Turns a validated recommendation into an active pre-trade guardrail, evaluates
// whether that guardrail fires for the trade being logged, and measures whether
// the targeted behavior actually improved after the intervention started.

import { proportionConfidence } from "@/lib/truth";

export type InterventionTrigger =
  | "loss_streak"
  | "stress_level"
  | "risk_above"
  | "trades_today"
  | "session"
  | "behavior_code"
  | "always";

export type InterventionTrend = "improving" | "flat" | "regressing" | "insufficient_evidence";

export interface TriggerConfig {
  /** loss_streak: consecutive losses required */
  losses?: number;
  /** stress_level: stress at or above this (1–10) */
  stress?: number;
  /** risk_above: risk % above this */
  risk_pct?: number;
  /** trades_today: trades already logged today at or above this */
  count?: number;
  /** session: sessions the guardrail applies to */
  sessions?: string[];
}

export interface InterventionLike {
  id: string;
  title: string;
  action: string;
  trigger_type: InterventionTrigger;
  trigger_config: unknown;
  hard_block: boolean;
  status: string;
  target_behavior_code: string | null;
  evidence: string | null;
}

/** Everything the guardrail evaluator needs about the trade about to be logged. */
export interface TriggerContext {
  lossStreak: number;
  stress: number | null;
  riskPct: number | null;
  tradesToday: number;
  session: string | null;
}

export interface TriggerResult {
  triggered: boolean;
  reason: string;
}

export function parseTriggerConfig(raw: unknown): TriggerConfig {
  return (raw && typeof raw === "object" ? raw : {}) as TriggerConfig;
}

export function evaluateTrigger(iv: InterventionLike, ctx: TriggerContext): TriggerResult {
  const cfg = parseTriggerConfig(iv.trigger_config);
  switch (iv.trigger_type) {
    case "loss_streak": {
      const n = cfg.losses ?? 2;
      return ctx.lossStreak >= n
        ? { triggered: true, reason: `${ctx.lossStreak} consecutive losses (threshold ${n})` }
        : { triggered: false, reason: `${ctx.lossStreak}/${n} consecutive losses` };
    }
    case "stress_level": {
      const n = cfg.stress ?? 7;
      return ctx.stress != null && ctx.stress >= n
        ? { triggered: true, reason: `stress ${ctx.stress} at or above ${n}` }
        : { triggered: false, reason: `stress ${ctx.stress ?? "—"} below ${n}` };
    }
    case "risk_above": {
      const n = cfg.risk_pct ?? 1;
      return ctx.riskPct != null && ctx.riskPct > n
        ? { triggered: true, reason: `risk ${ctx.riskPct}% above ${n}%` }
        : { triggered: false, reason: `risk within ${n}%` };
    }
    case "trades_today": {
      const n = cfg.count ?? 4;
      return ctx.tradesToday >= n
        ? { triggered: true, reason: `${ctx.tradesToday} trades already logged today (limit ${n})` }
        : { triggered: false, reason: `${ctx.tradesToday}/${n} trades today` };
    }
    case "session": {
      const list = cfg.sessions ?? [];
      return ctx.session && list.includes(ctx.session)
        ? { triggered: true, reason: `${ctx.session} session is flagged` }
        : { triggered: false, reason: "session not flagged" };
    }
    case "behavior_code":
    case "always":
    default:
      return { triggered: true, reason: "always active" };
  }
}

export interface InterventionDraft {
  title: string;
  action: string;
  trigger_type: InterventionTrigger;
  trigger_config: TriggerConfig;
  hard_block: boolean;
  target_behavior_code: string | null;
  evidence: string | null;
  confidence: number;
}

/**
 * Map an accepted recommendation onto a concrete guardrail. The key produced by the
 * truth engine encodes the behavior family, so we translate it into a trigger the
 * trade form can enforce before the position is taken.
 */
export function draftFromRecommendation(rec: {
  recommendation_key: string;
  title: string;
  action: string;
  rationale: string | null;
  confidence: number | string;
}): InterventionDraft {
  const key = rec.recommendation_key;
  const base = {
    title: rec.title,
    action: rec.action,
    evidence: rec.rationale,
    confidence: Number(rec.confidence),
  };
  const has = (...needles: string[]) => needles.some((n) => key.includes(n));

  if (has("revenge", "loss_streak", "streak"))
    return { ...base, trigger_type: "loss_streak", trigger_config: { losses: 2 }, hard_block: true, target_behavior_code: "revenge_trade" };
  if (has("stress", "fatigue", "sleep"))
    return { ...base, trigger_type: "stress_level", trigger_config: { stress: 7 }, hard_block: false, target_behavior_code: "stress" };
  if (has("oversize", "risk", "size"))
    return { ...base, trigger_type: "risk_above", trigger_config: { risk_pct: 1 }, hard_block: true, target_behavior_code: "oversize" };
  if (has("overtrading", "frequency", "trades_per_day"))
    return { ...base, trigger_type: "trades_today", trigger_config: { count: 4 }, hard_block: true, target_behavior_code: "overtrading" };
  if (has("session"))
    return { ...base, trigger_type: "session", trigger_config: { sessions: ["off_hours"] }, hard_block: false, target_behavior_code: "no_plan" };
  if (has("moved_stop", "stop"))
    return { ...base, trigger_type: "always", trigger_config: {}, hard_block: false, target_behavior_code: "moved_stop" };
  if (has("plan", "checklist"))
    return { ...base, trigger_type: "always", trigger_config: {}, hard_block: false, target_behavior_code: "checklist_skipped" };
  return { ...base, trigger_type: "always", trigger_config: {}, hard_block: false, target_behavior_code: null };
}

export interface OutcomeMeasure {
  baseline_rate: number;
  observed_rate: number;
  target_rate: number;
  sample_size: number;
  confidence: number;
  trend: InterventionTrend;
}

const MIN_AFTER = 8;

/**
 * Did the targeted behavior actually get rarer after the intervention started?
 * Rates are per-trade occurrence percentages; the trend is only asserted once the
 * post-intervention sample clears the minimum-evidence gate.
 */
export function measureOutcome(
  behaviorCode: string,
  startedAt: string,
  trades: { id: string; entered_at: string }[],
  eventsByTrade: Map<string, string[]>,
): OutcomeMeasure {
  const start = +new Date(startedAt);
  let beforeN = 0, beforeX = 0, afterN = 0, afterX = 0;
  for (const t of trades) {
    const hit = (eventsByTrade.get(t.id) ?? []).includes(behaviorCode) ? 1 : 0;
    if (+new Date(t.entered_at) < start) { beforeN++; beforeX += hit; }
    else { afterN++; afterX += hit; }
  }
  const baseline = beforeN ? (beforeX / beforeN) * 100 : 0;
  const observed = afterN ? (afterX / afterN) * 100 : 0;
  const target = Math.max(0, Math.round(baseline * 0.5));
  const confidence = beforeN && afterN ? proportionConfidence(afterX, afterN, beforeX, beforeN) : 0;

  let trend: InterventionTrend = "insufficient_evidence";
  if (afterN >= MIN_AFTER && beforeN >= MIN_AFTER) {
    const delta = observed - baseline;
    if (delta <= -5 && confidence >= 70) trend = "improving";
    else if (delta >= 5 && confidence >= 70) trend = "regressing";
    else trend = "flat";
  }

  return {
    baseline_rate: round1(baseline),
    observed_rate: round1(observed),
    target_rate: target,
    sample_size: afterN,
    confidence: Math.round(confidence),
    trend,
  };
}

/** An intervention graduates once the behavior is at or below target with evidence. */
export function statusFromOutcome(o: OutcomeMeasure): "active" | "succeeded" | "failed" {
  if (o.trend === "improving" && o.observed_rate <= o.target_rate) return "succeeded";
  if (o.trend === "regressing") return "failed";
  return "active";
}

export function adherenceRate(checks: { triggered: boolean; outcome: string }[]): { fired: number; respected: number; rate: number } {
  const fired = checks.filter((c) => c.triggered);
  const respected = fired.filter((c) => c.outcome === "respected").length;
  return { fired: fired.length, respected, rate: fired.length ? Math.round((respected / fired.length) * 100) : 0 };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}