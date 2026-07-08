import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "profit" | "loss" | "warn" | "muted" | "primary";
  icon?: ReactNode;
}) {
  const toneClass =
    tone === "profit"
      ? "text-profit"
      : tone === "loss"
      ? "text-loss"
      : tone === "warn"
      ? "text-[color:var(--warn)]"
      : tone === "primary"
      ? "text-primary"
      : "text-foreground";
  return (
    <div className="glow-card rounded-xl p-4 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className={cn("mt-2 number-mono text-2xl font-semibold", toneClass)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}