import { createFileRoute } from "@tanstack/react-router";
import { useActiveAccountId } from "@/lib/active-account";

import { Suspense, useMemo, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, badgesCatalogQuery, habitLogsQuery, tradesQuery, userBadgesQuery, lifestyleRewardsQuery, rewardFundingEventsQuery, profilePreferencesQuery, profitAllocationsQuery } from "@/lib/queries";
import { isPhase4Active } from "@/lib/foundation-readiness";
import { rewardProgress, planningAllowance } from "@/lib/reward-planning";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/format";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";
import { habitStreak } from "@/lib/forecast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Award, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading rewards…</div>}>
      <RewardsPage />
    </Suspense>
  ),
});

type Criteria =
  | { type: "trade_count"; gte: number }
  | { type: "discipline_score"; gte: number }
  | { type: "profit_factor"; gte: number }
  | { type: "win_streak"; gte: number }
  | { type: "habit_streak"; gte: number }
  | { type: "clean_days"; gte: number };

function evaluate(c: Criteria, ctx: { m: ReturnType<typeof computeMetrics>; s: ReturnType<typeof performanceScore>; maxHabitStreak: number }): boolean {
  switch (c.type) {
    case "trade_count": return ctx.m.tradesCount >= c.gte;
    case "discipline_score": return ctx.s.discipline >= c.gte;
    case "profit_factor": return Number.isFinite(ctx.m.profitFactor) && ctx.m.profitFactor >= c.gte;
    case "win_streak": return ctx.m.longestWinStreak >= c.gte;
    case "habit_streak": return ctx.maxHabitStreak >= c.gte;
    case "clean_days": return false; // requires per-day mistake index; deferred
  }
}

const tierColor: Record<string, string> = {
  bronze: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  silver: "bg-slate-300/15 text-slate-200 border-slate-300/30",
  gold: "bg-yellow-400/20 text-yellow-300 border-yellow-400/40 shadow-[0_0_18px_rgba(250,204,21,0.25)]",
  platinum: "bg-cyan-300/20 text-cyan-200 border-cyan-300/40 shadow-[0_0_18px_rgba(103,232,249,0.35)]",
};

