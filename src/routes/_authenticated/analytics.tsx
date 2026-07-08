import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo } from "react";
import { accountsQuery, tradesQuery } from "@/lib/queries";
import { computeMetrics, type TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { formatMoney, formatNum, formatPct, pnlTone } from "@/lib/format";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Analytics />
    </Suspense>
  ),
});

function Analytics() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(accounts[0]?.id));
  const startBal = Number(accounts[0]?.starting_balance ?? 10000);
  const m = computeMetrics(trades as unknown as TradeLike[], startBal);

  const equity = m.equityCurve.map((e, i) => ({ i, balance: Number(e.balance.toFixed(2)) }));
  const dd = m.drawdownCurve.map((e, i) => ({ i, dd: Number(e.dd.toFixed(2)) }));

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      const d = new Date(t.exited_at ?? t.entered_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(k, (map.get(k) ?? 0) + Number(t.pnl));
    }
    return [...map.entries()].sort().map(([k, v]) => ({ month: k, pnl: Number(v.toFixed(2)) }));
  }, [trades]);

  const bySession = useMemo(() => aggregate(trades, (t) => t.session ?? "off_hours"), [trades]);
  const byAsset = useMemo(() => aggregate(trades, (t) => t.asset).slice(0, 8), [trades]);
  const byDow = useMemo(() => {
    const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const arr = names.map((n) => ({ day: n, pnl: 0, count: 0 }));
    for (const t of trades) {
      const d = new Date(t.exited_at ?? t.entered_at);
      const idx = d.getDay();
      arr[idx].pnl += Number(t.pnl);
      arr[idx].count += 1;
    }
    return arr;
  }, [trades]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Advanced Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Trades" value={m.tradesCount} />
        <StatCard label="Net P&L" value={formatMoney(m.netPnl, "USD", { sign: true })} tone={pnlTone(m.netPnl)} />
        <StatCard label="Win Rate" value={formatPct(m.winRate)} />
        <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? formatNum(m.profitFactor) : "∞"} />
        <StatCard label="Expectancy" value={formatMoney(m.expectancy, "USD", { sign: true })} tone={pnlTone(m.expectancy)} />
        <StatCard label="Max DD" value={formatPct(m.maxDrawdownPct)} tone="warn" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glow-card p-6 border-border/40">
          <h3 className="font-semibold mb-4">Equity curve</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={equity}>
                <defs>
                  <linearGradient id="ec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.17 165)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.82 0.17 165)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                <XAxis dataKey="i" hide />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v, "USD")} />
                <Area type="monotone" dataKey="balance" stroke="oklch(0.82 0.17 165)" strokeWidth={2} fill="url(#ec)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glow-card p-6 border-border/40">
          <h3 className="font-semibold mb-4">Drawdown</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={dd}>
                <defs>
                  <linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.24 25)" stopOpacity={0} />
                    <stop offset="100%" stopColor="oklch(0.65 0.24 25)" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                <XAxis dataKey="i" hide />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Area type="monotone" dataKey="dd" stroke="oklch(0.65 0.24 25)" strokeWidth={2} fill="url(#ddg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glow-card p-6 border-border/40">
          <h3 className="font-semibold mb-4">Monthly P&L</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v, "USD", { sign: true })} />
                <Bar dataKey="pnl">
                  {byMonth.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "oklch(0.82 0.17 165)" : "oklch(0.65 0.24 25)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glow-card p-6 border-border/40">
          <h3 className="font-semibold mb-4">By day of week</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byDow}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v, "USD", { sign: true })} />
                <Bar dataKey="pnl">
                  {byDow.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "oklch(0.82 0.17 165)" : "oklch(0.65 0.24 25)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownTable title="Performance by session" rows={bySession} />
        <BreakdownTable title="Top assets" rows={byAsset} />
      </div>
    </div>
  );
}

const tooltipStyle = { background: "oklch(0.19 0.035 260)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 8, fontSize: 12 };

function aggregate(trades: Array<{ pnl: number | string; result: string }>, key: (t: any) => string) {
  const map = new Map<string, { key: string; count: number; wins: number; pnl: number }>();
  for (const t of trades) {
    const k = key(t);
    const cur = map.get(k) ?? { key: k, count: 0, wins: 0, pnl: 0 };
    cur.count++;
    if (Number(t.pnl) > 0) cur.wins++;
    cur.pnl += Number(t.pnl);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.pnl - a.pnl);
}

function BreakdownTable({ title, rows }: { title: string; rows: { key: string; count: number; wins: number; pnl: number }[] }) {
  return (
    <Card className="glow-card p-6 border-border/40">
      <h3 className="font-semibold mb-4">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr><th className="text-left py-2">Name</th><th className="text-right">Trades</th><th className="text-right">Win %</th><th className="text-right">P&L</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No data</td></tr>}
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/30 last:border-0">
              <td className="py-2">{r.key}</td>
              <td className="text-right number-mono text-muted-foreground">{r.count}</td>
              <td className="text-right number-mono">{formatPct((r.wins / r.count) * 100, { digits: 0 })}</td>
              <td className={`text-right number-mono text-${pnlTone(r.pnl)}`}>{formatMoney(r.pnl, "USD", { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}