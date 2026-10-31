import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo } from "react";
import { accountsQuery, tradesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { binaryAnalytics } from "@/lib/binary-options";
import { computeMetrics, rollingPerformance, heatmapData, rollup, bucketDay, bucketWeek, bucketMonth, bucketQuarter, bucketYear, type TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { formatNum, formatPct, pnlTone } from "@/lib/format";
import { formatAccountMoney, type CurrencyAccount } from "@/lib/account-currency";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Analytics />
    </Suspense>
  ),
});

function Analytics() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { activeId } = useActiveAccountId();
  const account = accounts.find(a => a.id === activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(account?.id));
  const startBal = Number(account?.starting_balance ?? 10000);
  const binary = binaryAnalytics(trades);
  const m = computeMetrics(trades as unknown as TradeLike[], startBal);

  const equity = m.equityCurve.map((e, i) => ({ i, balance: Number(e.balance.toFixed(2)) }));
  const dd = m.drawdownCurve.map((e, i) => ({ i, dd: Number(e.dd.toFixed(2)) }));

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      if (t.result === "open") continue;
      const d = new Date(t.exited_at ?? t.entered_at);
      const k = d.toISOString().slice(0, 7);
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
      if (t.result === "open") continue;
      const d = new Date(t.exited_at ?? t.entered_at);
      const idx = d.getUTCDay();
      arr[idx].pnl += Number(t.pnl);
      arr[idx].count += 1;
    }
    return arr;
  }, [trades]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Advanced Analytics</h1>
      <p className="text-sm text-muted-foreground">Account: {account?.name ?? "All"} · Realized trade results. Monthly and weekday bucketing uses UTC.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Trades" value={m.tradesCount} />
        <StatCard label="Net P&L" value={formatAccountMoney(m.netPnl, account, { sign: true })} tone={pnlTone(m.netPnl)} />
        <StatCard label="Win Rate" value={formatPct(m.winRate)} />
        <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? formatNum(m.profitFactor) : "∞"} />
        <StatCard label="Expectancy" value={formatAccountMoney(m.expectancy, account, { sign: true })} tone={pnlTone(m.expectancy)} />
        <StatCard label="Max DD" value={formatPct(m.maxDrawdownPct)} tone="warn" />
      </div>

      {binary.total > 0 && (
        <Card className="glow-card p-6 border-border/40 space-y-3">
          <h2 className="font-semibold">Binary Options — Payout-Aware Performance</h2>
          <p className="text-xs text-muted-foreground">Push and void contracts do not enter the win-rate denominator. Returns are measured against staked capital, not broker gross payouts.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Settled contracts" value={binary.total} />
            <StatCard label="Decisive win rate" value={binary.winRate == null ? "—" : formatPct(binary.winRate)} />
            <StatCard label="Average payout" value={binary.averagePayoutPct == null ? "—" : formatPct(binary.averagePayoutPct)} />
            <StatCard label="No-fee breakeven" value={binary.breakevenWinRatePct == null ? "—" : formatPct(binary.breakevenWinRatePct)} />
            <StatCard label="Net P&L" value={formatAccountMoney(binary.realizedNetPnl, account, { sign: true })} tone={pnlTone(binary.realizedNetPnl)} />
          </div>
          <p className="text-xs text-muted-foreground">{binary.refunded} push/void settlements; total settled stake {formatAccountMoney(binary.totalStaked, account)}.</p>
        </Card>
      )}

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
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatAccountMoney(v, account)} />
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
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatAccountMoney(v, account, { sign: true })} />
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
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatAccountMoney(v, account, { sign: true })} />
                <Bar dataKey="pnl">
                  {byDow.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "oklch(0.82 0.17 165)" : "oklch(0.65 0.24 25)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownTable title="Performance by session" rows={bySession} account={account} />
        <BreakdownTable title="Top assets" rows={byAsset} account={account} />
      </div>

      <WinRateAndRolling trades={trades as unknown as TradeLike[]} />
      <HeatmapCalendar trades={trades as unknown as TradeLike[]} account={account} />
      <PeriodTables trades={trades as unknown as TradeLike[]} account={account} />
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

function BreakdownTable({ title, rows, account }: { title: string; rows: { key: string; count: number; wins: number; pnl: number }[]; account?: CurrencyAccount }) {
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
              <td className={`text-right number-mono text-${pnlTone(r.pnl)}`}>{formatAccountMoney(r.pnl, account, { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function WinRateAndRolling({ trades }: { trades: TradeLike[] }) {
  const rolling = rollingPerformance(trades, 20).map((r) => ({ i: r.i, winRate: Number(r.winRate.toFixed(1)), expectancy: Number(r.expectancy.toFixed(2)), pf: Number(r.pf.toFixed(2)) }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="glow-card p-6 border-border/40">
        <h3 className="font-semibold mb-4">Rolling win rate (20-trade window)</h3>
        <div className="h-64">
          {rolling.length === 0 ? (
            <div className="text-sm text-muted-foreground p-8 text-center">Need at least 20 closed trades.</div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={rolling}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="winRate" stroke="oklch(0.82 0.17 165)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      <Card className="glow-card p-6 border-border/40">
        <h3 className="font-semibold mb-4">Rolling profit factor (20-trade window)</h3>
        <div className="h-64">
          {rolling.length === 0 ? (
            <div className="text-sm text-muted-foreground p-8 text-center">Need at least 20 closed trades.</div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={rolling}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "oklch(0.68 0.03 250)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="pf" stroke="oklch(0.72 0.19 260)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}

function HeatmapCalendar({ trades, account }: { trades: TradeLike[]; account?: CurrencyAccount }) {
  const rows = heatmapData(trades);
  const map = new Map(rows.map((r) => [r.date, r]));
  const today = new Date();
  const days: { date: string; pnl: number; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const r = map.get(k);
    days.push({ date: k, pnl: r?.pnl ?? 0, count: r?.count ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => Math.abs(d.pnl)));
  return (
    <Card className="glow-card p-6 border-border/40">
      <h3 className="font-semibold mb-4">Last 90 days heatmap</h3>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
        {days.map((d) => {
          const intensity = Math.min(1, Math.abs(d.pnl) / max);
          const bg = d.pnl > 0
            ? `oklch(0.82 0.17 165 / ${0.15 + intensity * 0.85})`
            : d.pnl < 0
              ? `oklch(0.65 0.24 25 / ${0.15 + intensity * 0.85})`
              : "oklch(1 0 0 / 5%)";
          return (
            <div
              key={d.date}
              title={`${d.date}: ${d.count} trades · ${formatAccountMoney(d.pnl, account, { sign: true })}`}
              className="aspect-square rounded-sm border border-border/30"
              style={{ background: bg }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-4 text-[11px] text-muted-foreground">
        <span>Loss</span>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "oklch(0.65 0.24 25 / 0.9)" }} />
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "oklch(1 0 0 / 8%)" }} />
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "oklch(0.82 0.17 165 / 0.9)" }} />
        <span>Profit</span>
      </div>
    </Card>
  );
}

function PeriodTables({ trades, account }: { trades: TradeLike[]; account?: CurrencyAccount }) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "lifetime">("monthly");
  const bucketMap = {
    daily: bucketDay,
    weekly: bucketWeek,
    monthly: bucketMonth,
    quarterly: bucketQuarter,
    yearly: bucketYear,
    lifetime: () => "Lifetime",
  } as const;
  const rows = rollup(trades, bucketMap[period]);
  const periods: Array<typeof period> = ["daily", "weekly", "monthly", "quarterly", "yearly", "lifetime"];
  return (
    <Card className="glow-card p-6 border-border/40">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="font-semibold">Period breakdown</h3>
        <div className="flex gap-1 flex-wrap">
          {periods.map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="capitalize text-xs h-7">
              {p}
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left py-2">Period</th>
              <th className="text-right">Trades</th>
              <th className="text-right">Wins</th>
              <th className="text-right">Losses</th>
              <th className="text-right">Win %</th>
              <th className="text-right">PF</th>
              <th className="text-right">Expectancy</th>
              <th className="text-right">Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground">No data</td>
              </tr>
            )}
            {rows.slice(0, 30).map((r) => (
              <tr key={r.period} className="border-b border-border/30 last:border-0">
                <td className="py-2 font-medium">{r.period}</td>
                <td className="text-right number-mono text-muted-foreground">{r.trades}</td>
                <td className="text-right number-mono text-profit">{r.wins}</td>
                <td className="text-right number-mono text-loss">{r.losses}</td>
                <td className="text-right number-mono">{formatPct(r.winRate, { digits: 0 })}</td>
                <td className="text-right number-mono">{Number.isFinite(r.profitFactor) ? formatNum(r.profitFactor) : "∞"}</td>
                <td className={`text-right number-mono text-${pnlTone(r.expectancy)}`}>{formatAccountMoney(r.expectancy, account, { sign: true })}</td>
                <td className={`text-right number-mono text-${pnlTone(r.netPnl)}`}>{formatAccountMoney(r.netPnl, account, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}