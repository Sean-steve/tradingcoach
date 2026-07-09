// Monte Carlo forecast engine. Given a closed-trade history, sample with
// replacement to project equity distributions over a chosen horizon. Pure and
// isomorphic — no DB deps, safe to run client-side.

import type { TradeLike } from "./metrics";

export interface ForecastInput {
  trades: TradeLike[];
  startingBalance: number;
  tradesPerDay: number;
  horizonDays: number;
  runs: number;
  goalBalance?: number;
}

export interface ForecastResult {
  runs: number;
  horizonTrades: number;
  finalMedian: number;
  finalMean: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  probProfit: number;
  probGoal: number | null;
  worstDrawdownPct: number;
  medianDrawdownPct: number;
  sampleCurves: { step: number; p5: number; p50: number; p95: number }[];
  ruinProb: number; // prob balance goes to <=0 at any point
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

export function runForecast(input: ForecastInput): ForecastResult {
  const closed = input.trades.filter((t) => t.result !== "open" && Number.isFinite(t.pnl));
  const pnls = closed.map((t) => t.pnl);
  const start = input.startingBalance;

  if (pnls.length < 5) {
    return {
      runs: 0,
      horizonTrades: 0,
      finalMedian: start,
      finalMean: start,
      p5: start, p25: start, p75: start, p95: start,
      probProfit: 0, probGoal: null,
      worstDrawdownPct: 0, medianDrawdownPct: 0,
      sampleCurves: [],
      ruinProb: 0,
    };
  }

  const totalTrades = Math.max(1, Math.floor(input.tradesPerDay * input.horizonDays));
  const runs = input.runs;
  const finals: number[] = [];
  const drawdowns: number[] = [];
  const perStep: number[][] = Array.from({ length: totalTrades + 1 }, () => []);
  let ruinCount = 0;
  let goalHitCount = 0;

  for (let r = 0; r < runs; r++) {
    let bal = start;
    let peak = start;
    let maxDD = 0;
    let ruined = false;
    let hitGoal = false;
    perStep[0].push(bal);
    for (let i = 0; i < totalTrades; i++) {
      const pnl = pnls[Math.floor(Math.random() * pnls.length)];
      bal += pnl;
      if (bal > peak) peak = bal;
      const dd = peak > 0 ? ((peak - bal) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
      if (bal <= 0) ruined = true;
      if (input.goalBalance && bal >= input.goalBalance) hitGoal = true;
      perStep[i + 1].push(bal);
    }
    finals.push(bal);
    drawdowns.push(maxDD);
    if (ruined) ruinCount++;
    if (hitGoal) goalHitCount++;
  }

  const sortedF = [...finals].sort((a, b) => a - b);
  const sortedDD = [...drawdowns].sort((a, b) => a - b);

  // sample curves at ~30 evenly-spaced steps to keep chart light
  const sampleStep = Math.max(1, Math.floor(perStep.length / 30));
  const sampleCurves = perStep
    .map((arr, step) => ({ step, arr }))
    .filter((_, i) => i % sampleStep === 0 || i === perStep.length - 1)
    .map(({ step, arr }) => {
      const s = [...arr].sort((a, b) => a - b);
      return {
        step,
        p5: quantile(s, 0.05),
        p50: quantile(s, 0.5),
        p95: quantile(s, 0.95),
      };
    });

  return {
    runs,
    horizonTrades: totalTrades,
    finalMedian: quantile(sortedF, 0.5),
    finalMean: sortedF.reduce((a, b) => a + b, 0) / sortedF.length,
    p5: quantile(sortedF, 0.05),
    p25: quantile(sortedF, 0.25),
    p75: quantile(sortedF, 0.75),
    p95: quantile(sortedF, 0.95),
    probProfit: finals.filter((f) => f > start).length / runs,
    probGoal: input.goalBalance ? goalHitCount / runs : null,
    worstDrawdownPct: quantile(sortedDD, 0.95),
    medianDrawdownPct: quantile(sortedDD, 0.5),
    ruinProb: ruinCount / runs,
    sampleCurves,
  };
}

/** Compute current streak (in days) of habit completion for a given habit. */
export function habitStreak(logs: { habit_id: string; log_date: string; completed: boolean }[], habitId: string): number {
  const done = new Set(
    logs.filter((l) => l.habit_id === habitId && l.completed).map((l) => l.log_date),
  );
  let streak = 0;
  const d = new Date();
  // walk backwards day by day
  // allow today missing = still counts if yesterday exists
  const today = d.toISOString().slice(0, 10);
  if (!done.has(today)) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (done.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}