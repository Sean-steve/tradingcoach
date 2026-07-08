import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { psychQuery, tradesQuery, accountsQuery } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { formatMoney, pnlTone } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/psychology")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Psych />
    </Suspense>
  ),
});

function Psych() {
  const { data: psych } = useSuspenseQuery(psychQuery());
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(accounts[0]?.id));

  // Correlate: when stress > 7 vs stress <= 7
  const psychByTrade = new Map<string, any>();
  for (const p of psych) if (p.trade_id) psychByTrade.set(p.trade_id, p);

  const rows = trades.map((t) => ({ trade: t, p: psychByTrade.get(t.id) })).filter((r) => r.p);

  const bucket = (name: string, filter: (p: any) => boolean) => {
    const inSet = rows.filter((r) => filter(r.p));
    const wins = inSet.filter((r) => Number(r.trade.pnl) > 0).length;
    const winRate = inSet.length ? (wins / inSet.length) * 100 : 0;
    const pnl = inSet.reduce((s, r) => s + Number(r.trade.pnl), 0);
    return { name, count: inSet.length, winRate, pnl };
  };

  const findings = [
    bucket("High stress (≥7)", (p) => (p.stress ?? 0) >= 7),
    bucket("Low stress (≤4)", (p) => (p.stress ?? 10) <= 4),
    bucket("High focus (≥8)", (p) => (p.focus ?? 0) >= 8),
    bucket("Low focus (≤4)", (p) => (p.focus ?? 10) <= 4),
    bucket("High confidence (≥8)", (p) => (p.confidence ?? 0) >= 8),
    bucket("Poor mood (≤4)", (p) => (p.mood ?? 10) <= 4),
  ];

  const avg = (k: string) => psych.length ? psych.reduce((s, p) => s + Number((p as unknown as Record<string, unknown>)[k] ?? 0), 0) / psych.length : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Psychology Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">{psych.length} check-ins logged.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Avg Mood" value={avg("mood").toFixed(1)} />
        <StatCard label="Avg Stress" value={avg("stress").toFixed(1)} tone={avg("stress") > 6 ? "warn" : "muted"} />
        <StatCard label="Avg Focus" value={avg("focus").toFixed(1)} />
        <StatCard label="Avg Confidence" value={avg("confidence").toFixed(1)} />
        <StatCard label="Avg Discipline" value={avg("discipline").toFixed(1)} tone="primary" />
        <StatCard label="Avg Fear" value={avg("fear").toFixed(1)} />
      </div>

      <Card className="glow-card p-6 border-border/40">
        <h3 className="font-semibold mb-4">Pattern detection</h3>
        {rows.length < 3 ? (
          <p className="text-sm text-muted-foreground">Log at least 3 trades with pre-trade psychology to surface patterns.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left py-2">Condition</th>
                <th className="text-right">Trades</th>
                <th className="text-right">Win Rate</th>
                <th className="text-right">Net P&L</th>
                <th className="text-left pl-4">Insight</th>
              </tr>
            </thead>
            <tbody>
              {findings.filter((f) => f.count > 0).map((f) => (
                <tr key={f.name} className="border-b border-border/30 last:border-0">
                  <td className="py-2 font-medium">{f.name}</td>
                  <td className="text-right number-mono text-muted-foreground">{f.count}</td>
                  <td className={`text-right number-mono ${f.winRate >= 50 ? "text-profit" : "text-loss"}`}>{f.winRate.toFixed(0)}%</td>
                  <td className={`text-right number-mono text-${pnlTone(f.pnl)}`}>{formatMoney(f.pnl, "USD", { sign: true })}</td>
                  <td className="pl-4 text-xs text-muted-foreground">
                    {f.winRate < 40 ? "Consider not trading in this state." : f.winRate > 65 ? "This is your zone. Protect it." : "Neutral — need more samples."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}