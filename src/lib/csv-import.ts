import { binaryNetPnl, type BinarySettlement } from "./binary-options";
import { sessionFromDate } from "./metrics";

export type ImportProduct = "spot" | "binary";
export type ImportRow = Record<string, string>;
export type ImportMapping = Record<string, string>;

/**
 * Produce canonical fields and a stable key for CSV re-import deduplication.
 * Where a provider supplies trade ticket IDs, those are authoritative.
 * Otherwise identical canonical rows cannot safely be distinguished and the
 * UI clearly warns that two identical legitimate rows may be collapsed.
 */
export async function normalizeCsvRows(
  rows: ImportRow[], mapping: ImportMapping, product: ImportProduct,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const [i, row] of rows.entries()) {
    const val = (field: string): string => mapping[field] ? (row[mapping[field]] ?? "").trim() : "";
    const asset = val("asset").toUpperCase();
    const enteredAt = parseCsvDate(val("entered_at"));
    if (!asset || !enteredAt) throw new Error("Missing asset or invalid entry time on CSV line " + (i + 2));
    const rawDirection = (val("direction") || "long").toLowerCase();
    const direction = /sell|short|put/.test(rawDirection) ? "short" : "long";
    const fees = numberOr(val("fees"), 0);
    if (fees < 0) throw new Error("Negative fees on CSV line " + (i + 2));
    let exitedAt = parseCsvDate(val("exited_at"));
    let expiresAt: Date | null = null;
    let binaryOutcome: BinarySettlement | null = null;
    let pnl = numberOr(val("pnl"), 0) - fees;
    const stake = optionalNumber(val("stake"));
    const payout = optionalNumber(val("payout_percent"));
    const refund = optionalNumber(val("refund_amount"));
    if (product === "binary") {
      binaryOutcome = val("binary_outcome").toLowerCase() as BinarySettlement;
      if (!["win","loss","push","void","pending"].includes(binaryOutcome))
        throw new Error("Unknown binary outcome on CSV line " + (i + 2));
      expiresAt = parseCsvDate(val("expires_at"));
      if (!expiresAt || expiresAt <= enteredAt) throw new Error("Invalid expiry on CSV line " + (i + 2));
      pnl = binaryNetPnl({
        stake: stake ?? NaN, payoutPercent: payout ?? NaN, settlement: binaryOutcome,
        fees, refundAmount: refund ?? undefined,
      });
      exitedAt = binaryOutcome === "pending" ? null : (exitedAt ?? expiresAt);
    }
    if (!Number.isFinite(pnl)) throw new Error("Invalid trade result on CSV line " + (i + 2));
    const result = binaryOutcome === "pending" ? "open" : pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
    const identity = val("source_key")
      ? ["ticket", val("source_key")]
      : ["row", product, asset, direction, enteredAt.toISOString(),
         exitedAt?.toISOString() ?? "", stake, val("position_size"), pnl, fees, payout, binaryOutcome];
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity)));
    const sourceKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
    out.push({
      import_source: "csv", source_key: sourceKey, contract_type: product,
      asset, entered_at: enteredAt.toISOString(), exited_at: exitedAt?.toISOString() ?? null,
      direction, session: sessionFromDate(enteredAt),
      entry_price: optionalNumber(val("entry_price")),
      exit_price: optionalNumber(val("exit_price")),
      stop_loss: optionalNumber(val("stop_loss")),
      take_profit: optionalNumber(val("take_profit")),
      position_size: optionalNumber(val("position_size")),
      stake, pnl, fees, result,
      duration_seconds: exitedAt ? Math.round((+exitedAt - +enteredAt) / 1000) : null,
      ...(product === "binary" ? {
        binary_outcome: binaryOutcome, expires_at: expiresAt?.toISOString(),
        payout_percent: payout, refund_amount: refund,
      } : {}),
    });
  }
  return out;
}

function optionalNumber(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid numeric value: " + raw);
  return n;
}
function numberOr(raw: string, defaultValue: number): number { return optionalNumber(raw) ?? defaultValue; }

function parseCsvDate(raw: string): Date | null {
  if (!raw) return null;
  const date = new Date(raw.replace(" ", "T"));
  return Number.isFinite(+date) ? date : null;
}
