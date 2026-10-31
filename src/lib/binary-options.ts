/**
 * Binary options settlement rules. payoutPercent is NET profit on winning stake,
 * not gross return multiplier. All amounts are in the account's currency.
 */
export type BinarySettlement = "pending" | "win" | "loss" | "push" | "void";

export interface BinaryContract {
  stake: number;
  payoutPercent: number;
  fees?: number;
  settlement: BinarySettlement;
  refundAmount?: number;
}

function money(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

export function binaryNetPnl(contract: BinaryContract): number {
  const { stake, payoutPercent, settlement, fees = 0, refundAmount = stake } = contract;
  if (![stake, payoutPercent, fees, refundAmount].every(Number.isFinite)) throw new Error("Invalid binary contract amount");
  if (stake <= 0 || payoutPercent < 0 || payoutPercent > 500 || fees < 0) throw new Error("Invalid stake/payout/fees");
  if (refundAmount < 0 || refundAmount > stake) throw new Error("Refund must be within the original stake");
  if (settlement === "pending") return 0;
  if (settlement === "win") return money(stake * payoutPercent / 100 - fees);
  if (settlement === "loss") return money(-stake - fees);
  // A broker may refund some or all of a stake for a tie or void contract.
  return money(refundAmount - stake - fees);
}

export function binaryBreakevenWinRate(payoutPercent: number): number {
  if (!Number.isFinite(payoutPercent) || payoutPercent <= 0) throw new Error("Payout must be positive");
  return 100 / (1 + payoutPercent / 100);
}

/** Basic fixed-payout expectancy; exclude push/void trades from the win/loss sample. */
export function binaryExpectedNetPerTrade(stake: number, payoutPercent: number, winRatePct: number, fees = 0): number {
  if (!Number.isFinite(winRatePct) || winRatePct < 0 || winRatePct > 100) throw new Error("Win rate must be 0–100");
  const p = winRatePct / 100;
  return money(p * binaryNetPnl({ stake, payoutPercent, settlement: "win", fees })
    + (1 - p) * binaryNetPnl({ stake, payoutPercent, settlement: "loss", fees }));
}

/** For reporting only; always use authoritative trade.pnl for actual earnings. */
export function binaryAnalytics(trades: Array<{
  contract_type?: string | null; binary_outcome?: string | null;
  payout_percent?: number | null; stake?: number | null; pnl: number; result: string;
}>) {
  const selected = trades.filter(t => t.contract_type === "binary" && t.binary_outcome !== "pending");
  const wins = selected.filter(t => t.binary_outcome === "win").length;
  const losses = selected.filter(t => t.binary_outcome === "loss").length;
  const decided = wins + losses;
  const totalStaked = selected.reduce((n,t) => n + Number(t.stake ?? 0), 0);
  const netPnl = selected.reduce((n,t) => n + Number(t.pnl), 0);
  const weightedPayout = decided
    ? selected.filter(t => t.binary_outcome === "win" || t.binary_outcome === "loss").reduce((n,t) => n + Number(t.payout_percent ?? 0), 0) / decided
    : null;
  return {
    total: selected.length, wins, losses,
    refunded: selected.length - decided,
    winRate: decided ? wins / decided * 100 : null,
    realizedNetPnl: money(netPnl),
    totalStaked: money(totalStaked),
    stakeWeightedRoiPct: totalStaked ? netPnl / totalStaked * 100 : null,
    averagePayoutPct: weightedPayout,
    breakevenWinRatePct: weightedPayout && weightedPayout > 0 ? binaryBreakevenWinRate(weightedPayout) : null,
  };
}
