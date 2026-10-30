import test from "node:test";
import assert from "node:assert/strict";
import { measureBehavior, classifyInterventionFamily, interventionStatus } from "../src/lib/intervention-measurement.ts";
import { evaluateTrigger } from "../src/lib/interventions.ts";
import { scoreAdvice } from "../src/lib/meta.ts";

const sample = (beforeN, beforeHits, afterN, afterHits) => {
  const trades = [];
  const events = new Map();
  for (let i = 0; i < beforeN + afterN; i++) {
    const before = i < beforeN;
    const n = before ? i : i - beforeN;
    const id = "t" + i;
    trades.push({ id, entered_at: before ? "2026-01-01T00:00:00.000Z" : "2026-03-01T00:00:00.000Z" });
    events.set(id, n < (before ? beforeHits : afterHits) ? ["revenge_trade"] : []);
  }
  return { trades, events };
};

test("small before and after sample cannot be graded as a coaching success", () => {
  const { trades, events } = sample(10, 8, 10, 0);
  const [graded] = classifyInterventionFamily([measureBehavior("revenge_trade","2026-02-01T00:00:00Z",trades,events)]);
  assert.equal(graded.trend, "insufficient_evidence");
  assert.equal(graded.adjusted_q, 1);
  assert.equal(interventionStatus(graded), "active");
});

test("large, strongly improving behavior rate is evidence-qualified", () => {
  const { trades, events } = sample(100, 80, 100, 15);
  const [graded] = classifyInterventionFamily([measureBehavior("revenge_trade","2026-02-01T00:00:00Z",trades,events)]);
  assert.equal(graded.trend, "improving");
  assert.ok(graded.adjusted_q <= 0.05);
  assert.equal(interventionStatus(graded), "succeeded");
  assert.equal(graded.before_n, 100);
  assert.equal(graded.observed_n, 100);
});

test("significant behavioral regression does not count as improvement", () => {
  const { trades, events } = sample(100, 10, 100, 75);
  const [graded] = classifyInterventionFamily([measureBehavior("revenge_trade","2026-02-01T00:00:00Z",trades,events)]);
  assert.equal(graded.trend, "regressing");
  assert.equal(interventionStatus(graded), "failed");
});

test("multiple intervention comparisons receive corrected q values", () => {
  const { trades, events } = sample(100, 80, 100, 15);
  const signal = measureBehavior("revenge_trade","2026-02-01T00:00:00Z",trades,events);
  const noSignal = measureBehavior("absent","2026-02-01T00:00:00Z",trades,events);
  const [sig, weak] = classifyInterventionFamily([signal,noSignal]);
  assert.ok(sig.adjusted_q >= signal.p_value);
  assert.equal(weak.trend, "flat");
  assert.equal(weak.adjusted_q, 1);
});

test("meta-learning does not call adoption or an unmeasured intervention a success", () => {
  const recs = [{ id: "r1", recommendation_key: "cause_revenge", title: "Reduce revenge trades", status: "accepted" }];
  const interventions = [{ id: "iv1", recommendation_id: "r1", title: "Pause after loss", status: "active", trend: "flat", baseline_rate: 60, observed_rate: 30, sample_size: 30, baseline_n: 30, adjusted_q: 0.8 }];
  const [outcome] = scoreAdvice(recs, interventions, []);
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.worked, null);
});

test("meta-learning scores an evidence-qualified regression only", () => {
  const recs = [{ id: "r1", recommendation_key: "cause_revenge", title: "Reduce revenge trades", status: "accepted" }];
  const interventions = [{ id: "iv1", recommendation_id: "r1", title: "Pause after loss", status: "failed", trend: "regressing", baseline_rate: 20, observed_rate: 60, sample_size: 70, baseline_n: 70, adjusted_q: 0.001 }];
  const [outcome] = scoreAdvice(recs, interventions, []);
  assert.equal(outcome.worked, false);
});

test("behavior-based guardrail does not fire without observed matching events", () => {
  const iv = { id: "1", title: "Watch revenge", action: "Pause", trigger_type: "behavior_code",
    trigger_config: {}, hard_block: false, status: "active", target_behavior_code: "revenge_trade", evidence: null };
  const ctx = { lossStreak: 0, stress: null, riskPct: null, tradesToday: 0, session: null };
  assert.equal(evaluateTrigger(iv, ctx).triggered, false);
  assert.equal(evaluateTrigger(iv, { ...ctx, recentBehaviorCodes: ["revenge_trade"] }).triggered, true);
});
