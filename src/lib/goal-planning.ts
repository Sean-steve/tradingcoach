/**
 * TRADE OS Phase 4 — non-prescriptive goal planning.
 * Dates are calendar strings (YYYY-MM-DD) in the user's selected planning
 * timezone; callers supply them rather than relying on server locale.
 */
export type GoalMetric = "pnl" | "win_rate" | "profit_factor" | "discipline_score" |
  "consistency" | "trade_count" | "max_drawdown_pct" | "performance_score";
export type Feasibility = "reached" | "expired" | "insufficient_history" | "above_historical_pace" | "within_historical_pace" | "no_deadline";
export type GoalLike = { metric: string; target_value: number | string; starting_value?: number | string | null; deadline?: string | null; target_mode?: "absolute" | "incremental" };
const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function day(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Calendar date must be YYYY-MM-DD");
  const n = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== date) throw Error("Invalid calendar date");
  return n;
}
export function remainingTradingDays(today: string, deadline: string, allowedWeekdays: readonly number[] = [1,2,3,4,5]): number {
  if (!allowedWeekdays.length || allowedWeekdays.some(x => !Number.isInteger(x) || x < 0 || x > 6)) throw Error("Invalid trading weekdays");
  const first = day(today), last = day(deadline);
  if (last < first) return 0;
  const allowed = new Set(allowedWeekdays);
  let total = 0;
  // Includes today, so the estimate does not assume the current session ended.
  for (let t=first; t <= last; t += DAY_MS) if (allowed.has(new Date(t).getUTCDay())) total++;
  return total;
}
export function realizedSessionPnl(
  trades: ReadonlyArray<{ pnl: number | string; result: string; exited_at: string | null }>,
): { sessions: number; mean: number; total: number } {
  // A "session" here means a UTC settlement date with >=1 closed trade,
  // not a planned trading day. Never include open positions or count stake as P&L.
  const byDate = new Map<string,number>();
  for (const t of trades) {
    if (t.result === "open" || !t.exited_at) continue;
    const net = Number(t.pnl);
    if (!Number.isFinite(net)) continue;
    const date = new Date(t.exited_at).toISOString().slice(0,10);
    byDate.set(date, (byDate.get(date) ?? 0) + net);
  }
  const total = [...byDate.values()].reduce((a,b)=>a+b,0);
  return { sessions: byDate.size, mean: byDate.size ? round2(total / byDate.size) : 0, total: round2(total) };
}
export type GoalPlan = {
  current: number; target: number; remaining: number; progressPct: number;
  daysLeft: number | null; requiredPerDay: number | null; requiredPerWeek: number | null;
  historicalDailyNet: number | null; historicalSessions: number; feasibility: Feasibility;
  achieved: boolean;
};
export function planGoal(args: {
  goal: GoalLike; currentValue: number; today: string;
  history?: { sessions: number; mean: number };
  allowedWeekdays?: readonly number[];
}): GoalPlan {
  const { goal, currentValue, today } = args;
  const starting = Number(goal.starting_value ?? 0);
  const target = goal.target_mode === "incremental" ? starting + Number(goal.target_value) : Number(goal.target_value);
  if (![target,starting,currentValue].every(Number.isFinite)) throw Error("Non-finite goal amount");
  const inverse = goal.metric === "max_drawdown_pct";
  const remaining = Math.max(0, inverse ? currentValue - target : target - currentValue);
  const achieved = inverse ? currentValue <= target : currentValue >= target;
  const span = inverse ? starting - target : target - starting;
  const progressPct = span <= 0
    ? (achieved ? 100 : 0)
    : Math.max(0, Math.min(100, (inverse ? starting - currentValue : currentValue - starting) / span * 100));
  const weekdays = args.allowedWeekdays ?? [1,2,3,4,5];
  const daysLeft = goal.deadline ? remainingTradingDays(today,goal.deadline,weekdays) : null;
  const perDay = goal.metric === "pnl" && daysLeft && !achieved ? round2(remaining/daysLeft) : null;
  const perWeek = perDay == null ? null : round2(perDay * weekdays.length);
  const hist = args.history;
  const feasibility: Feasibility = achieved ? "reached"
    : !goal.deadline ? "no_deadline"
    : daysLeft === 0 ? "expired"
    : goal.metric !== "pnl" || !hist || hist.sessions < 10 ? "insufficient_history"
    : perDay != null && perDay > Math.max(hist.mean,0) ? "above_historical_pace" : "within_historical_pace";
  return {
    current: currentValue,target,remaining:round2(remaining),progressPct:round2(progressPct),
    daysLeft,requiredPerDay:perDay,requiredPerWeek:perWeek,
    historicalDailyNet:hist && hist.sessions >= 10 ? hist.mean : null,
    historicalSessions:hist?.sessions ?? 0,feasibility,achieved,
  };
}
export function milestoneReached(metric: string,current: number,threshold: number): boolean {
  if (![current,threshold].every(Number.isFinite)) return false;
  return metric === "max_drawdown_pct" ? current <= threshold : current >= threshold;
}
/**
 * Planning guidance NEVER recommends trades, stake escalation or catching up.
 * This is a descriptive arithmetic average; it is not a forecast.
 */
export function planNotice(p: GoalPlan): string {
  switch (p.feasibility) {
    case "reached": return "Target reached on the recorded metric. Confirm process discipline before celebrating.";
    case "expired": return "Deadline passed. Review or reset the goal; do not force trades to catch up.";
    case "above_historical_pace": return "Required average exceeds your observed trading-day average. Consider extending the deadline or reducing the target; never increase risk to catch up.";
    case "within_historical_pace": return "Required average is within your historical arithmetic pace, not a reliable prediction of future profits.";
    case "insufficient_history": return "Not enough comparable trading sessions to assess feasibility. The required average is descriptive only, not a daily trading quota.";
    default: return "No deadline set; measure process quality rather than forcing daily profits.";
  }
}

/** Explicit IANA timezone conversion for day-boundary planning; no implicit local clock. */
export function todayInZone(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p=>p.type===type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
