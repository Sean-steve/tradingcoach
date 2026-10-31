/**
 * Lifestyle rewards represent plans and user-REPORTED external transfers.
 * They are NEVER proof of settled bank deposits or broker withdrawals.
 */
export type FundingRow = { reward_id: string; event_type: "pledge" | "reported_transfer"; amount: number | string };
export type RewardPlanLike = { id: string; budget: number | string; funding_cap_pct: number | string; min_closed_trades: number; min_plan_adherence_pct: number | string };
const sum = (rows: FundingRow[], kind: FundingRow["event_type"], reward: string) =>
  rows.filter(x => x.reward_id === reward && x.event_type === kind).reduce((n,x) => n + Number(x.amount), 0);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function rewardProgress(reward: RewardPlanLike, events: FundingRow[], closedTrades: ReadonlyArray<{ followed_plan: boolean | null; result: string }>) {
  const budget = Number(reward.budget);
  if (!Number.isFinite(budget) || budget <= 0) throw Error("Invalid reward budget");
  const planned = round2(sum(events,"pledge",reward.id));
  const selfReported = round2(sum(events,"reported_transfer",reward.id));
  const settled = closedTrades.filter(t => t.result !== "open");
  const followed = settled.filter(t => t.followed_plan === true).length;
  // Unknown adherence is NOT assumed compliant.
  const adherence = settled.length ? round2(100 * followed / settled.length) : null;
  const processEligible = settled.length >= reward.min_closed_trades
    && adherence !== null && adherence >= Number(reward.min_plan_adherence_pct);
  const reportedCoverage = Math.min(100,round2(100*selfReported/budget));
  return {
    planned, selfReported, reportedCoverage,
    remainingPlan: round2(Math.max(0,budget-planned)),
    remainingExternal: round2(Math.max(0,budget-selfReported)),
    processEligible, adherence, closedTrades: settled.length,
    maySelfReportRedemption: processEligible && selfReported >= budget,
    verifiedFunding: 0, // zero unless a future independent payment source is connected
  };
}
/** Descriptive global cap; database re-evaluates it transactionally. */
export function planningAllowance(args: {
  realizedNetPnl: number; reservedTaxAndCapital: number;
  allocatedToAllRewards: number; rewardPledged: number;
  rewardBudget: number; rewardCapPct: number;
}) {
  const v = Object.values(args);
  if (v.some(x => !Number.isFinite(x))) throw Error("Invalid allowance inputs");
  const base = Math.max(0,args.realizedNetPnl - Math.max(0,args.reservedTaxAndCapital));
  const global = Math.max(0,round2(base*0.10)-args.allocatedToAllRewards);
  const local = Math.max(0,round2(base*Math.min(10,Math.max(0,args.rewardCapPct))/100)-args.rewardPledged);
  return round2(Math.min(global,local,Math.max(0,args.rewardBudget-args.rewardPledged)));
}
