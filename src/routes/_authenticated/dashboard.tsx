import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { accountsQuery, tradesQuery, tradeMistakesQuery, psychQuery } from "@/lib/queries";
import { computeMetrics, performanceScore, consistencyIndex, rollup, bucketWeek, bucketMonth } from "@/lib/metrics";
import type { TradeLike } from "@/lib/metrics";
import { useActiveAccountId } from "@/lib/active-account";
import { StatCard } from "@/components/stat-card";
import { formatMoney, formatPct, formatNum, gradeFromScore, pnlTone } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActivitySquare, AlertTriangle, Bot, Loader2, PlusCircle, Sparkles, TrendingUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { generateDailyAdvice } from "@/lib/ai-advice.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading command center…</div>}>
      <Dashboard />
    </Suspense>
  ),
});

function Dashboard() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { activeId } = useActiveAccountId();
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const { data: mistakes } = useSuspenseQuery(tradeMistakesQuery());
  const { data: psych } = useSuspenseQuery(psychQuery());

  const startBal = Number(active?.starting_balance ?? 10000);
  const currency = "USD";
  const m = computeMetrics(trades as unknown as TradeLike[], startBal);
  const score = performanceScore(m);
  const grade = gradeFromScore(score.total);

  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(now); startWeek.setDate(now.getDate() - 7);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const dayPnl = trades.filter((t) => t.exited_at && new Date(t.exited_at) >= startDay).reduce((s, t) => s + Number(t.pnl), 0);
  const weekPnl = trades.filter((t) => t.exited_at && new Date(t.exited_at) >= startWeek).reduce((s, t) => s + Number(t.pnl), 0);
  const monthPnl = trades.filter((t) => t.exited_at && new Date(t.exited_at) >= startMonth).reduce((s, t) => s + Number(t.pnl), 0);

  const psychScore = psych.length
    ? Math.round(
        psych.reduce((s, p) => s + ((p.discipline ?? 5) + (p.focus ?? 5) + (10 - (p.stress ?? 5)) + (10 - (p.fear ?? 5))) / 4 * 10, 0) / psych.length,
      )
    : 0;

  const consistency = consistencyIndex(m);
  const weekly = rollup(trades as unknown as TradeLike[], bucketWeek);
  const monthly = rollup(trades as unknown as TradeLike[], bucketMonth);
  const weeklyScore = weekly[0] ? scoreFromRollup(weekly[0]) : 0;
  const monthlyScore = monthly[0] ? scoreFromRollup(monthly[0]) : 0;
  const weeklyGrade = gradeFromScore(weeklyScore);
  const monthlyGrade = gradeFromScore(monthlyScore);

  // Loss-lock detection
  const dailyLimit = active?.max_daily_loss ? Number(active.max_daily_loss) : null;
  const weeklyLimit = active?.max_weekly_loss ? Number(active.max_weekly_loss) : null;
  const dailyLocked = dailyLimit != null && dayPnl <= -dailyLimit;
  const weeklyLocked = weeklyLimit != null && weekPnl <= -weeklyLimit;
  const dailyWarn = !dailyLocked && dailyLimit != null && dayPnl <= -dailyLimit * 0.75;
  const weeklyWarn = !weeklyLocked && weeklyLimit != null && weekPnl <= -weeklyLimit * 0.75;

  const equity = m.equityCurve.map((e, i) => ({ i, balance: Number(e.balance.toFixed(2)) }));

  const missionText = suggestMission(m, score, dayPnl);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {(dailyLocked || weeklyLocked || dailyWarn || weeklyWarn) && (
        <Card className={`border-2 p-4 ${dailyLocked || weeklyLocked ? "border-loss/70 bg-loss-soft/40" : "border-[color:var(--warn)]/60"}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 mt-0.5 ${dailyLocked || weeklyLocked ? "text-loss" : "text-[color:var(--warn)]"}`} />
            <div className="text-sm">
              <div className="font-semibold">
                {dailyLocked ? "Daily loss lock triggered" : weeklyLocked ? "Weekly loss lock triggered" : dailyWarn ? "Approaching daily loss limit" : "Approaching weekly loss limit"}
              </div>
              <div className="text-muted-foreground mt-1">
                {dailyLocked || weeklyLocked
                  ? "New trade entry is blocked. Complete a written reflection to unlock, or wait for the next period."
                  : "Consider stopping for the day. Preserve capital and psychology."}
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Command Center</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{active?.name ?? "Main Account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {m.tradesCount} closed · {m.openTrades} open · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/trades/new"><Button className="gap-2"><PlusCircle className="h-4 w-4" /> Log trade</Button></Link>
        </div>
      </div>

      {/* Hero row: balance + score + grade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glow-card lg:col-span-2 p-6 border-border/40 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-60" style={{ background: "var(--gradient-glow)" }} />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Current Balance</div>
              <div className="mt-2 number-mono text-5xl font-bold">{formatMoney(m.currentBalance, currency)}</div>
              <div className="flex items-center gap-3 mt-3 text-sm">
                <span className={`number-mono text-${pnlTone(m.netPnl)}`}>{formatMoney(m.netPnl, currency, { sign: true })}</span>
                <span className="text-muted-foreground">·</span>
                <span className={`number-mono text-${pnlTone(m.roi)}`}>{formatPct(m.roi, { sign: true })}</span>
                <span className="text-muted-foreground">all time</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Performance Score</div>
              <div className={`mt-2 number-mono text-5xl font-bold text-${grade.tone}`}>{score.total}</div>
              <div className="text-sm text-muted-foreground mt-1">Grade {grade.grade}</div>
            </div>
          </div>
          <div className="mt-6 h-32">
            <ResponsiveContainer>
              <AreaChart data={equity} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.17 165)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.82 0.17 165)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.19 0.035 260)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatMoney(v, currency)}
                  labelFormatter={() => "Balance"}
                />
                <Area type="monotone" dataKey="balance" stroke="oklch(0.82 0.17 165)" strokeWidth={2} fill="url(#eq)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glow-card p-6 border-border/40 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-primary" /> Today's Mission
            </div>
            <p className="text-sm mt-2 leading-relaxed">{missionText}</p>
          </div>
          <div className="pt-3 border-t border-border/50 space-y-3">
            <ScoreBar label="Profitability" value={score.profitability} />
            <ScoreBar label="Consistency" value={score.consistency} />
            <ScoreBar label="Risk" value={score.risk} />
            <ScoreBar label="Discipline" value={score.discipline} />
          </div>
        </Card>
      </div>

      {/* Period P&L */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Today" value={formatMoney(dayPnl, currency, { sign: true })} tone={pnlTone(dayPnl)} />
        <StatCard label="This Week" value={formatMoney(weekPnl, currency, { sign: true })} tone={pnlTone(weekPnl)} />
        <StatCard label="This Month" value={formatMoney(monthPnl, currency, { sign: true })} tone={pnlTone(monthPnl)} />
        <StatCard label="Net P&L" value={formatMoney(m.netPnl, currency, { sign: true })} tone={pnlTone(m.netPnl)} />
      </div>

      {/* Psychology / Consistency / Weekly / Monthly grades */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Psychology Score" value={psychScore || "—"} sub="0–100 · pre-trade check-ins" tone={psychScore >= 70 ? "profit" : psychScore >= 50 ? "warn" : psychScore ? "loss" : "muted"} />
        <StatCard label="Consistency Index" value={consistency} sub="win-rate + streak control" tone={consistency >= 70 ? "profit" : consistency >= 50 ? "warn" : "loss"} />
        <StatCard label="Weekly Grade" value={weeklyGrade.grade} sub={weekly[0] ? `${weekly[0].trades} trades · ${formatMoney(weekly[0].netPnl, currency, { sign: true })}` : "no data"} tone={weeklyGrade.tone} />
        <StatCard label="Monthly Grade" value={monthlyGrade.grade} sub={monthly[0] ? `${monthly[0].trades} trades · ${formatMoney(monthly[0].netPnl, currency, { sign: true })}` : "no data"} tone={monthlyGrade.tone} />
      </div>

      {/* AI Daily Advice */}
      <AIAdviceCard />

      {/* Core metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Win Rate" value={formatPct(m.winRate)} tone={m.winRate >= 50 ? "profit" : "warn"} sub={`${m.wins}W / ${m.losses}L`} />
        <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? formatNum(m.profitFactor) : "∞"} tone={m.profitFactor >= 1.5 ? "profit" : m.profitFactor >= 1 ? "warn" : "loss"} />
        <StatCard label="Expectancy" value={formatMoney(m.expectancy, currency, { sign: true })} tone={pnlTone(m.expectancy)} sub="per trade" />
        <StatCard label="Avg R:R" value={formatNum(m.avgRR)} tone={m.avgRR >= 1.5 ? "profit" : "warn"} />
        <StatCard label="Avg Win" value={formatMoney(m.avgWin, currency)} tone="profit" />
        <StatCard label="Avg Loss" value={formatMoney(m.avgLoss, currency)} tone="loss" />
      </div>

      {/* Risk row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Current DD" value={formatMoney(m.currentDrawdown, currency)} tone={m.currentDrawdown > 0 ? "loss" : "muted"} />
        <StatCard label="Max DD" value={formatPct(m.maxDrawdownPct)} sub={formatMoney(m.maxDrawdown, currency)} tone="warn" />
        <StatCard label="Current Streak" value={`${m.currentStreak > 0 ? "+" : ""}${m.currentStreak}`} tone={m.currentStreak > 0 ? "profit" : m.currentStreak < 0 ? "loss" : "muted"} />
        <StatCard label="Longest Win" value={String(m.longestWinStreak)} tone="profit" />
        <StatCard label="Longest Loss" value={String(m.longestLossStreak)} tone="loss" />
        <StatCard label="Rule Compliance" value={formatPct(m.ruleCompliancePct)} tone={m.ruleCompliancePct >= 80 ? "profit" : "warn"} />
      </div>

      {/* Recent activity + mistakes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glow-card p-6 border-border/40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><ActivitySquare className="h-4 w-4 text-primary" /> Recent trades</h3>
            <Link to="/trades"><Button variant="ghost" size="sm">View all</Button></Link>
          </div>
          {trades.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {trades.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full bg-${pnlTone(Number(t.pnl))}`} />
                    <div>
                      <div className="text-sm font-medium">{t.asset}</div>
                      <div className="text-xs text-muted-foreground">{new Date(t.entered_at).toLocaleDateString()} · {t.direction}</div>
                    </div>
                  </div>
                  <div className={`number-mono text-sm text-${pnlTone(Number(t.pnl))}`}>
                    {formatMoney(Number(t.pnl), currency, { sign: true })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="glow-card p-6 border-border/40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Top mistake patterns</h3>
            <Link to="/discipline"><Button variant="ghost" size="sm">Details</Button></Link>
          </div>
          {mistakes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mistakes tagged yet. Tag mistakes on your trades to surface patterns here.</p>
          ) : (
            <div className="space-y-2">
              {topMistakes(mistakes).slice(0, 6).map((mm) => (
                <div key={mm.code} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{mm.name}</div>
                    <div className="text-xs text-muted-foreground">{mm.category}</div>
                  </div>
                  <div className="text-sm number-mono">{mm.count}×</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground uppercase tracking-wider">Psychology</div>
              <div className="number-mono text-lg mt-1">{psychScore || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider">Checklist</div>
              <div className="number-mono text-lg mt-1">{formatPct(m.checklistPct, { digits: 0 })}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="number-mono">{value}</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">No trades yet.</p>
      <Link to="/trades/new"><Button className="mt-3" size="sm">Log your first trade</Button></Link>
    </div>
  );
}

type MistakeAgg = { code: string; name: string; category: string; count: number };
function topMistakes(rows: { mistake_code: string; mistake_catalog?: { name?: string; category?: string } | null }[]): MistakeAgg[] {
  const map = new Map<string, MistakeAgg>();
  for (const r of rows) {
    const key = r.mistake_code;
    const cur = map.get(key) ?? { code: key, name: r.mistake_catalog?.name ?? key, category: r.mistake_catalog?.category ?? "—", count: 0 };
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function suggestMission(m: ReturnType<typeof computeMetrics>, score: ReturnType<typeof performanceScore>, dayPnl: number): string {
  if (m.tradesCount === 0) return "Log your first trade. The system starts coaching after your third closed trade.";
  if (m.currentStreak <= -2) return `You're on a ${Math.abs(m.currentStreak)}-loss streak. Stop trading, do a review, then re-enter with base risk only.`;
  if (m.ruleCompliancePct < 70) return `Rule compliance is ${m.ruleCompliancePct.toFixed(0)}%. Every trade today must map to a checklist item. No exceptions.`;
  if (m.maxDrawdownPct > 15) return `Max drawdown at ${m.maxDrawdownPct.toFixed(1)}%. Cut position size in half until you recover 50% of the DD.`;
  if (dayPnl < 0) return "You're red on the day. One more setup, then stop. Preserve capital and psychology.";
  if (score.discipline < 60) return "Discipline is your weakest pillar. Skip one questionable setup today. Journal why.";
  return "Green zone. Trade your A+ setups only. Do not size up.";
}