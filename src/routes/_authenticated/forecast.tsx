import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountsQuery, tradesQuery } from "@/lib/queries";
import { runForecast } from "@/lib/forecast";
import type { TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { formatMoney, formatPct } from "@/lib/format";
import { Area, AreaChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/forecast")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading forecast…</div>}>
      <ForecastPage />
    </Suspense>
  ),
});

function ForecastPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const active = accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const startBal = Number(active?.starting_balance ?? 10000);

  const [tradesPerDay, setTradesPerDay] = useState("3");
  const [horizonDays, setHorizonDays] = useState("30");
  const [runs, setRuns] = useState("1000");
  const [goal, setGoal] = useState("");
  const [tick, setTick] = useState(0);

  const result = useMemo(() => {
    return runForecast({
      trades: trades as unknown as TradeLike[],
      startingBalance: startBal,
      tradesPerDay: Number(tradesPerDay) || 1,
      horizonDays: Number(horizonDays) || 1,
      runs: Math.max(100, Math.min(5000, Number(runs) || 1000)),
      goalBalance: goal ? Number(goal) : undefined,
    });
    // tick forces re-run on button click even if inputs unchanged
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const closedCount = (trades as unknown as TradeLike[]).filter((t) => t.result !== "open").length;
  const insufficient = closedCount < 5;

  const curveData = result.sampleCurves;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Forecast</h1>
        <p className="text-muted-foreground">Monte Carlo projection of your equity over the chosen horizon, sampled from your actual trade P&L distribution.</p>
      </header>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><Label>Trades / day</Label><Input type="number" value={tradesPerDay} onChange={(e) => setTradesPerDay(e.target.value)} className="mt-1" /></div>
          <div><Label>Horizon (days)</Label><Input type="number" value={horizonDays} onChange={(e) => setHorizonDays(e.target.value)} className="mt-1" /></div>
          <div><Label>Simulations</Label><Input type="number" value={runs} onChange={(e) => setRuns(e.target.value)} className="mt-1" /></div>
          <div><Label>Goal balance $</Label><Input type="number" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="optional" className="mt-1" /></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => setTick((t) => t + 1)}>Run forecast</Button></div>
        </div>
        {insufficient && (
          <p className="text-xs text-warning">Need at least 5 closed trades for a meaningful projection. Currently {closedCount}.</p>
        )}
      </Card>

      {!insufficient && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Median final equity" value={formatMoney(result.finalMedian)} />
            <StatCard label="Prob. profitable" value={formatPct(result.probProfit * 100)} tone={result.probProfit >= 0.6 ? "profit" : result.probProfit >= 0.4 ? "neutral" : "loss"} />
            {result.probGoal !== null && (
              <StatCard label="Prob. hit goal" value={formatPct(result.probGoal * 100)} tone={result.probGoal >= 0.5 ? "profit" : "neutral"} />
            )}
            <StatCard label="Prob. ruin" value={formatPct(result.ruinProb * 100)} tone={result.ruinProb <= 0.05 ? "profit" : result.ruinProb <= 0.15 ? "neutral" : "loss"} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="p5 outcome" value={formatMoney(result.p5)} />
            <StatCard label="p25" value={formatMoney(result.p25)} />
            <StatCard label="p75" value={formatMoney(result.p75)} />
            <StatCard label="p95 outcome" value={formatMoney(result.p95)} />
          </div>

          <Card className="glow-card p-6 border-border/40">
            <div className="flex items-center gap-2 mb-3"><LineIcon className="h-4 w-4 text-primary" /><h2 className="font-semibold">Equity cone</h2><span className="text-xs text-muted-foreground">p5 · median · p95 across {result.runs} simulations</span></div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curveData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="step" tickFormatter={(v) => `t${v}`} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatMoney(v)} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="p95" stroke="none" fill="url(#cone)" name="p95" />
                  <Area type="monotone" dataKey="p5" stroke="none" fill="hsl(var(--background))" name="p5 floor" />
                  <Line type="monotone" dataKey="p50" stroke="var(--primary)" strokeWidth={2} dot={false} name="median" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="glow-card p-6 border-border/40">
            <h2 className="font-semibold mb-2">Drawdown risk</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Median max drawdown" value={formatPct(result.medianDrawdownPct)} tone={result.medianDrawdownPct <= 10 ? "profit" : result.medianDrawdownPct <= 20 ? "neutral" : "loss"} />
              <StatCard label="Worst-case (p95) drawdown" value={formatPct(result.worstDrawdownPct)} tone={result.worstDrawdownPct <= 15 ? "profit" : result.worstDrawdownPct <= 30 ? "neutral" : "loss"} />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Interpretation: over {horizonDays} days at {tradesPerDay} trades/day (~{result.horizonTrades} trades), sampling from your realized P&L distribution, half of simulated paths hit a drawdown of at least {formatPct(result.medianDrawdownPct)}. 5% hit {formatPct(result.worstDrawdownPct)} or worse. This is not a market prediction — it is a projection of your current statistical edge repeated forward.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}