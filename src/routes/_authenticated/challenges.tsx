import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { challengesQuery, challengeProgressQuery, tradesQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Trophy, Play, CheckCircle2, XCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/challenges")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <ChallengesPage />
    </Suspense>
  ),
});

function ChallengesPage() {
  const qc = useQueryClient();
  const { data: challenges } = useSuspenseQuery(challengesQuery());
  const { data: progress } = useSuspenseQuery(challengeProgressQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery());

  const metrics = useMemo(() => {
    const closed = trades.filter((t) => t.result !== "open");
    const wins = closed.filter((t) => Number(t.pnl) > 0);
    const losses = closed.filter((t) => Number(t.pnl) < 0);
    const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
    const pf = grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0;
    const journaled = closed.filter((t) => t.pre_notes && t.setup_quality).length;
    return { pf, journaled, closedCount: closed.length };
  }, [trades]);

  const compute = (metric: string) => {
    if (metric === "profit_factor") return metrics.pf;
    if (metric === "journaled_trades") return metrics.journaled;
    return 0; // clean_days / no_revenge_days need daily aggregation — updated by trade-log side-effects
  };

  const start = async (challengeId: string, durationDays: number) => {
    const { data: u } = await supabase.auth.getUser();
    const ends = new Date(); ends.setDate(ends.getDate() + durationDays);
    const { error } = await supabase.from("challenge_progress").insert({
      user_id: u.user!.id, challenge_id: challengeId, ends_at: ends.toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Challenge started");
    qc.invalidateQueries({ queryKey: ["challenge_progress"] });
  };

  const abandon = async (id: string) => {
    if (!confirm("Abandon this challenge?")) return;
    await supabase.from("challenge_progress").update({ failed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["challenge_progress"] });
  };

  const activeByChallenge = new Map(progress.filter((p) => !p.completed_at && !p.failed_at).map((p) => [p.challenge_id, p]));

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Time-Boxed</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-3"><Trophy className="h-7 w-7 text-primary" /> Challenges</h1>
        <p className="text-sm text-muted-foreground mt-1">Layer sprint-style objectives on top of habits and rules. Complete for a badge.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {challenges.map((c) => {
          const active = activeByChallenge.get(c.id);
          const current = active ? compute(c.metric) : 0;
          const pct = active ? Math.min(100, (current / Number(c.target_value)) * 100) : 0;
          const daysLeft = active ? Math.max(0, Math.ceil((new Date(active.ends_at).getTime() - Date.now()) / 86400000)) : 0;
          return (
            <Card key={c.id} className="glow-card border-border/40 p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                </div>
                <div className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  <div>{c.duration_days}d</div>
                  <div className="text-primary">{c.reward_badge_slug}</div>
                </div>
              </div>

              {active ? (
                <>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{c.metric.replace(/_/g, " ")}</span>
                      <span className="number-mono">{current.toFixed(c.metric === "profit_factor" ? 2 : 0)} / {c.target_value}</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {daysLeft} day(s) left</span>
                    <Button size="sm" variant="ghost" onClick={() => abandon(active.id)}><XCircle className="h-3 w-3 mr-1 text-loss" /> Abandon</Button>
                  </div>
                </>
              ) : (
                <Button size="sm" className="gap-2" onClick={() => start(c.id, c.duration_days)}><Play className="h-3 w-3" /> Start challenge</Button>
              )}
            </Card>
          );
        })}
      </div>

      <div className="pt-6 border-t border-border/40">
        <h2 className="font-semibold mb-3">History</h2>
        <div className="space-y-2">
          {progress.filter((p) => p.completed_at || p.failed_at).length === 0 && (
            <p className="text-sm text-muted-foreground">No completed or abandoned challenges yet.</p>
          )}
          {progress.filter((p) => p.completed_at || p.failed_at).map((p) => {
            const c = challenges.find((x) => x.id === p.challenge_id);
            return (
              <div key={p.id} className="flex items-center justify-between text-sm p-3 rounded border border-border/40">
                <div className="flex items-center gap-2">
                  {p.completed_at ? <CheckCircle2 className="h-4 w-4 text-profit" /> : <XCircle className="h-4 w-4 text-loss" />}
                  <span>{c?.title ?? "Challenge"}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(p.completed_at ?? p.failed_at!).toLocaleDateString()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}