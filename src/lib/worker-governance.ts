import { timingSafeEqual } from "node:crypto";

/** Shared server-only worker governance. No auth tokens or user IDs in logs. */
export function verifyWorkerToken(header: string | null, expected: string | undefined): boolean {
  const supplied = header?.match(/^Bearer ([^\s]+)$/i)?.[1] ?? "";
  if (!expected || expected.length < 32 || !supplied || supplied.length > 2048) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function workerLimit(value: string | undefined, ceiling: number, fallback: number): number {
  if (value == null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw Error("Worker limit must be a positive integer");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > ceiling) throw Error("Worker limit outside safe range");
  return n;
}

export function workerIsOverdue(data: {status: string;locked_at: string|null;next_attempt_at: string|null}, now=Date.now()): boolean {
  if (data.status === "running") return !!data.locked_at &&
    Date.parse(data.locked_at) < now-15*60*1000;
  return data.status === "pending" && !!data.next_attempt_at &&
    Date.parse(data.next_attempt_at) < now-30*60*1000;
}

export function workerQueueSummary(
  data: readonly {status: string;locked_at: string|null;next_attempt_at: string|null}[],
  now=Date.now()
) {
  const counts={pending:0,running:0,succeeded:0,failed:0,overdue:0};
  for (const row of data) {
    if (row.status in counts && row.status !== "overdue") {
      counts[row.status as "pending"|"running"|"succeeded"|"failed"]++;
    }
    if (workerIsOverdue(row,now)) counts.overdue++;
  }
  return counts;
}

/** Scrub identifiers/tokens before operational logs; cap error exposure. */
export function sanitizedWorkerError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Worker failed";
  return raw
    .replace(/\bBearer\s+\S+/gi,"Bearer [REDACTED]")
    .replace(/\bsb_(secret|publishable)_[\w-]+/gi,"[REDACTED_KEY]")
    .replace(/\beyJ[\w-]{16,}(?:\.[\w-]+){1,2}/g,"[REDACTED_TOKEN]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[REDACTED_DB_URL]")
    .replace(/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi,"[REDACTED_ID]")
    .slice(0,300);
}
