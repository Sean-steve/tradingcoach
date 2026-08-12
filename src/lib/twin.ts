// Digital Twin — counterfactual replay engine, pure and isomorphic.
// Replays the real trade history under a different set of discipline rules and
// reports what the equity curve would have looked like. No prediction, no AI:
// every number comes from trades the trader actually took.

export interface TwinTrade {
  id: string;
  entered_at: string;
  pnl: number | string;
  risk_pct: number | null;
  session: string | null;
  result: string;
}

export interface TwinRules {
  /** Drop any trade carrying one of these behavior codes. */
  skipBehaviors: string[];
  /** Cap risk at this % — P&L of oversized trades is scaled down proportionally. */
  maxRiskPct: number | null;
  /** Stop trading for the day after this many losses. */
  stopAfterLosses: number | null;
  /** Hard cap on trades per day. */
  maxTradesPerDay: number | null;
  /** Only keep trades in these sessions (empty = all sessions). */
  allowedSessions: string[];
}

export const defaultTwinRules: TwinRules = {
  skipBehaviors: ["revenge_trade", "oversize", "no_plan"],
  maxRiskPct: 1,
  stopAfterLosses: 2,
  maxTradesPerDay: 4,
  allowedSessions: [],
};

export type SkipReason = "behavior" | "loss_streak" | "daily_cap" | "session";

export interface TwinResult {
  startingBalance: number;
  actual: TwinSide;
  twin: TwinSide;
  curve: { i: number; actual: number; twin: number }[];
  skipped: { reason: SkipReason; count: number; pnl: number }[];
  scaledTrades: number;
  deltaPnl: number;
  deltaWinRate: number;
  deltaMaxDrawdown: number;
}

export interface TwinSide {
  trades: number;
  netPnl: number;
  endingBalance: number;
  winRate: number;
  maxDrawdown: number;
  expectancy: number;
}

export function replay(
  trades: TwinTrade[],
  eventsByTrade: Map<string, string[]>,
  rules: TwinRules,
  startingBalance: number,
): TwinResult {
  const ordered = [...trades]
    .filter((t) => t.result !== "open")
    .sort((a, b) => +new Date(a.entered_at) - +new Date(b.entered_at));

  const skipTally = new Map<SkipReason, { count: number; pnl: number }>();
  const bump = (reason: SkipReason, pnl: number) => {
    const cur = skipTally.get(reason) ?? { count: 0, pnl: 0 };
    skipTally.set(reason, { count: cur.count + 1, pnl: cur.pnl + pnl });
  };

  const actualPnls: number[] = [];
  const twinPnls: number[] = [];
  const curve: { i: number; actual: number; twin: number }[] = [{ i: 0, actual: startingBalance, twin: startingBalance }];
  let actualBal = startingBalance;
  let twinBal = startingBalance;
  let scaledTrades = 0;

  let day = "";
  let dayLosses = 0;
  let dayTrades = 0;

  ordered.forEach((t, idx) => {
    const pnl = Number(t.pnl);
    actualPnls.push(pnl);
    actualBal += pnl;

    const key = t.entered_at.slice(0, 10);
    if (key !== day) { day = key; dayLosses = 0; dayTrades = 0; }

    const codes = eventsByTrade.get(t.id) ?? [];
    let skip: SkipReason | null = null;
    if (rules.skipBehaviors.some((c) => codes.includes(c))) skip = "behavior";
    else if (rules.allowedSessions.length && t.session && !rules.allowedSessions.includes(t.session)) skip = "session";
    else if (rules.stopAfterLosses != null && dayLosses >= rules.stopAfterLosses) skip = "loss_streak";
    else if (rules.maxTradesPerDay != null && dayTrades >= rules.maxTradesPerDay) skip = "daily_cap";

    if (skip) {
      bump(skip, pnl);
    } else {
      let taken = pnl;
      if (rules.maxRiskPct != null && t.risk_pct != null && Number(t.risk_pct) > rules.maxRiskPct) {
        const factor = rules.maxRiskPct / Number(t.risk_pct);
        taken = pnl * factor;
        scaledTrades++;
      }
      twinPnls.push(taken);
      twinBal += taken;
      dayTrades++;
      if (pnl < 0) dayLosses++;
    }

    curve.push({ i: idx + 1, actual: round2(actualBal), twin: round2(twinBal) });
  });

  const actual = side(actualPnls, startingBalance);
  const twin = side(twinPnls, startingBalance);

  return {
    startingBalance,
    actual,
    twin,
    curve,
    skipped: [...skipTally.entries()].map(([reason, v]) => ({ reason, count: v.count, pnl: round2(v.pnl) })),
    scaledTrades,
    deltaPnl: round2(twin.netPnl - actual.netPnl),
    deltaWinRate: round2(twin.winRate - actual.winRate),
    deltaMaxDrawdown: round2(twin.maxDrawdown - actual.maxDrawdown),
  };
}

function side(pnls: number[], startingBalance: number): TwinSide {
  const net = pnls.reduce((s, v) => s + v, 0);
  const wins = pnls.filter((v) => v > 0).length;
  let bal = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;
  for (const p of pnls) {
    bal += p;
    peak = Math.max(peak, bal);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - bal) / peak) * 100);
  }
  return {
    trades: pnls.length,
    netPnl: round2(net),
    endingBalance: round2(startingBalance + net),
    winRate: pnls.length ? round2((wins / pnls.length) * 100) : 0,
    maxDrawdown: round2(maxDd),
    expectancy: pnls.length ? round2(net / pnls.length) : 0,
  };
}

export const skipReasonLabel: Record<SkipReason, string> = {
  behavior: "Blocked by behavior rule",
  loss_streak: "Stopped after loss streak",
  daily_cap: "Over daily trade cap",
  session: "Outside allowed sessions",
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}