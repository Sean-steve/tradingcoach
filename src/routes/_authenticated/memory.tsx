import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { adviceOutcomesQuery, insightLifecycleQuery, memoryEntriesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { coachScorecard, type AdviceOutcomeDraft } from "@/lib/meta";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookMarked, CheckCircle2, Flag, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({
    meta: [
      { title: "Trader Memory — Timeline of What Changed | TRADE OS" },
      { name: "description", content: "An immutable timeline of every pattern discovered, fixed, regressed or graduated, plus how accurate the coach has been." },
      { property: "og:title", content: "Trader Memory — Timeline of What Changed" },
      { property: "og:description", content: "Discoveries, changes, regressions and milestones, with a scorecard of which advice actually worked for you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading memory…</div>}>
      <MemoryPage />
    </Suspense>
  ),
});

const KINDS = ["all", "discovery", "change", "regression", "milestone", "intervention"] as const;

const KIND_META: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  discovery: { icon: Sparkles, tone: "text-primary border-primary/30 bg-primary/10", label: "Discovery" },
  change: { icon: TrendingUp, tone: "text-[color:var(--success)] border-[color:var(--success)]/30 bg-[color:var(--success)]/10", label: "Change" },
  regression: { icon: TrendingDown, tone: "text-destructive border-destructive/30 bg-destructive/10", label: "Regression" },
  milestone: { icon: Flag, tone: "text-[color:var(--warn)] border-[color:var(--warn)]/30 bg-[color:var(--warn)]/10", label: "Milestone" },
  intervention: { icon: CheckCircle2, tone: "text-secondary border-secondary/30 bg-secondary/10", label: "Guardrail" },
  manual_change: { icon: BookMarked, tone: "text-muted-foreground border-border bg-muted/30", label: "Manual" },
};

function MemoryPage() {
  const { activeId } = useActiveAccountId();
  const { data: entries } = useSuspenseQuery(memoryEntriesQuery(activeId ?? undefined));
  const { data: lifecycle } = useSuspenseQuery(insightLifecycleQuery(activeId ?? undefined));
  const { data: outcomes } = useSuspenseQuery(adviceOutcomesQuery(activeId ?? undefined));
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");

  const scorecard = useMemo(
    () =>
      coachScorecard(
        outcomes.map((o) => ({
          advice_key: o.advice_key,
          advice_type: o.advice_type,
          title: o.title ?? o.advice_key,
          intervention_id: o.intervention_id,
          accepted: o.accepted,
          dismissed: o.dismissed,
          respected_rate: o.respected_rate == null ? null : Number(o.respected_rate),
          checks_total: o.checks_total,
          worked: o.worked,
          weight: Number(o.weight),
        })) as AdviceOutcomeDraft[],
      ),
    [outcomes],
  );

  const filtered = kind === "all" ? entries : entries.filter((e) => e.kind === kind);
  const durable = lifecycle.filter((l) => l.status === "durable");
  const archived = lifecycle.filter((l) => l.status === "archived");

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BookMarked className="h-6 w-6 text-primary" /> Trader Memory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every run records what changed. Nothing here is generated on the fly — it is the history of your own evidence.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Timeline entries" value={String(entries.length)} />
        <Stat label="Durable patterns" value={String(durable.length)} />
        <Stat label="Archived claims" value={String(archived.length)} />
        <Stat label="Coach accuracy" value={scorecard.accuracy == null ? "—" : `${scorecard.accuracy}%`} />
      </div>

      <Card className="glow-card p-6 border-border/40">
        <div className="text-xs uppercase tracking-wider text-primary mb-2">What's actually working</div>
        <p className="text-sm leading-relaxed">{scorecard.statement}</p>
        <div className="grid gap-3 sm:grid-cols-3 mt-4 text-sm">
          <div><span className="text-muted-foreground">Accepted</span> · {scorecard.accepted}/{scorecard.total}</div>
          <div><span className="text-muted-foreground">Dismissed</span> · {scorecard.dismissed}</div>
          <div><span className="text-muted-foreground">Guardrail adherence</span> · {scorecard.adherence == null ? "not measured" : `${scorecard.adherence}%`}</div>
        </div>
        {scorecard.byType.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {scorecard.byType.map((t) => (
              <div key={t.type} className="flex items-center justify-between text-sm border-b border-border/30 py-1.5 last:border-0">
                <span className="capitalize">{t.type.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground text-xs">
                  {t.worked}/{t.total} worked · weight {t.weight.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex gap-1 rounded-md border border-border p-1 w-fit">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              "px-3 py-1 rounded text-xs capitalize",
              kind === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="glow-card p-10 border-border/40 text-center text-muted-foreground">
          No memory yet. Run the intelligence pipeline from Insights and the system will start recording what changes.
        </Card>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border/60">
          {filtered.map((e) => {
            const meta = KIND_META[e.kind] ?? KIND_META.manual_change;
            const Icon = meta.icon;
            return (
              <Card key={e.id} className="glow-card p-5 border-border/40 relative">
                <div className="absolute -left-[1.4rem] top-6 h-3 w-3 rounded-full bg-primary/70 ring-4 ring-background" />
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border", meta.tone)}>
                      <Icon className="h-3 w-3 inline mr-1 -mt-0.5" />
                      {meta.label}
                    </span>
                    <span className="font-semibold text-sm">{e.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{e.occurred_at.slice(0, 10)}</span>
                </div>
                {e.body && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{e.body}</p>}
              </Card>
            );
          })}
        </div>
      )}

      {lifecycle.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Pattern lifecycle</div>
          <div className="space-y-2">
            {lifecycle.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-4 border-b border-border/30 py-2 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm">{l.claim}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    first seen {l.first_seen_at.slice(0, 10)} · confirmed {l.confirmations}× · contradicted {l.contradictions}×
                    {l.archived_reason ? ` · ${l.archived_reason}` : ""}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border shrink-0",
                    l.status === "durable"
                      ? "text-[color:var(--success)] border-[color:var(--success)]/30 bg-[color:var(--success)]/10"
                      : l.status === "archived"
                        ? "text-muted-foreground border-border bg-muted/30"
                        : "text-primary border-primary/30 bg-primary/10",
                  )}
                >
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="glow-card p-5 border-border/40">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}