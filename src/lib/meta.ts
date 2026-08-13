// Meta-Learning Engine — pure, isomorphic.
// Scores the system's own advice: was it accepted, was it respected, did the
// behavior it targeted actually move. Those scores re-weight future priority.

export interface RecLike {
  id: string;
  recommendation_key: string;
  title: string;
  status: string;
}

export interface IvLike {
  id: string;
  recommendation_id: string | null;
  title: string;
  status: string;
  trend: string;
  baseline_rate: number | string | null;
  observed_rate: number | string | null;
  sample_size: number;
}

export interface CheckLike {
  intervention_id: string;
  triggered: boolean;
  outcome: string;
}

export interface AdviceOutcomeDraft {
  advice_key: string;
  advice_type: string;
  title: string;
  intervention_id: string | null;
  accepted: boolean;
  dismissed: boolean;
  respected_rate: number | null;
  checks_total: number;
  worked: boolean | null;
  weight: number;
}

export function adviceTypeOf(key: string): string {
  if (key.startsWith("cause_")) return key.slice(6);
  if (key.startsWith("insight_behavior_")) return "behavior";
  if (key.startsWith("insight_state_")) return "state";
  if (key.startsWith("insight_session_") || key.startsWith("insight_asset_") || key.startsWith("insight_strategy_")) return "context_selection";
  return "other";
}

export function scoreAdvice(recs: RecLike[], interventions: IvLike[], checks: CheckLike[]): AdviceOutcomeDraft[] {
  const ivByRec = new Map<string, IvLike>();
  for (const iv of interventions) if (iv.recommendation_id) ivByRec.set(iv.recommendation_id, iv);

  return recs.map((r) => {
    const iv = ivByRec.get(r.id) ?? null;
    const ivChecks = iv ? checks.filter((c) => c.intervention_id === iv.id && c.triggered) : [];
    const respected = ivChecks.filter((c) => c.outcome === "respected").length;
    const respected_rate = ivChecks.length ? Math.round((respected / ivChecks.length) * 100) : null;

    let worked: boolean | null = null;
    if (iv && iv.sample_size >= 8 && iv.trend !== "insufficient_evidence") {
      worked = iv.status === "succeeded" || iv.trend === "improving";
      if (iv.trend === "regressing") worked = false;
    }

    const accepted = r.status === "accepted" || r.status === "completed" || !!iv;
    const dismissed = r.status === "dismissed";

    return {
      advice_key: r.recommendation_key,
      advice_type: adviceTypeOf(r.recommendation_key),
      title: r.title,
      intervention_id: iv?.id ?? null,
      accepted,
      dismissed,
      respected_rate,
      checks_total: ivChecks.length,
      worked,
      weight: weightFor({ accepted, dismissed, respected_rate, worked }),
    };
  });
}

export function weightFor(o: { accepted: boolean; dismissed: boolean; respected_rate: number | null; worked: boolean | null }): number {
  let w = 1;
  if (o.accepted) w += 0.2;
  if (o.dismissed) w -= 0.45;
  if (o.respected_rate != null && o.respected_rate < 40) w -= 0.3;
  if (o.respected_rate != null && o.respected_rate >= 80) w += 0.1;
  if (o.worked === true) w += 0.4;
  if (o.worked === false) w -= 0.3;
  return Math.round(Math.min(2, Math.max(0.3, w)) * 100) / 100;
}

/** Weight lookup by advice key, falling back to the average for its type. */
export function weightIndex(outcomes: AdviceOutcomeDraft[]): { byKey: Map<string, number>; byType: Map<string, number> } {
  const byKey = new Map<string, number>();
  const typeAgg = new Map<string, number[]>();
  for (const o of outcomes) {
    byKey.set(o.advice_key, o.weight);
    typeAgg.set(o.advice_type, [...(typeAgg.get(o.advice_type) ?? []), o.weight]);
  }
  const byType = new Map<string, number>();
  for (const [t, arr] of typeAgg) byType.set(t, Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100);
  return { byKey, byType };
}

export interface WeightableRec {
  recommendation_key: string;
  impact_estimate: number;
  priority: number;
}

/** Re-prioritises recommendations using the trader's own response history. */
export function applyMetaWeights<T extends WeightableRec>(recs: T[], outcomes: AdviceOutcomeDraft[]): T[] {
  const { byKey, byType } = weightIndex(outcomes);
  const scored = recs.map((r) => {
    const w = byKey.get(r.recommendation_key) ?? byType.get(adviceTypeOf(r.recommendation_key)) ?? 1;
    return { r, score: Math.abs(r.impact_estimate) * w, negative: r.impact_estimate < 0 ? 0 : 1 };
  });
  return scored
    .sort((a, b) => (a.negative !== b.negative ? a.negative - b.negative : b.score - a.score))
    .map((s, idx) => ({ ...s.r, priority: idx + 1 }));
}

export interface Scorecard {
  total: number;
  accepted: number;
  dismissed: number;
  worked: number;
  backfired: number;
  unmeasured: number;
  accuracy: number | null;
  adherence: number | null;
  byType: { type: string; total: number; worked: number; weight: number }[];
  statement: string;
}

export function coachScorecard(outcomes: AdviceOutcomeDraft[]): Scorecard {
  const total = outcomes.length;
  const measured = outcomes.filter((o) => o.worked != null);
  const worked = measured.filter((o) => o.worked === true).length;
  const backfired = measured.filter((o) => o.worked === false).length;
  const withChecks = outcomes.filter((o) => o.respected_rate != null);
  const adherence = withChecks.length
    ? Math.round(withChecks.reduce((s, o) => s + (o.respected_rate ?? 0), 0) / withChecks.length)
    : null;

  const byTypeMap = new Map<string, AdviceOutcomeDraft[]>();
  for (const o of outcomes) byTypeMap.set(o.advice_type, [...(byTypeMap.get(o.advice_type) ?? []), o]);
  const byType = [...byTypeMap]
    .map(([type, arr]) => ({
      type,
      total: arr.length,
      worked: arr.filter((o) => o.worked === true).length,
      weight: Math.round((arr.reduce((s, o) => s + o.weight, 0) / arr.length) * 100) / 100,
    }))
    .sort((a, b) => b.weight - a.weight);

  const accuracy = measured.length ? Math.round((worked / measured.length) * 100) : null;
  const statement =
    measured.length < 3
      ? `Only ${measured.length} recommendation${measured.length === 1 ? "" : "s"} has been measured long enough to grade, so the system cannot yet claim an accuracy figure.`
      : `Of ${measured.length} measured recommendations, ${worked} moved the targeted behavior and ${backfired} did not — ${accuracy}% accuracy so far.`;

  return {
    total,
    accepted: outcomes.filter((o) => o.accepted).length,
    dismissed: outcomes.filter((o) => o.dismissed).length,
    worked,
    backfired,
    unmeasured: total - measured.length,
    accuracy,
    adherence,
    byType,
    statement,
  };
}