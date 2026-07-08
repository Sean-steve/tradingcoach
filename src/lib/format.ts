export function formatMoney(v: number | null | undefined, currency = "USD", opts: { sign?: boolean } = {}) {
  const n = Number(v ?? 0);
  const sign = opts.sign && n > 0 ? "+" : "";
  return sign + new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function formatPct(v: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}) {
  const n = Number(v ?? 0);
  const sign = opts.sign && n > 0 ? "+" : "";
  return sign + n.toFixed(opts.digits ?? 1) + "%";
}

export function formatNum(v: number | null | undefined, digits = 2) {
  return Number(v ?? 0).toFixed(digits);
}

export function gradeFromScore(score: number): { grade: string; tone: "profit" | "warn" | "loss" | "muted" } {
  if (score >= 90) return { grade: "A+", tone: "profit" };
  if (score >= 80) return { grade: "A", tone: "profit" };
  if (score >= 70) return { grade: "B", tone: "profit" };
  if (score >= 60) return { grade: "C", tone: "warn" };
  if (score >= 50) return { grade: "D", tone: "warn" };
  return { grade: "F", tone: "loss" };
}

export function pnlTone(n: number): "profit" | "loss" | "muted" {
  if (n > 0) return "profit";
  if (n < 0) return "loss";
  return "muted";
}