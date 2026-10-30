import { twoProportionPValue, adjustPValuesBY } from "./truth.ts";

export type OutcomeTrend = "improving" | "flat" | "regressing" | "insufficient_evidence";
export interface BehaviorTrade { id: string; entered_at: string }
export interface OutcomeEvidence {
  baseline_rate: number;
  observed_rate: number;
  target_rate: number;
  before_n: number;
  observed_n: number;
  sample_size: number;
  delta_points: number;
  p_value: number;
  adjusted_q: number;
  confidence: number; // evidence index only, not probability of improvement
  trend: OutcomeTrend;
}
const MIN_SIDE = 20;
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Build before/after behavior rates with a conservative evidence gate.
 * The intervention is observational: even significant change does not prove
 * that the intervention caused it. Insufficient data never produces "worked".
 */
export function measureBehavior(
  code: string, startedAt: string, trades: BehaviorTrade[], eventsByTrade: Map<string, string[]>,
): OutcomeEvidence {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) throw new Error("Invalid intervention start date");
  let before_n = 0, observed_n = 0, beforeHits = 0, afterHits = 0;
  for (const trade of trades) {
    const stamp = Date.parse(trade.entered_at);
    if (!Number.isFinite(stamp)) continue;
    const hit = (eventsByTrade.get(trade.id) ?? []).includes(code) ? 1 : 0;
    if (stamp < start) { before_n++; beforeHits += hit; }
    else { observed_n++; afterHits += hit; }
  }
  const baseline_rate = before_n ? 100 * beforeHits / before_n : 0;
  const observed_rate = observed_n ? 100 * afterHits / observed_n : 0;
  const p_value = before_n >= MIN_SIDE && observed_n >= MIN_SIDE
    ? twoProportionPValue(afterHits, observed_n, beforeHits, before_n) : 1;
  return {
    baseline_rate: round1(baseline_rate),
    observed_rate: round1(observed_rate),
    target_rate: round1(baseline_rate * 0.5),
    before_n, observed_n, sample_size: observed_n,
    delta_points: round1(observed_rate - baseline_rate), p_value,
    adjusted_q: 1, confidence: 0, trend: "insufficient_evidence",
  };
}

/**
 * Adjust all parallel interventions in the account as one statistical family.
 * A rate difference is not evidence of causal efficacy, just an association.
 */
export function classifyInterventionFamily(rows: OutcomeEvidence[]): OutcomeEvidence[] {
  const qs = adjustPValuesBY(rows.map(r => r.p_value));
  return rows.map((row, i) => {
    const q = qs[i];
    const enough = row.before_n >= MIN_SIDE && row.observed_n >= MIN_SIDE;
    const signal = enough && q <= 0.05 && Math.abs(row.delta_points) >= 5;
    return {
      ...row,
      adjusted_q: Math.round(q * 1000000) / 1000000,
      confidence: round1((1 - q) * 100),
      trend: !enough ? "insufficient_evidence"
        : !signal ? "flat"
          : row.delta_points < 0 ? "improving" : "regressing",
    };
  });
}
export function interventionStatus(outcome: OutcomeEvidence): "active" | "succeeded" | "failed" {
  if (outcome.trend === "improving" && outcome.observed_rate <= outcome.target_rate) return "succeeded";
  if (outcome.trend === "regressing") return "failed";
  return "active";
}
