import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { interventionsQuery, guardrailChecksQuery, recommendationsQuery } from "@/lib/queries";
import { refreshInterventions } from "@/lib/interventions.functions";
import { draftFromRecommendation, adherenceRate, parseTriggerConfig } from "@/lib/interventions";
import { useActiveAccountId } from "@/lib/active-account";
import { isPhase3Active } from "@/lib/foundation-readiness";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/interventions")({
  head: () => ({
    meta: [
      { title: "Interventions — Guardrails That Change Behavior | TRADE OS" },
      { name: "description", content: "Turn validated recommendations into pre-trade guardrails, then measure whether the targeted behavior actually improved." },
      { property: "og:title", content: "Interventions — Guardrails That Change Behavior" },
      { property: "og:description", content: "Every guardrail carries a baseline rate, an observed rate and a measured trend." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading interventions…</div>}>
      <Interventions />
    </Suspense>
  ),
});

function Interventions() {
  const { activeId } = useActiveAccountId();
  const qc = useQueryClient();
  const { data: ivs } = useSuspenseQuery(interventionsQuery(activeId ?? undefined));
  const { data: checks } = useSuspenseQuery(guardrailChecksQuery());
  const { data: recs } = useSuspenseQuery(recommendationsQuery(activeId ?? undefined));

  const refresh = useServerFn(refreshInterventions);
  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!activeId) throw new Error("No active account");
      return refresh({ data: { accountId: activeId } });
    },
    onSuccess: (r) => {
      toast.success(`${r.evaluated} guardrails measured · ${r.improving} improving · ${r.regressing} regressing`);
      qc.invalidateQueries({ queryKey: ["interventions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const activated = new Set(ivs.map((i) => i.recommendation_id).filter(Boolean) as string[]);
  const candidates = recs.filter((r) => (r.status === "active" || r.status === "accepted") && !activated.has(r.id));

  const activate = async (rec: (typeof recs)[number]) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid || !activeId) return toast.error("No active account");
    const d = draftFromRecommendation({
      recommendation_key: rec.recommendation_key,
      title: rec.title,
      action: rec.action,
      rationale: rec.rationale,
      confidence: rec.confidence,
    });
    try {
      if (await isPhase3Active()) {
        // One transaction: validated recommendation -> accepted -> guardrail.
        const { error } = await supabase.rpc("tradeos_recommendation_action", {
          p_recommendation: rec.id, p_action: "activate", p_note: null,
          p_guardrail: {
            trigger_type: d.trigger_type,
            trigger_config: d.trigger_config,
            hard_block: d.hard_block,
            target_behavior_code: d.target_behavior_code,
          } as never,
        });
        if (error) throw error;
      } else {
        // Pre-migration compatibility: preserve the existing two-step flow.
        const { error } = await supabase.from("interventions").insert({
          user_id: uid, account_id: activeId, recommendation_id: rec.id,
          insight_id: rec.insight_id, title: d.title, action: d.action,
          trigger_type: d.trigger_type, trigger_config: d.trigger_config as never,
          hard_block: d.hard_block, target_behavior_code: d.target_behavior_code,
          evidence: d.evidence, confidence: d.confidence,
        });
        if (error) throw error;
        const { error: recError } = await supabase.from("recommendations")
          .update({ status: "accepted" }).eq("id", rec.id);
        if (recError) throw recError;
      }
      toast.success("Guardrail activated — it will be checked before your next recorded trade");
      qc.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to activate guardrail");
    }
  };

  const toggleBlock = async (id: string, hard: boolean) => {
    const { error } = await supabase.from("interventions").update({ hard_block: hard }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["interventions"] });
  };

  const archive = async (id: string) => {
    const { error } = await supabase.from("interventions").update({ status: "archived", resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Guardrail archived");
    qc.invalidateQueries({ queryKey: ["interventions"] });
  };

  const active = ivs.filter((i) => i.status === "active" || i.status === "failed");
  const closed = ivs.filter((i) => i.status === "succeeded" || i.status === "archived");
  const overall = adherenceRate(checks);

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Intervention Layer</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Guardrails</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            An insight only matters if it changes what you do. Activated recommendations become pre-trade
            guardrails, and each one is checked for statistically supported changes in the targeted behavior. These are observations, not causal proof.
          </p>
        </div>
        <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} className="gap-2">
          {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Measure outcomes
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active guardrails" value={active.length} />
        <Stat label="Graduated" value={ivs.filter((i) => i.status === "succeeded").length} />
        <Stat label="Times fired" value={overall.fired} />
        <Stat label="Adherence" value={`${overall.rate}%`} />
      </div>

      {candidates.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold mb-1">Activate a recommendation</h2>
          <p className="text-xs text-muted-foreground mb-4">Each becomes a rule the trade form checks before you can log an entry.</p>
          <div className="space-y-3">
            {candidates.map((r) => {
              const d = draftFromRecommendation({ recommendation_key: r.recommendation_key, title: r.title, action: r.action, rationale: r.rationale, confidence: r.confidence });
              return (
                <div key={r.id} className="border border-border/50 rounded-lg p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium">{r.title}</div>
                    <p className="text-sm text-muted-foreground mt-1">{r.action}</p>
                    <div className="text-[11px] text-muted-foreground mt-2">
                      Trigger: <span className="capitalize">{d.trigger_type.replace(/_/g, " ")}</span>
                      {d.target_behavior_code && <> · targets <span className="capitalize">{d.target_behavior_code.replace(/_/g, " ")}</span></>}
                      {d.hard_block && <> · <span className="text-loss">hard block</span></>}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => activate(r)}>Activate</Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="glow-card p-6 border-border/40">
        <h2 className="font-semibold mb-4">Active guardrails</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardrails yet. Activate a recommendation above to start intervening.</p>
        ) : (
          <div className="space-y-3">
            {active.map((iv) => {
              const cfg = parseTriggerConfig(iv.trigger_config);
              const ivChecks = checks.filter((c) => c.intervention_id === iv.id);
              const a = adherenceRate(ivChecks);
              const baseline = Number(iv.baseline_rate ?? 0);
              const observed = Number(iv.observed_rate ?? 0);
              return (
                <div key={iv.id} className="border border-border/50 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {iv.hard_block ? <ShieldAlert className="h-4 w-4 text-loss" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
                        <span className="font-medium">{iv.title}</span>
                        <TrendBadge trend={iv.trend} />
                      </div>
                      <p className="text-sm mt-2">{iv.action}</p>
                      <div className="text-[11px] text-muted-foreground mt-2">
                        Fires when: <span className="capitalize">{iv.trigger_type.replace(/_/g, " ")}</span>
                        {cfg.losses != null && ` ≥ ${cfg.losses}`}
                        {cfg.stress != null && ` ≥ ${cfg.stress}`}
                        {cfg.risk_pct != null && ` > ${cfg.risk_pct}%`}
                        {cfg.count != null && ` ≥ ${cfg.count}`}
                        {cfg.sessions?.length ? ` · ${cfg.sessions.join(", ")}` : ""}
                        {" · "}fired {a.fired}× · {a.rate}% respected
                      </div>
                      {iv.evidence && <p className="text-[11px] text-muted-foreground mt-1 italic">{iv.evidence}</p>}
                    </div>
                    <div className="shrink-0 text-right space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Behavior rate</div>
                      <div className="number-mono text-sm">
                        <span className="text-muted-foreground">{baseline}%</span>
                        {" → "}
                        <span className={observed < baseline ? "text-profit" : observed > baseline ? "text-loss" : ""}>{observed}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        target ≤ {Number(iv.target_rate ?? 0)}% · baseline n={iv.baseline_n ?? 0} · since n={iv.observed_n ?? iv.sample_size}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Adjusted q={iv.adjusted_q == null ? "pending" : Number(iv.adjusted_q).toFixed(3)} · observational change only</div>
                      <div className="flex items-center gap-2 justify-end text-[11px]">
                        <span className="text-muted-foreground">Hard block</span>
                        <Switch checked={iv.hard_block} onCheckedChange={(v) => toggleBlock(iv.id, v)} />
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => archive(iv.id)}>Archive</Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={baseline > 0 ? Math.min(100, (observed / baseline) * 100) : 0} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {closed.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold mb-4">Closed</h2>
          <div className="space-y-2">
            {closed.map((iv) => (
              <div key={iv.id} className="text-xs flex items-center justify-between border-b border-border/30 pb-2">
                <span>{iv.title}</span>
                <span className="number-mono text-muted-foreground">
                  {iv.status} · {Number(iv.baseline_rate ?? 0)}% → {Number(iv.observed_rate ?? 0)}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const map: Record<string, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
    improving: { icon: TrendingUp, cls: "text-profit", label: "improving" },
    regressing: { icon: TrendingDown, cls: "text-loss", label: "regressing" },
    flat: { icon: Minus, cls: "text-muted-foreground", label: "flat" },
    insufficient_evidence: { icon: Minus, cls: "text-muted-foreground", label: "not enough evidence" },
  };
  const t = map[trend] ?? map["insufficient_evidence"];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${t.cls}`}>
      <t.icon className="h-3 w-3" /> {t.label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4 border-border/40">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="number-mono text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}