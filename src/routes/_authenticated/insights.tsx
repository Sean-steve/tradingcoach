import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { insightsQuery, recommendationsQuery, rootCausesQuery, behaviorEventsQuery } from "@/lib/queries";
import { runIntelligence } from "@/lib/intelligence.functions";
import { useActiveAccountId } from "@/lib/active-account";
import { isPhase3Active } from "@/lib/foundation-readiness";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Brain, ChevronDown, Loader2, ShieldQuestion, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Truth Layer — Validated Trading Insights | TRADE OS" },
      { name: "description", content: "Evidence-gated insights, root causes and prioritized actions derived from your own trading behavior." },
      { property: "og:title", content: "Truth Layer — Validated Trading Insights" },
      { property: "og:description", content: "Every claim carries sample size, baseline, delta and confidence. No claim without evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading truth layer…</div>}>
      <Insights />
    </Suspense>
  ),
});

function Insights() {
  const { activeId } = useActiveAccountId();
  const qc = useQueryClient();
  const { data: insights } = useSuspenseQuery(insightsQuery(activeId ?? undefined));
  const { data: causes } = useSuspenseQuery(rootCausesQuery(activeId ?? undefined));
  const { data: recs } = useSuspenseQuery(recommendationsQuery(activeId ?? undefined));
  const { data: events } = useSuspenseQuery(behaviorEventsQuery(activeId ?? undefined));

  const run = useServerFn(runIntelligence);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeId) throw new Error("No active account");
      return run({ data: { accountId: activeId } });
    },
    onSuccess: (res) => {
      toast.success(`${res.insights_validated} validated insights from ${res.trades_analyzed} trades`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Pipeline failed"),
  });

  const validated = insights.filter((i) => i.status === "validated");
  const suppressed = insights.filter((i) => i.status !== "validated");
  const active = recs.filter((r) => r.status === "active");
  const accepted = recs.filter((r) => r.status === "accepted");

  const codeCounts = new Map<string, number>();
  for (const e of events) codeCounts.set(e.code, (codeCounts.get(e.code) ?? 0) + 1);
  const topBehaviors = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const setStatus = async (id: string, status: "accepted" | "dismissed" | "completed") => {
    try {
      const enabled = await isPhase3Active();
      const note = status === "dismissed"
        ? window.prompt("Optional: why is this recommendation not useful?") : null;
      if (status === "dismissed" && note === null) return;
      if (enabled) {
        const action = status === "accepted" ? "accept" : status === "dismissed" ? "dismiss" : "complete";
        const { error } = await supabase.rpc("tradeos_recommendation_action", {
          p_recommendation: id, p_action: action, p_note: note ?? null, p_guardrail: null,
        });
        if (error) throw error;
      } else {
        // Existing experience stays usable until Phase 3 schema activation.
        const { error } = await supabase.from("recommendations")
          .update({ status, resolved_at: status === "accepted" ? null : new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      }
      toast.success(`Recommendation ${status}`);
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recommendation action failed");
    }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Truth Layer</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Validated insights</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Behavior events feed the statistical engine. Claims require adequate samples, a meaningful effect and a
            corrected statistical evidence threshold. Patterns that do not clear these checks stay exploratory.
          </p>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Run intelligence
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Validated insights" value={validated.length} />
        <Stat label="Held for evidence" value={suppressed.length} />
        <Stat label="Root causes" value={causes.length} />
        <Stat label="Behavior events" value={events.length} />
      </div>

      {active.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold flex items-center gap-2 mb-4"><Sparkles className="h-4 w-4 text-primary" /> Prioritized actions</h2>
          <div className="space-y-3">
            {active.map((r) => (
              <div key={r.id} className="border border-border/50 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="number-mono text-xs bg-primary/15 text-primary rounded px-1.5 py-0.5">#{r.priority}</span>
                      <span className="font-medium">{r.title}</span>
                    </div>
                    <p className="text-sm mt-2">{r.action}</p>
                    <p className="text-xs text-muted-foreground mt-2">{r.rationale}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="number-mono text-sm text-loss">{formatMoney(Number(r.impact_estimate ?? 0), "USD", { sign: true })}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">est. impact · {Number(r.confidence)}%</div>
                    <div className="flex gap-1 mt-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "accepted")}>Accept</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "dismissed")}>Dismiss</Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {accepted.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold mb-2">Your active coaching commitments</h2>
          <p className="text-xs text-muted-foreground mb-4">Accepted recommendations remain visible while you practice them. Mark complete only after reviewing evidence in Guardrails.</p>
          <div className="space-y-2">
            {accepted.map(rec => (
              <div key={rec.id} className="flex gap-3 items-center justify-between border border-border/50 rounded p-3">
                <div><p className="font-medium text-sm">{rec.title}</p><p className="text-xs text-muted-foreground">{rec.action}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStatus(rec.id, "completed")}>Complete</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(rec.id, "dismissed")}>Dismiss</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {causes.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold flex items-center gap-2 mb-4"><Brain className="h-4 w-4 text-primary" /> Root causes</h2>
          <div className="space-y-4">
            {causes.map((c) => (
              <div key={c.id} className="border border-border/50 rounded-lg p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{Number(c.confidence)}% confidence</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{c.explanation}</p>
                <ol className="mt-3 space-y-1 text-xs text-muted-foreground list-decimal pl-5">
                  {((c.chain ?? []) as { claim: string }[]).map((s, i) => <li key={i}>{s.claim}</li>)}
                </ol>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="glow-card p-6 border-border/40">
        <h2 className="font-semibold mb-4">Validated claims</h2>
        {validated.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing validated yet. Log more trades with check-ins, then run the intelligence pipeline.
          </p>
        ) : (
          <div className="space-y-2">{validated.map((i) => <InsightRow key={i.id} insight={i} />)}</div>
        )}
      </Card>

      <Card className="glow-card p-6 border-border/40">
        <h2 className="font-semibold flex items-center gap-2 mb-2"><ShieldQuestion className="h-4 w-4 text-muted-foreground" /> Held back for insufficient evidence</h2>
        <p className="text-xs text-muted-foreground mb-4">These patterns exist in the data but do not clear the evidence gate, so the coach may not use them.</p>
        <div className="space-y-2">
          {suppressed.slice(0, 25).map((i) => (
            <div key={i.id} className="text-xs text-muted-foreground border-b border-border/30 pb-2">
              {i.claim} <span className="number-mono">· n={i.sample_size} · {Number(i.confidence)}%</span>
            </div>
          ))}
        </div>
      </Card>

      {topBehaviors.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold mb-4">Behavior frequency</h2>
          <div className="space-y-3">
            {topBehaviors.map(([code, count]) => (
              <div key={code}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="capitalize">{code.replace(/_/g, " ")}</span>
                  <span className="number-mono">{count}×</span>
                </div>
                <Progress value={(count / topBehaviors[0][1]) * 100} className="h-1.5" />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

type InsightRowProps = { insight: { id: string; claim: string; sample_size: number; confidence: number | string; delta: number | string | null; impact_estimate: number | string | null; category: string } };

function InsightRow({ insight }: InsightRowProps) {
  const [open, setOpen] = useState(false);
  const delta = Number(insight.delta ?? 0);
  return (
    <div className="border border-border/50 rounded-lg p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{insight.category}</div>
            <p className="text-sm mt-1">{insight.claim}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`number-mono text-sm ${delta < 0 ? "text-loss" : "text-profit"}`}>{delta > 0 ? "+" : ""}{delta} pts</div>
            <div className="text-[10px] text-muted-foreground">n={insight.sample_size} · {Number(insight.confidence)}%</div>
            <ChevronDown className={`h-3 w-3 ml-auto mt-1 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </div>
      </button>
      {open && <Evidence insightId={insight.id} />}
    </div>
  );
}

function Evidence({ insightId }: { insightId: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ["insight_evidence", insightId],
    queryFn: async () => {
      const { data, error } = await supabase.from("insight_evidence").select("*").eq("insight_id", insightId);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-2 md:grid-cols-3 gap-2">
      {data.map((e) => (
        <div key={e.id} className="text-xs">
          <div className="text-muted-foreground">{e.label}</div>
          <div className="number-mono">{e.value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 border-border/40">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="number-mono text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}
