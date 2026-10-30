import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, goalsQuery, tradesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Target } from "lucide-react";
import { formatMoney, formatPct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/goals")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading goals…</div>}>
      <GoalsPage />
    </Suspense>
  ),
});

const METRICS = [
  { value: "pnl", label: "Net P&L (account currency)" },
  { value: "win_rate", label: "Win rate (%)" },
  { value: "profit_factor", label: "Profit factor" },
  { value: "discipline_score", label: "Discipline score" },
  { value: "consistency", label: "Consistency score" },
  { value: "trade_count", label: "Trades logged" },
  { value: "max_drawdown_pct", label: "Max drawdown (%) — lower is better" },
  { value: "performance_score", label: "Performance score" },
] as const;

type MetricKey = typeof METRICS[number]["value"];

function currentValueFor(metric: MetricKey, trades: TradeLike[], startingBalance: number): number {
  const m = computeMetrics(trades, startingBalance);
  const s = performanceScore(m);
  switch (metric) {
    case "pnl": return m.netPnl;
    case "win_rate": return m.winRate;
    case "profit_factor": return Number.isFinite(m.profitFactor) ? m.profitFactor : 0;
    case "discipline_score": return s.discipline;
    case "consistency": return s.consistency;
    case "trade_count": return m.tradesCount;
    case "max_drawdown_pct": return m.maxDrawdownPct;
    case "performance_score": return s.total;
  }
}

function GoalsPage() {
  const qc = useQueryClient();
  const { data: goals } = useSuspenseQuery(goalsQuery());
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { activeId } = useActiveAccountId();
  const active = accounts.find(a => a.id === activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const startBal = Number(active?.starting_balance ?? 10000);

  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<MetricKey>("pnl");
  const [target, setTarget] = useState("1000");
  const [deadline, setDeadline] = useState("");

  const add = async () => {
    if (!title.trim() || !target) return;
    const { data: u } = await supabase.auth.getUser();
    const current = currentValueFor(metric, trades as unknown as TradeLike[], startBal);
    const { error } = await supabase.from("goals").insert({
      user_id: u.user!.id,
      account_id: active?.id ?? null,
      title: title.trim(),
      metric,
      target_value: Number(target),
      starting_value: current,
      deadline: deadline || null,
    });
    if (error) toast.error(error.message);
    else { setTitle(""); setTarget(""); setDeadline(""); qc.invalidateQueries({ queryKey: ["goals"] }); toast.success("Goal added"); }
  };

  const archive = async (id: string) => {
    await supabase.from("goals").update({ status: "archived" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  };

  const del = async (id: string) => {
    await supabase.from("goals").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  };

  const active_goals = goals.filter(g => g.status !== "archived" && (g.account_id === active?.id || g.account_id === null));

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
        <p className="text-muted-foreground">Define concrete, measurable targets. Progress is computed live from your trade history.</p>
      </header>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold">New goal</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Improve monthly net P&L while respecting risk limits" className="mt-1" /></div>
          <div><Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Target</Label><Input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1" /></div>
          <div><Label>Deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" /></div>
        </div>
        <Button onClick={add}>Add goal</Button>
      </Card>

      <section className="space-y-3">
        {active_goals.length === 0 && (
          <Card className="glow-card p-8 border-border/40 text-center text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No goals yet. Define your first measurable target above.
          </Card>
        )}
        {active_goals.map((g) => {
          const current = currentValueFor(g.metric as MetricKey, trades as unknown as TradeLike[], startBal);
          const start = Number(g.starting_value ?? 0);
          const tgt = Number(g.target_value);
          const inverse = g.metric === "max_drawdown_pct";
          // progress 0..100
          const denom = inverse ? Math.max(0.01, start - tgt) : Math.max(0.01, tgt - start);
          const gain = inverse ? start - current : current - start;
          const pct = Math.max(0, Math.min(100, (gain / denom) * 100));
          const achieved = inverse ? current <= tgt : current >= tgt;
          const fmt = (v: number) =>
            g.metric === "pnl" ? formatMoney(v, active?.currency ?? "USD") :
            g.metric === "win_rate" || g.metric === "max_drawdown_pct" ? formatPct(v) :
            v.toFixed(g.metric === "profit_factor" ? 2 : 0);

          return (
            <Card key={g.id} className="glow-card p-5 border-border/40">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{g.title}</h3>
                    {achieved && <Badge className="bg-primary/20 text-primary border-primary/40">Achieved</Badge>}
                    {g.account_id === null && <Badge variant="outline">Legacy unscoped goal — active account figures</Badge>}
                    {g.deadline && <Badge variant="outline" className="text-xs">by {g.deadline}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {METRICS.find((m) => m.value === g.metric)?.label} · {fmt(current)} / {fmt(tgt)} <span className="opacity-60">(start {fmt(start)})</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => archive(g.id)}>Archive</Button>
                  <button onClick={() => del(g.id)} className="text-muted-foreground hover:text-loss p-2"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <Progress value={pct} />
              <div className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}% of the way</div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}