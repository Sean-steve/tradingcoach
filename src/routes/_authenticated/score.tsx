import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { accountsQuery, tradesQuery } from "@/lib/queries";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { gradeFromScore } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/score")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <ScorePage />
    </Suspense>
  ),
});

function ScorePage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(accounts[0]?.id));
  const m = computeMetrics(trades as unknown as TradeLike[], Number(accounts[0]?.starting_balance ?? 10000));
  const s = performanceScore(m);
  const grade = gradeFromScore(s.total);

  const pillars = [
    { key: "Profitability", val: s.profitability, why: "Expectancy per trade and profit factor." },
    { key: "Consistency", val: s.consistency, why: "Win rate and loss-streak control." },
    { key: "Risk", val: s.risk, why: "Drawdown control and average R:R." },
    { key: "Discipline", val: s.discipline, why: "Rule compliance and checklist adherence." },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Performance Score</h1>

      <Card className="glow-card p-10 border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 opacity-60 pointer-events-none" style={{ background: "var(--gradient-glow)" }} />
        <div className="relative flex items-center justify-between gap-8">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Composite score</div>
            <div className={`number-mono text-7xl font-bold mt-2 text-${grade.tone}`}>{s.total}</div>
            <div className="text-muted-foreground mt-1">Grade {grade.grade}</div>
          </div>
          <div className="text-right text-sm text-muted-foreground max-w-sm">
            Rewards discipline, consistency, risk management, and rule compliance — not just profits. A trader who loses while following the plan scores higher than one who profits by gambling.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pillars.map((p) => (
          <Card key={p.key} className="glow-card p-6 border-border/40">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{p.key}</h3>
              <span className="number-mono text-3xl">{p.val}</span>
            </div>
            <Progress value={p.val} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-2">{p.why}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}