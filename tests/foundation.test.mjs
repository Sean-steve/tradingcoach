import test from "node:test";
import assert from "node:assert/strict";
import { computeInsights, adjustPValuesBY, twoProportionPValue, proportionDifferenceInterval } from "../src/lib/truth.ts";
import { replay } from "../src/lib/twin.ts";

test("insufficient sample does not create validated claims", () => {
  const trades = Array.from({ length: 10 }, (_, i) => ({
    id: String(i), asset: "EURUSD", session: "london", strategy_id: null,
    entered_at: new Date(2026, 0, i + 1).toISOString(), exited_at: null,
    pnl: i % 2 ? 1 : -1, result: i % 2 ? "win" : "loss", risk_pct: null, setup_quality: null,
  }));
  const insights = computeInsights({ trades, eventsByTrade: new Map(), checkinByTrade: new Map() });
  assert.equal(insights.length, 1);
  assert.equal(insights[0].status, "insufficient_evidence");
});

test("p-values reject sparse expected counts rather than claiming significance", () => {
  assert.equal(twoProportionPValue(1, 8, 0, 8), 1);
  assert.ok(twoProportionPValue(90, 100, 10, 100) < 0.001);
});

test("Benjamini-Yekutieli adjustment accounts for dependence and multiple tests", () => {
  const ps = [0.0001, 0.01, 0.03, 0.2];
  const qs = adjustPValuesBY(ps);
  assert.equal(qs.length, ps.length);
  assert.ok(qs.every((q, i) => q >= ps[i] && q <= 1));
  assert.ok(qs[1] >= qs[0]);
  assert.deepEqual(adjustPValuesBY([]), []);
});

test("conservative confidence interval spans zero for similar groups", () => {
  const [lo, hi] = proportionDifferenceInterval(10, 20, 11, 20);
  assert.ok(lo < 0);
  assert.ok(hi > 0);
});

test("strong effect can become validated only after across-segment correction", () => {
  const trades = [];
  const events = new Map();
  for (let i = 0; i < 200; i++) {
    const id = String(i);
    trades.push({
      id, asset: "EURUSD", session: "london", strategy_id: null,
      entered_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), exited_at: null,
      pnl: i < 100 ? -1 : 1, result: i < 100 ? "loss" : "win", risk_pct: null, setup_quality: null,
    });
    events.set(id, i < 100 ? ["fomo"] : []);
  }
  const insights = computeInsights({ trades, eventsByTrade: events, checkinByTrade: new Map() });
  const fomo = insights.find((i) => i.insight_key === "behavior_fomo");
  assert.ok(fomo);
  assert.equal(fomo.status, "validated");
  assert.ok(fomo.q_value <= 0.05);
  assert.ok(fomo.tests_in_run > 1);
  assert.ok(fomo.ci_high < 0);
  assert.match(fomo.claim, /descriptive only/);
});

test("digital twin never mutates source trades", () => {
  const trades = [{ id: "1", entered_at: "2026-01-01T10:00:00Z", pnl: -10, risk_pct: 2, session: "london", result: "loss" }];
  const before = structuredClone(trades);
  const result = replay(trades, new Map(), { skipBehaviors: [], maxRiskPct: 1, stopAfterLosses: null, maxTradesPerDay: null, allowedSessions: [] }, 1000);
  assert.deepEqual(trades, before);
  assert.equal(result.twin.netPnl, -5);
});
