import { Card } from "@/components/ui/card";
import { formatMoney, formatNum, formatPct, pnlTone } from "@/lib/format";
import { computeMetrics, groupByDimension, type TradeLike } from "@/lib/metrics";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";

export function DimensionDashboard({
  title,
  trades,
  keyOf,
}: {
  title: string;
  trades: TradeLike[];
  keyOf: (t: TradeLike) => string;
}) {
  const singular = title.replace(/s$/i, "").toLowerCase();
  const groups = groupByDimension(trades, keyOf);
  const rows = groups
    .map((g) => {
      const m = computeMetrics(g.trades, 10000);
      return { key: g.key, trades: m.tradesCount, winRate: m.winRate, pf: m.profitFactor, expectancy: m.expectancy, net: m.netPnl };
    })
    .sort((a, b) => b.net - a.net);

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const conclusion =
    rows.length === 0
      ? "No closed trades yet — log more trades to see per-dimension performance."
      : rows.length === 1
        ? `Only one ${singular} tracked so far (${best.key}). Diversify to reveal your edge.`
        : `Your sharpest edge: ${best.key} — net ${formatMoney(best.net, "USD", { sign: true })}, PF ${Number.isFinite(best.pf) ? best.pf.toFixed(2) : "∞"}, ${best.winRate.toFixed(0)}% win. Weakest: ${worst.key} — net ${formatMoney(worst.net, "USD", { sign: true })}. Concentrate size on the top performer and cut or refine the tail before adding more variables.`;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>

      <Card className="glow-card p-6 border-border/40">
        <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
          <Sparkles className="h-3 w-3 text-primary" /> AI conclusion
        </div>
        <p className="text-sm leading-relaxed">{conclusion}</p>
      </Card>

      <Card className="glow-card p-6 border-border/40">
        <h3 className="font-semibold mb-4">Net P&L by {singular}</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="key" tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
              <Tooltip
                contentStyle={{ background: "oklch(0.19 0.035 260)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => formatMoney(v, "USD", { sign: true })}
              />
              <Bar dataKey="net">
                {rows.map((d, i) => (
                  <Cell key={i} fill={d.net >= 0 ? "oklch(0.82 0.17 165)" : "oklch(0.65 0.24 25)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left py-2 capitalize">{singular}</th>
              <th className="text-right">Trades</th>
              <th className="text-right">Win %</th>
              <th className="text-right">PF</th>
              <th className="text-right">Expectancy</th>
              <th className="text-right">Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  No data
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/30 last:border-0">
                <td className="py-2 font-medium">{r.key}</td>
                <td className="text-right number-mono text-muted-foreground">{r.trades}</td>
                <td className="text-right number-mono">{formatPct(r.winRate, { digits: 0 })}</td>
                <td className="text-right number-mono">{Number.isFinite(r.pf) ? formatNum(r.pf) : "∞"}</td>
                <td className={`text-right number-mono text-${pnlTone(r.expectancy)}`}>{formatMoney(r.expectancy, "USD", { sign: true })}</td>
                <td className={`text-right number-mono text-${pnlTone(r.net)}`}>{formatMoney(r.net, "USD", { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}