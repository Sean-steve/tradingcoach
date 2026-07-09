import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, badgesCatalogQuery, habitLogsQuery, tradesQuery, userBadgesQuery } from "@/lib/queries";
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
  const active = accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const { data: logs } = useSuspenseQuery(habitLogsQuery(60));

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