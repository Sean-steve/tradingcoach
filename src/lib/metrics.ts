// Pure client-side metrics engine. Given an array of trades and a starting balance,
// compute the full performance picture. Kept isomorphic (no DB deps) so we can run
// it on the client for instant dashboards and later on the server for AI reviews.

export interface TradeLike {
  id: string;
  entered_at: string;
  exited_at: string | null;
  pnl: number;
  result: "win" | "loss" | "breakeven" | "open";
  risk_pct: number | null;
  planned_rr: number | null;
  realized_rr: number | null;
  followed_plan: boolean | null;
  checklist_completed: boolean | null;
  asset: string;
  strategy_id: string | null;
  session: string | null;
  setup_quality: number | null;
  confidence: number | null;
  duration_seconds: number | null;
  tags: string[] | null;
}

export interface Metrics {
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  openTrades: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  avgRR: number;
  largestWin: number;
  largestLoss: number;
  roi: number;
  currentBalance: number;
  currentDrawdown: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentStreak: number; // negative = losing streak
  longestWinStreak: number;
  longestLossStreak: number;
  avgDurationSec: number;
  ruleCompliancePct: number; // followed_plan %
  checklistPct: number;
  equityCurve: { t: string; balance: number; pnl: number }[];
  drawdownCurve: { t: string; dd: number }[];
}

export function computeMetrics(trades: TradeLike[], startingBalance: number): Metrics {
  const closed = trades
    .filter((t) => t.result !== "open")
    .slice()
    .sort((a, b) => +new Date(a.exited_at ?? a.entered_at) - +new Date(b.exited_at ?? b.entered_at));

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const be = closed.filter((t) => t.pnl === 0 && t.result === "breakeven");
  const openTrades = trades.filter((t) => t.result === "open").length;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = grossProfit - grossLoss;

  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy = closed.length ? netPnl / closed.length : 0;

  const rrValues = closed.map((t) => t.realized_rr).filter((v): v is number => v != null);
  const avgRR = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;

  const largestWin = wins.reduce((m, t) => Math.max(m, t.pnl), 0);
  const largestLoss = losses.reduce((m, t) => Math.min(m, t.pnl), 0);

  // equity curve
  let bal = startingBalance;
  let peak = startingBalance;
  let maxDD = 0;
  let maxDDPct = 0;
  const equityCurve: Metrics["equityCurve"] = [{ t: "start", balance: startingBalance, pnl: 0 }];
  const drawdownCurve: Metrics["drawdownCurve"] = [{ t: "start", dd: 0 }];
  for (const t of closed) {
    bal += t.pnl;
    if (bal > peak) peak = bal;
    const dd = peak - bal;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
    equityCurve.push({ t: t.exited_at ?? t.entered_at, balance: bal, pnl: t.pnl });
    drawdownCurve.push({ t: t.exited_at ?? t.entered_at, dd: -ddPct });
  }
  const currentDrawdown = peak - bal;

  // streaks
  let curStreak = 0;
  let longestWin = 0;
  let longestLoss = 0;
  let runW = 0;
  let runL = 0;
  for (const t of closed) {
    if (t.pnl > 0) {
      runW++;
      runL = 0;
      if (runW > longestWin) longestWin = runW;
    } else if (t.pnl < 0) {
      runL++;
      runW = 0;
      if (runL > longestLoss) longestLoss = runL;
    }
  }
  // current streak = tail
  for (let i = closed.length - 1; i >= 0; i--) {
    const t = closed[i];
    if (t.pnl > 0) {
      if (curStreak < 0) break;
      curStreak++;
    } else if (t.pnl < 0) {
      if (curStreak > 0) break;
      curStreak--;
    } else break;
  }

  const durations = closed.map((t) => t.duration_seconds ?? 0).filter((d) => d > 0);
  const avgDurationSec = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const withPlan = closed.filter((t) => t.followed_plan !== null);
  const ruleCompliancePct = withPlan.length ? (withPlan.filter((t) => t.followed_plan).length / withPlan.length) * 100 : 0;
  const withChecklist = closed.filter((t) => t.checklist_completed !== null);
  const checklistPct = withChecklist.length ? (withChecklist.filter((t) => t.checklist_completed).length / withChecklist.length) * 100 : 0;

  return {
    tradesCount: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: be.length,
    openTrades,
    winRate,
    netPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    avgRR,
    largestWin,
    largestLoss,
    roi: startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0,
    currentBalance: bal,
    currentDrawdown,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    currentStreak: curStreak,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    avgDurationSec,
    ruleCompliancePct,
    checklistPct,
    equityCurve,
    drawdownCurve,
  };
}

export function filterByRange(trades: TradeLike[], from: Date, to: Date) {
  return trades.filter((t) => {
    const d = new Date(t.exited_at ?? t.entered_at);
    return d >= from && d <= to;
  });
}

/** Composite Performance Score 0–100. Rewards discipline over luck. */
export function performanceScore(m: Metrics): {
  total: number;
  profitability: number;
  consistency: number;
  risk: number;
  discipline: number;
} {
  // Profitability (25%): expectancy + profit factor
  const pf = Number.isFinite(m.profitFactor) ? Math.min(m.profitFactor, 3) : 3;
  const profitability = Math.max(0, Math.min(100, ((pf / 3) * 60 + (m.expectancy > 0 ? 40 : 0))));
  // Consistency (25%): win rate + streak balance
  const consistency = Math.max(0, Math.min(100, m.winRate * 0.8 + (m.longestLossStreak <= 3 ? 20 : Math.max(0, 20 - m.longestLossStreak * 2))));
  // Risk (25%): drawdown control + avg RR
  const ddPenalty = Math.min(100, m.maxDrawdownPct * 3);
  const rrScore = Math.max(0, Math.min(50, m.avgRR * 20));
  const risk = Math.max(0, 100 - ddPenalty * 0.6) * 0.5 + rrScore;
  // Discipline (25%): rule compliance + checklist
  const discipline = m.ruleCompliancePct * 0.6 + m.checklistPct * 0.4;

  const total = profitability * 0.25 + consistency * 0.25 + risk * 0.25 + discipline * 0.25;
  return {
    total: Math.round(total),
    profitability: Math.round(profitability),
    consistency: Math.round(consistency),
    risk: Math.round(risk),
    discipline: Math.round(discipline),
  };
}

export function sessionFromDate(d: Date): "asian" | "london" | "newyork" | "overlap_ln" | "overlap_ny" | "off_hours" {
  const h = d.getUTCHours();
  if (h >= 0 && h < 7) return "asian";
  if (h >= 7 && h < 8) return "overlap_ln";
  if (h >= 8 && h < 12) return "london";
  if (h >= 12 && h < 16) return "overlap_ny";
  if (h >= 16 && h < 21) return "newyork";
  return "off_hours";
}