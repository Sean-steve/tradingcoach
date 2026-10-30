/**
 * Trade OS Phase 2 — binary-option financial contract.
 *
 * Payout percentage is NET profit as a percentage of stake, not a gross
 * return multiplier (e.g. 80 means a win earns 0.80 * stake).
 * A settlement refunds principal to the account outside P&L: only profit,
 * lost stake, fees and partial rebates change recorded P&L.
 *
 * This module is pure, usable by web, analytics, import and tests. The
 * PostgreSQL trigger independently enforces the same canonical calculation.
 */
export type BinarySettlement = "win" | "loss" | "push" | "void" | "open";
export interface BinaryContract {
  stake: number;
  payoutPercent: number;
  fees: number;
  settlement: BinarySettlement;
  refundAmount?: number;
}
export interface BinaryCalculation {
  pnl: number;
  grossProfit: number;
  result: "win" | "loss" | "breakeven" | "open";
  refundedPrincipal: number;
  breakevenWinRate: number;
}
function asCents(n: number, name: string): number {
  if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new Error(name + " must be a finite nonnegative amount");
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 0.000001) throw new Error(name + " cannot exceed two decimal places");
  return cents;
}
export function breakevenWinRatePercent(payoutPercent: number, stake: number, fees = 0, lossRefund = 0): number {
  const stakeCents = asCents(stake, "Stake");
  const feesCents = asCents(fees, "Fees");
  const refundCents = asCents(lossRefund, "Refund");
  if (stakeCents <= 0 || refundCents > stakeCents) throw new Error("Invalid stake/refund");
  if (!Number.isFinite(payoutPercent) || payoutPercent < 0 || payoutPercent > 10000) throw new Error("Invalid payout percentage");
  // x*grossWin + (1-x)*grossLoss - fees = 0
  const win = stakeCents * payoutPercent / 100 - feesCents;
  const loss = -(stakeCents - refundCents) - feesCents;
  const denom = win - loss;
  if (denom <= 0) return NaN;
  return (-loss / denom) * 100;
}
export function calculateBinarySettlement(c: BinaryContract): BinaryCalculation {
  const stakeCents = asCents(c.stake, "Stake");
  const feeCents = asCents(c.fees, "Fees");
  if (stakeCents === 0) throw new Error("Binary stake must be greater than zero");
  if (!Number.isFinite(c.payoutPercent) || c.payoutPercent < 0 || c.payoutPercent > 10000) {
    throw new Error("Payout percent must be between 0 and 10000");
  }
  const ratioPpm = Math.round(c.payoutPercent * 10000);
  if (Math.abs(c.payoutPercent * 10000 - ratioPpm) > 0.000001) throw new Error("Payout percent supports at most four decimal places");
  const refundCents = asCents(c.refundAmount ?? (c.settlement === "push" || c.settlement === "void" ? c.stake : 0), "Refund");
  if (refundCents > stakeCents) throw new Error("Refund cannot exceed stake");
  if ((c.settlement === "push" || c.settlement === "void") && refundCents !== stakeCents) {
    throw new Error("Push and void require full principal refund");
  }
  if ((c.settlement === "win" || c.settlement === "open") && refundCents !== 0) throw new Error("Win/open cannot have a refund");
  const grossWinCents = Math.round(stakeCents * ratioPpm / 1_000_000);
  let profitCents: number;
  let result: BinaryCalculation["result"];
  switch (c.settlement) {
    case "win": profitCents = grossWinCents - feeCents; result = "win"; break;
    case "loss": profitCents = -(stakeCents - refundCents) - feeCents; result = "loss"; break;
    case "push":
    case "void": profitCents = -feeCents; result = "breakeven"; break;
    case "open": profitCents = 0; result = "open"; break;
    default: throw new Error("Unsupported binary settlement");
  }
  if (c.settlement === "open" && feeCents !== 0) throw new Error("Unsettled contracts must not recognize fees");
  return {
    pnl: profitCents === 0 ? 0 : profitCents / 100,
    grossProfit: grossWinCents / 100,
    result,
    refundedPrincipal: refundCents / 100,
    breakevenWinRate: breakevenWinRatePercent(c.payoutPercent, c.stake, c.fees, c.settlement === "loss" ? refundCents / 100 : 0),
  };
}
export function validateBinaryExpiry(entry: string, expiry: string): void {
  const start = Date.parse(entry);
  const end = Date.parse(expiry);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Expiry must be a valid time after entry");
  }
}

export interface BinaryTradeRow {
  instrument_type?: string | null;
  binary_payout_ratio?: number | null;
  stake?: number | null;
  fees?: number | null;
  binary_refund_amount?: number | null;
  result: string;
  pnl: number | string;
}
export interface BinaryPerformance {
  total: number;
  wins: number;
  losses: number;
  refunds: number;
  winRatePercent: number;
  realizedPnl: number;
  avgPayoutPercent: number | null;
  approximateBreakevenWinRatePercent: number | null;
  sampleNetExpectancy: number;
}
export function calculateBinaryPerformance(rows: BinaryTradeRow[]): BinaryPerformance {
  const contracts = rows.filter(r => r.instrument_type === "binary_option" && r.result !== "open");
  const wins = contracts.filter(r => r.result === "win").length;
  const losses = contracts.filter(r => r.result === "loss").length;
  const refunds = contracts.length - wins - losses;
  const decided = wins + losses;
  let totalStake = 0;
  let weightedPayout = 0;
  let totalFees = 0;
  let totalRefundOnLosses = 0;
  for (const t of contracts) {
    if (t.result !== "win" && t.result !== "loss") continue;
    const stake = Number(t.stake ?? 0);
    const ratio = Number(t.binary_payout_ratio ?? NaN);
    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(ratio)) continue;
    totalStake += stake;
    weightedPayout += stake * ratio;
    totalFees += Number(t.fees ?? 0);
    if (t.result === "loss") totalRefundOnLosses += Number(t.binary_refund_amount ?? 0);
  }
  const avgRatio = totalStake > 0 ? weightedPayout / totalStake : null;
  const avgStake = decided ? totalStake / decided : 0;
  const breakeven = avgRatio !== null && avgStake > 0 ?
    breakevenWinRatePercent(avgRatio * 100, avgStake, totalFees / decided, totalRefundOnLosses / decided) : null;
  const net = contracts.reduce((sum, t) => sum + Number(t.pnl), 0);
  return {
    total: contracts.length, wins, losses, refunds,
    winRatePercent: decided ? wins / decided * 100 : 0,
    realizedPnl: Math.round(net * 100) / 100,
    avgPayoutPercent: avgRatio === null ? null : avgRatio * 100,
    approximateBreakevenWinRatePercent: breakeven,
    sampleNetExpectancy: contracts.length ? net / contracts.length : 0,
  };
}