function RewardsPage() {
  const qc = useQueryClient();
  const { data: catalog } = useSuspenseQuery(badgesCatalogQuery());
  const { data: earned } = useSuspenseQuery(userBadgesQuery());
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { activeId } = useActiveAccountId();
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const { data: logs } = useSuspenseQuery(habitLogsQuery(60));
  const { data: rewards } = useSuspenseQuery(lifestyleRewardsQuery(active?.id));
  const { data: funding } = useSuspenseQuery(rewardFundingEventsQuery(active?.id));
  const { data: allocations } = useSuspenseQuery(profitAllocationsQuery(active?.id));
  const { data: profile } = useSuspenseQuery(profilePreferencesQuery());
  const currency = profile?.base_currency ?? "USD";
  const [rewardName,setRewardName] = useState("");
  const [rewardCategory,setRewardCategory] = useState<"travel"|"experience"|"purchase"|"education"|"other">("travel");
  const [destination,setDestination] = useState("");
  const [rewardBudget,setRewardBudget] = useState("");
  const [rewardDate,setRewardDate] = useState("");
  const [rewardCap,setRewardCap] = useState("5");
  const [fundReward,setFundReward] = useState("");
  const [fundType,setFundType] = useState<"pledge"|"reported_transfer">("pledge");
  const [fundAmount,setFundAmount] = useState("");
  const [fundReference,setFundReference] = useState("");
  const [reportAttested,setReportAttested] = useState(false);
  const reserved = allocations.filter(x => x.bucket === "tax" || x.bucket === "reserve")
    .reduce((n,x) => n + Number(x.amount),0);
  const allPlanned = funding.filter(x=>x.event_type==="pledge").reduce((n,x)=>n+Number(x.amount),0);

  const earnedIds = new Set(earned.map((b) => b.badge_id));
  const startBal = Number(active?.starting_balance ?? 10000);
  const m = computeMetrics(trades as unknown as TradeLike[], startBal);
  const s = performanceScore(m);

  const maxHabitStreak = useMemo(() => {
    const ids = Array.from(new Set(logs.map((l) => l.habit_id)));
    return ids.reduce((max, id) => Math.max(max, habitStreak(logs, id)), 0);
  }, [logs]);

  const ctx = { m, s, maxHabitStreak };
  const eligibleUnearned = catalog.filter((b) => !earnedIds.has(b.id) && evaluate(b.criteria as Criteria, ctx));

  const createReward = async () => {
    if (!active?.id || !rewardName.trim() || Number(rewardBudget) <= 0 || !Number.isFinite(Number(rewardBudget))) {
      toast.error("Choose an account, reward title, and valid budget"); return;
    }
    if (!(await isPhase4Active())) { toast.error("Activate Phase 4 database migration to plan rewards"); return; }
    const pct=Number(rewardCap);
    if (!Number.isFinite(pct) || pct<0.1 || pct>10) { toast.error("Allocation cap must be 0.1–10%"); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Sign in to plan rewards"); return; }
    const { error } = await supabase.from("lifestyle_rewards").insert({
      user_id:auth.user.id,account_id:active.id,title:rewardName.trim(),
      category:rewardCategory,destination:destination.trim() || null,
      budget:Number(rewardBudget), currency:currency.toUpperCase(),
      funding_cap_pct:pct, target_date:rewardDate||null,
      min_closed_trades:20,min_plan_adherence_pct:80,
    });
    if (error) toast.error(error.message);
    else {setRewardName("");setRewardBudget("");setDestination("");setRewardDate("");
      qc.invalidateQueries({queryKey:["lifestyle_rewards"]}); toast.success("Reward budget planned");}
  };
  const recordEvent = async () => {
    if (!fundReward || !Number.isFinite(Number(fundAmount)) || Number(fundAmount)<=0) {
      toast.error("Choose a reward and valid contribution"); return;
    }
    if (fundType === "reported_transfer" && (!reportAttested || fundReference.trim().length<5)) {
      toast.error("Enter an external transfer reference and confirm it is self-reported"); return;
    }
    try {
      const {error}=await supabase.rpc("tradeos_reward_event",{
        p_reward:fundReward,p_type:fundType,p_amount:Number(fundAmount),
        p_reference:fundType==="reported_transfer"?fundReference.trim():null,
      });
      if(error)throw error;
      toast.success(fundType==="pledge"?"Planning allocation recorded":"External transfer recorded as self-reported (not verified)");
      setFundAmount("");setFundReference("");setReportAttested(false);
      qc.invalidateQueries({queryKey:["reward_funding_events"]});
    } catch(error) {toast.error(error instanceof Error?error.message:"Funding record failed");}
  };
  const redeem = async (id:string) => {
    if (!window.confirm("Confirm you personally redeemed this reward using external funds? TRADE OS cannot verify or execute a payment.")) return;
    const {error}=await supabase.rpc("tradeos_report_reward_redemption",{p_reward:id});
    if(error)toast.error(error.message);
    else {toast.success("Redemption recorded as self-reported");qc.invalidateQueries({queryKey:["lifestyle_rewards"]});}
  };
  const claimAll = async () => {
    if (!eligibleUnearned.length) return;
    const { data: u } = await supabase.auth.getUser();
    const rows = eligibleUnearned.map((b) => ({
      user_id: u.user!.id,
      badge_id: b.id,
      reason: `Criteria met: ${JSON.stringify(b.criteria)}`,
    }));
    const { error } = await supabase.from("user_badges").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`Awarded ${rows.length} badge${rows.length === 1 ? "" : "s"}`); qc.invalidateQueries({ queryKey: ["user_badges"] }); }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rewards</h1>
          <p className="text-muted-foreground">Milestones earned through discipline, consistency, and consistent execution.</p>
        </div>
        {eligibleUnearned.length > 0 && (
          <Button onClick={claimAll} className="shadow-[0_0_18px_var(--primary)]">
            <Award className="h-4 w-4 mr-2" /> Claim {eligibleUnearned.length} new
          </Button>
        )}
      </header>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <div>
          <h2 className="font-semibold">Plan a real-life reward</h2>
          <p className="text-xs text-muted-foreground">Travel, purchases and experiences are planning goals, not inducements to increase trading risk. P&L is NOT withdrawable cash. Profile currency: {currency}.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Reward title</Label><Input value={rewardName} onChange={e=>setRewardName(e.target.value)} placeholder="Zanzibar holiday" className="mt-1"/></div>
          <div><Label>Category</Label><Select value={rewardCategory} onValueChange={v=>setRewardCategory(v as typeof rewardCategory)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["travel","experience","purchase","education","other"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
          </Select></div>
          <div><Label>Location / destination</Label><Input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Zanzibar" className="mt-1"/></div>
          <div><Label>Budget ({currency})</Label><Input type="number" min="0.01" step="0.01" value={rewardBudget} onChange={e=>setRewardBudget(e.target.value)} className="mt-1"/></div>
          <div><Label>Planned profit share cap (%)</Label><Input type="number" min="0.1" max="10" step="0.1" value={rewardCap} onChange={e=>setRewardCap(e.target.value)} className="mt-1"/></div>
          <div><Label>Target date</Label><Input type="date" value={rewardDate} onChange={e=>setRewardDate(e.target.value)} className="mt-1"/></div>
        </div>
        <Button onClick={createReward}>Create reward plan</Button>
        <p className="text-xs text-muted-foreground">Funding plans require at least 20 recorded closed trades and 80% plan adherence before a self-reported redemption. This app does not verify bank transfers, broker withdrawals or tax obligations.</p>
      </Card>

      {rewards.length>0 && <section className="space-y-3">
        <h2 className="font-semibold">Lifestyle reward roadmap</h2>
        {rewards.map(reward=>{
          const progress=rewardProgress(reward,funding,trades);
          const amountAvailable=planningAllowance({
            realizedNetPnl:m.netPnl,reservedTaxAndCapital:reserved,
            allocatedToAllRewards:allPlanned,rewardPledged:progress.planned,
            rewardBudget:Number(reward.budget),rewardCapPct:Number(reward.funding_cap_pct),
          });
          return <Card key={reward.id} className="glow-card p-5 border-border/40 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">{reward.category} · {reward.destination || "Personal"}</div>
                <h3 className="font-semibold">{reward.title}</h3>
                <p className="text-xs text-muted-foreground">Budget {formatMoney(Number(reward.budget),reward.currency)} · target {reward.target_date??"unscheduled"} · {reward.status.replaceAll("_"," ")}</p>
              </div>
              <Badge variant="outline">{progress.processEligible?"Process requirements satisfied":"Process requirements pending"}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>Planned allocation<strong className="block">{formatMoney(progress.planned,reward.currency)}</strong></div>
              <div>Self-reported external saving<strong className="block">{formatMoney(progress.selfReported,reward.currency)}</strong></div>
              <div>Independently verified<strong className="block">{formatMoney(progress.verifiedFunding,reward.currency)}</strong></div>
              <div>Conservative new allowance<strong className="block">{formatMoney(amountAvailable,reward.currency)}</strong></div>
            </div>
            <Progress value={progress.reportedCoverage}/>
            <p className="text-xs text-muted-foreground">{progress.reportedCoverage}% of budget self-reported externally; {progress.closedTrades} closed trades · {progress.adherence==null?"unknown":progress.adherence+"%"} plan adherence. Neither pledge nor self-report constitutes verified funds.</p>
            {reward.status==="planned" && <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={()=>{setFundReward(reward.id);setFundType("pledge");}}>Plan contribution</Button>
                <Button size="sm" variant="outline" onClick={()=>{setFundReward(reward.id);setFundType("reported_transfer");}}>Record external transfer (self-report)</Button>
                <Button size="sm" disabled={!progress.maySelfReportRedemption} onClick={()=>redeem(reward.id)}>Mark redeemed (self-reported)</Button>
              </div>
              {fundReward===reward.id && <div className="p-3 border border-border/40 rounded space-y-3">
                <p className="text-sm font-medium">{fundType==="pledge"?"Earmark trading-profit budget":"Record an external savings transfer you made"}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div><Label>Amount ({reward.currency})</Label><Input type="number" step="0.01" min="0.01" value={fundAmount} onChange={e=>setFundAmount(e.target.value)}/></div>
                  {fundType==="reported_transfer" && <div><Label>External transfer reference</Label><Input value={fundReference} onChange={e=>setFundReference(e.target.value)} placeholder="Bank/transfer receipt ID"/></div>}
                </div>
                {fundType==="reported_transfer"&&<label className="flex gap-2 text-xs items-start"><input type="checkbox" checked={reportAttested} onChange={e=>setReportAttested(e.target.checked)}/>I independently transferred these funds outside TRADE OS. This record is self-reported, not verified or paid by TRADE OS.</label>}
                <div className="flex gap-2"><Button size="sm" onClick={recordEvent}>Record {fundType==="pledge"?"plan":"self-report"}</Button><Button size="sm" variant="ghost" onClick={()=>setFundReward("")}>Close</Button></div>
              </div>}
            </>}
          </Card>;
        })}
      </section>}

      <h2 className="font-semibold">Achievement badges</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {catalog.map((b) => {
          const has = earnedIds.has(b.id);
          const eligible = !has && evaluate(b.criteria as Criteria, ctx);
          return (
            <Card key={b.id} className={cn("p-5 border-border/40 relative overflow-hidden transition", has ? "glow-card" : "bg-card/30")}>
              <div className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border", tierColor[b.tier])}>
                {b.tier}
              </div>
              <h3 className={cn("font-semibold mt-3", !has && "text-muted-foreground")}>{b.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{b.description}</p>
              <div className="mt-3 text-xs">
                {has ? (
                  <Badge className="bg-primary/20 text-primary border-primary/40">Earned</Badge>
                ) : eligible ? (
                  <Badge className="bg-primary/10 text-primary border-primary/30">Eligible — claim</Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" /> Locked</span>
                )}
              </div>
              <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-primary/5 blur-xl" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}