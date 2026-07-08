import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo } from "react";
import { accountsQuery, tradesQuery, tradeMistakesQuery, mistakeCatalogQuery } from "@/lib/queries";
import { computeMetrics, type TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { formatMoney, formatPct, pnlTone } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/discipline")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Discipline />
    </Suspense>
  ),
});

function Discipline() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(accounts[0]?.id));
  const { data: mistakes } = useSuspenseQuery(tradeMistakesQuery());
  const { data: catalog } = useSuspenseQuery(mistakeCatalogQuery());

  const m = computeMetrics(trades as unknown as TradeLike[], Number(accounts[0]?.starting_balance ?? 10000));

  const catByCode = new Map(catalog.map((c) => [c.code, c]));

  const agg = useMemo(() => {
    // pnl cost of trades containing each mistake
    const tradeById = new Map(trades.map((t) => [t.id, t]));
    const byCode = new Map<string, { count: number; cost: number }>();
    for (const mm of mistakes) {
      const t = tradeById.get(mm.trade_id);
      const pnl = t ? Number(t.pnl) : 0;
      const cur = byCode.get(mm.mistake_code) ?? { count: 0, cost: 0 };
      cur.count++;
      if (pnl < 0) cur.cost += pnl;
      byCode.set(mm.mistake_code, cur);
    }
    return [...byCode.entries()].map(([code, v]) => ({ code, ...v, meta: catByCode.get(code) })).sort((a, b) => b.count - a.count);
  }, [mistakes, trades, catByCode]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discipline & Mistake Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">Fix the category, not the trade.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Rule Compliance" value={formatPct(m.ruleCompliancePct, { digits: 0 })} tone={m.ruleCompliancePct >= 80 ? "profit" : "warn"} />
        <StatCard label="Checklist Adherence" value={formatPct(m.checklistPct, { digits: 0 })} tone={m.checklistPct >= 80 ? "profit" : "warn"} />
        <StatCard label="Mistakes tagged" value={mistakes.length} />
        <StatCard label="Total mistake cost" value={formatMoney(agg.reduce((s, x) => s + x.cost, 0), "USD")} tone="loss" />
      </div>

      <Card className="glow-card p-6 border-border/40">
        <h3 className="font-semibold mb-4">Mistake catalog</h3>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left py-2">Mistake</th>
              <th className="text-left">Category</th>
              <th className="text-right">Count</th>
              <th className="text-right">Cost</th>
              <th className="text-left pl-4">Suggested fix</th>
            </tr>
          </thead>
          <tbody>
            {agg.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No mistakes tagged yet.</td></tr>}
            {agg.map((r) => (
              <tr key={r.code} className="border-b border-border/30 last:border-0">
                <td className="py-2 font-medium">{r.meta?.name ?? r.code}</td>
                <td className="text-muted-foreground text-xs uppercase tracking-wider">{r.meta?.category}</td>
                <td className="text-right number-mono">{r.count}</td>
                <td className={`text-right number-mono text-${pnlTone(r.cost)}`}>{formatMoney(r.cost, "USD")}</td>
                <td className="pl-4 text-xs text-muted-foreground max-w-md">{r.meta?.suggested_fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}