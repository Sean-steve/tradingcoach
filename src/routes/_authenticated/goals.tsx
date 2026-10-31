import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, goalsQuery, tradesQuery, goalMilestonesQuery, profilePreferencesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { isPhase4Active } from "@/lib/foundation-readiness";
import { planGoal, planNotice, realizedSessionPnl, milestoneReached, todayInZone, horizonDeadline } from "@/lib/goal-planning";
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
import { formatPct } from "@/lib/format";
import { formatAccountMoney } from "@/lib/account-currency";

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
  const { data: profile } = useSuspenseQuery(profilePreferencesQuery());
  const { data: milestones } = useSuspenseQuery(goalMilestonesQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const startBal = Number(active?.starting_balance ?? 10000);

  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<MetricKey>("pnl");
  const [target, setTarget] = useState("1000");
  const [deadline, setDeadline] = useState("");
  const [horizon, setHorizon] = useState<"daily"|"weekly"|"monthly"|"quarterly"|"annual"|"custom">("monthly");
  const [mode, setMode] = useState<"absolute"|"incremental">("incremental");
  const [weekdays, setWeekdays] = useState<number[]>([1,2,3,4,5]);
  const [milestoneGoalId, setMilestoneGoalId] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneTarget, setMilestoneTarget] = useState("");
  const history = realizedSessionPnl(trades);
  const today = todayInZone(profile?.timezone || "UTC");
  const currency = active?.currency_confirmed_at ? active.currency : "unreviewed";

  const add = async () => {
    if (!title.trim() || !target) return;
    if (!active?.id) { toast.error("Choose a trading account"); return; }
    if (!Number.isFinite(Number(target)) || Number(target) < 0 || (Number(target)===0 && metric!=="max_drawdown_pct")) {
      toast.error("Target must be valid and nonnegative"); return;
    }
    if (!weekdays.length) { toast.error("Choose at least one permitted planning weekday"); return; }
    if (deadline && deadline < today) { toast.error("Deadline must not be in the past"); return; }
    const { data: u } = await supabase.auth.getUser();
    const current = currentValueFor(metric, trades as unknown as TradeLike[], startBal);
    const enabled = await isPhase4Active();
    const { error } = await supabase.from("goals").insert({
      user_id: u.user!.id,
      account_id: active.id,
      title: title.trim(),
      metric,
      target_value: Number(target),
      starting_value: current,
      deadline: deadline || null,
      ...(enabled ? { horizon, target_mode: metric==="max_drawdown_pct"?"absolute":mode, trading_weekdays: weekdays } : {}),
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

  const active_goals = goals.filter(g => g.status !== "archived" && (!g.account_id || g.account_id === active?.id));
  const addMilestone = async () => {
    const goal = active_goals.find(g => g.id === milestoneGoalId);
    if (!goal || !milestoneTitle.trim() || !Number.isFinite(Number(milestoneTarget))) {
      toast.error("Select a goal, milestone title, and numeric threshold"); return;
    }
    if (!(await isPhase4Active())) { toast.error("Milestones require Phase 4 database migration"); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Sign in to create a milestone"); return; }
    const { error } = await supabase.from("goal_milestones").insert({
      user_id: auth.user.id, goal_id: goal.id,
      title: milestoneTitle.trim(), target_value: Number(milestoneTarget),
    });
    if (error) toast.error(error.message);
    else { setMilestoneTitle(""); setMilestoneTarget(""); qc.invalidateQueries({queryKey:["goal_milestones"]}); toast.success("Milestone added"); }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
        <p className="text-muted-foreground">Set process and financial targets without pressure to overtrade. Calendar planning follows {profile?.timezone ?? "UTC"}.</p>
        <p className="text-xs text-muted-foreground mt-2">Account: {active?.name ?? "No account"} · Currency: {currency}. Estimated daily averages are arithmetic descriptions, not profit obligations or trading signals.</p>
      </header>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold">New goal</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hit $2k P&L this month" className="mt-1" /></div>
          <div><Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => { setMetric(v as MetricKey); if(v==="max_drawdown_pct") setMode("absolute"); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Target</Label><Input type="number" step="any" min="0.01" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1" /></div>
          <div><Label>Time horizon</Label>
            <Select value={horizon} onValueChange={v=>{const next=v as typeof horizon;setHorizon(next);setDeadline(horizonDeadline(today,next)??"");}}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{["daily","weekly","monthly","quarterly","annual","custom"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Goal interpretation</Label>
            <Select value={metric==="max_drawdown_pct"?"absolute":mode} disabled={metric==="max_drawdown_pct"} onValueChange={v=>setMode(v as typeof mode)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="incremental">Improve by target from today</SelectItem><SelectItem value="absolute">Reach total metric value</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" /></div>
        </div>
        <div className="space-y-1">
          <Label>Permitted planning weekdays</Label>
          <div className="flex flex-wrap gap-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((name,index)=>(
            <label key={name} className="text-xs flex gap-1 items-center border border-border/40 rounded px-2 py-1">
              <input type="checkbox" checked={weekdays.includes(index)}
                onChange={e=>setWeekdays(prev=>e.target.checked ? [...prev,index].sort() : prev.filter(x=>x!==index))} />{name}
            </label>
          ))}</div>
          <p className="text-xs text-muted-foreground">A trading-day assumption is only for planning; it never requires a trade on that day.</p>
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
          const modeForGoal = g.target_mode ?? "absolute";
          const tgt = Number(g.target_value) + (modeForGoal === "incremental" ? start : 0);
          const plan = planGoal({ goal: g, currentValue: current, today, history, allowedWeekdays: g.trading_weekdays ?? [1,2,3,4,5] });
          const goalMilestones = milestones.filter(ms=>ms.goal_id===g.id);
          const inverse = g.metric === "max_drawdown_pct";
          // progress 0..100
          const denom = inverse ? Math.max(0.01, start - tgt) : Math.max(0.01, tgt - start);
          const gain = inverse ? start - current : current - start;
          const pct = Math.max(0, Math.min(100, (gain / denom) * 100));
          const achieved = plan.achieved;
          const milestoneCurrent = modeForGoal === "incremental" ? current-start : current;
          const fmt = (v: number) =>
            g.metric === "pnl" ? formatAccountMoney(v, active) :
            g.metric === "win_rate" || g.metric === "max_drawdown_pct" ? formatPct(v) :
            v.toFixed(g.metric === "profit_factor" ? 2 : 0);

          return (
            <Card key={g.id} className="glow-card p-5 border-border/40">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{g.title}</h3>
                    {achieved && <Badge className="bg-primary/20 text-primary border-primary/40">Achieved</Badge>}
                    <Badge variant="outline" className="capitalize text-xs">{g.horizon ?? "custom"}</Badge>
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
              {g.metric === "pnl" && g.deadline && !achieved && (
                <div className="mt-3 p-3 rounded border border-border/40 space-y-1">
                  <div className="text-sm">Remaining: {formatAccountMoney(plan.remaining, active)} · {plan.daysLeft} permitted planning days</div>
                  {plan.requiredPerDay != null && <div className="text-xs text-muted-foreground">
                    Arithmetic average required: {formatAccountMoney(plan.requiredPerDay, active)}/planning day
                    · {formatAccountMoney(plan.requiredPerWeek ?? 0, active)}/configured week
                  </div>}
                  <div className="text-xs text-muted-foreground">
                    Historical comparison: {plan.historicalDailyNet == null ? "insufficient sessions" :
                      formatAccountMoney(plan.historicalDailyNet, active)+" per active trading day"} (n={plan.historicalSessions}).
                  </div>
                  <p className="text-xs text-muted-foreground">{planNotice(plan)}</p>
                </div>
              )}
              {goalMilestones.length>0 && (
                <div className="mt-3 border-t border-border/40 pt-3 space-y-1">
                  <div className="text-xs font-semibold">Milestones ({goalMilestones.filter(ms=>milestoneReached(g.metric,milestoneCurrent,Number(ms.target_value))).length}/{goalMilestones.length})</div>
                  {goalMilestones.map(ms=>(
                    <div key={ms.id} className="flex items-center justify-between gap-3 text-xs">
                      <span>{ms.title} · threshold {Number(ms.target_value)}</span>
                      <Badge variant="outline">{milestoneReached(g.metric,milestoneCurrent,Number(ms.target_value)) ? "Reached (live metric)" : "In progress"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </section>
      <Card className="glow-card p-6 border-border/40 space-y-3">
        <h2 className="font-semibold">Create a milestone</h2>
        <p className="text-xs text-muted-foreground">Milestones are process checkpoints. For incremental goals, thresholds are progress since the goal began.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Goal</Label><Select value={milestoneGoalId} onValueChange={setMilestoneGoalId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select goal" /></SelectTrigger>
            <SelectContent>{active_goals.map(g=><SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}</SelectContent>
          </Select></div>
          <div><Label>Milestone name</Label><Input value={milestoneTitle} onChange={e=>setMilestoneTitle(e.target.value)} placeholder="First 25% of target" className="mt-1"/></div>
          <div><Label>Threshold (goal metric units)</Label><Input type="number" step="any" value={milestoneTarget} onChange={e=>setMilestoneTarget(e.target.value)} className="mt-1"/></div>
        </div>
        <Button variant="outline" onClick={addMilestone}>Add milestone</Button>
      </Card>
    </div>
  );
}