/** Deterministic, account-scoped import identity; never derive from CSV row index. */
export interface ImportIdentity {
  accountId: string;
  provider: string;
  brokerTradeId?: string;
  asset?: string;
  enteredAt?: string;
  exitedAt?: string;
  direction?: string;
  grossPnl?: number;
  fees?: number;
  stake?: number | null;
}
export function importCanonicalKey(x: ImportIdentity): string {
  const account = x.accountId.trim().toLowerCase();
  const provider = x.provider.trim().toLowerCase();
  if (!account || !provider) throw new Error("Account and source are required");
  const externalId = x.brokerTradeId?.trim();
  if (externalId) return JSON.stringify(["tradeos-import-v1",account,provider,"external",externalId]);
  if (!x.asset || !x.enteredAt || !x.direction || !Number.isFinite(x.grossPnl)) {
    throw new Error("Missing identity: map broker trade ID or required trade fields");
  }
  // Identical orders with no broker ID are intentionally ambiguous; the
  // importer reports them for manual reconciliation rather than duplicating.
  return JSON.stringify([
    "tradeos-import-v1",account,provider,"fallback",
    x.asset.trim().toUpperCase(),new Date(x.enteredAt).toISOString(),
    x.exitedAt ? new Date(x.exitedAt).toISOString() : null,
    x.direction.trim().toLowerCase(),Math.round(Number(x.grossPnl) * 100),
    Math.round(Number(x.fees ?? 0) * 100),x.stake === null || x.stake === undefined ? null : Math.round(x.stake * 100),
  ]);
}
export async function importFingerprint(x: ImportIdentity): Promise<string> {
  const bytes = new TextEncoder().encode(importCanonicalKey(x));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}
export function distinctImportKeys<T extends { import_fingerprint?: string | null }>(rows: T[]): {
  unique: T[]; repeated: T[];
} {
  const seen = new Set<string>();
  const unique: T[] = [];
  const repeated: T[] = [];
  for (const row of rows) {
    const key = row.import_fingerprint;
    if (key && seen.has(key)) repeated.push(row);
    else { if (key) seen.add(key); unique.push(row); }
  }
  return { unique, repeated };
}
