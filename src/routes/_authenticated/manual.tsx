import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tomQuery } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BookMarked, Loader2, Plus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "Trading Operating Manual | TRADE OS" },
      { name: "description", content: "Version your trading identity, markets, sessions, strategies, risk limits and non-negotiables — the single source of truth every engine reads." },
      { property: "og:title", content: "Trading Operating Manual | TRADE OS" },
      { property: "og:description", content: "Version your trading identity, risk limits and non-negotiables. Every insight and coaching prompt is checked against this manual." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading manual…</div>}>
      <ManualPage />
    </Suspense>
  ),
});

type StrategyEntry = { name: string; criteria: string };
type Routines = { pre_market: string; during_session: string; post_market: string };

const SESSIONS = ["asian", "london", "newyork", "overlap_ln", "overlap_ny", "off_hours"] as const;

function ManualPage() {
  const qc = useQueryClient();
  const { data: versions } = useSuspenseQuery(tomQuery());
  const latest = versions[0];

  const baseRisk = (latest?.risk_limits ?? {}) as Record<string, unknown>;
  const baseRoutines = (latest?.routines ?? {}) as Partial<Routines>;

  const [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState(latest?.identity ?? "");
  const [markets, setMarkets] = useState<string[]>(latest?.markets ?? []);
  const [marketDraft, setMarketDraft] = useState("");
  const [sessions, setSessions] = useState<string[]>(latest?.sessions ?? []);
  const [strategies, setStrategies] = useState<StrategyEntry[]>(
    Array.isArray(latest?.strategies) ? (latest?.strategies as StrategyEntry[]) : [],
  );
  const [nonNegotiables, setNonNegotiables] = useState<string[]>(latest?.non_negotiables ?? []);
  const [nnDraft, setNnDraft] = useState("");
  const [risk, setRisk] = useState({
    max_risk_pct: str(baseRisk["max_risk_pct"]),
    max_trades_per_day: str(baseRisk["max_trades_per_day"]),
    max_daily_loss: str(baseRisk["max_daily_loss"]),
    max_weekly_loss: str(baseRisk["max_weekly_loss"]),
    min_rr: str(baseRisk["min_rr"]),
  });
  const [routines, setRoutines] = useState<Routines>({
    pre_market: baseRoutines.pre_market ?? "",
    during_session: baseRoutines.during_session ?? "",
    post_market: baseRoutines.post_market ?? "",
  });
  const [notes, setNotes] = useState(latest?.notes ?? "");
  const [changeReason, setChangeReason] = useState("");

  const save = async () => {
    if (!identity.trim()) {
      toast.error("Describe your trading identity — it anchors every engine.");
      return;
    }
    if (latest && changeReason.trim().length < 10) {
      toast.error("Give a change reason (min 10 chars). Manual changes must be auditable.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const nextVersion = (latest?.version ?? 0) + 1;
      await supabase.from("tom_versions").update({ is_active: false }).eq("user_id", uid).eq("is_active", true);
      const { error } = await supabase.from("tom_versions").insert({
        user_id: uid,
        version: nextVersion,
        is_active: true,
        identity: identity.trim(),
        markets,
        sessions,
        strategies: strategies.filter((s) => s.name.trim()) as never,
        risk_limits: Object.fromEntries(
          Object.entries(risk).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]),
        ) as never,
        non_negotiables: nonNegotiables,
        routines: routines as never,
        notes: notes || null,
        change_reason: latest ? changeReason.trim() : "Initial manual",
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["tom_versions"] });
      setChangeReason("");
      toast.success(`Manual v${nextVersion} is now active`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save manual");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BookMarked className="h-3 w-3 text-primary" /> Trading Operating Manual
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Your single source of truth</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every behavior detector, insight and coaching prompt is checked against this manual. Saving creates a new immutable version.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Active version</div>
          <div className="number-mono text-3xl font-bold">{latest ? `v${latest.version}` : "—"}</div>
        </div>
      </div>

      <Card className="glow-card p-6 border-border/40 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Identity</h2>
        <Textarea value={identity} onChange={(e) => setIdentity(e.target.value)} className="min-h-24" placeholder="I am a patient intraday breakout trader on major FX pairs. I trade London open only, 2 setups, max 3 trades a day." />
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Markets & sessions</h2>
        <div>
          <Label className="text-xs text-muted-foreground">Markets you are allowed to trade</Label>
          <div className="flex gap-2 mt-1">
            <Input value={marketDraft} onChange={(e) => setMarketDraft(e.target.value)} placeholder="EURUSD, BTCUSD, US30…" />
            <Button type="button" variant="outline" onClick={() => { const v = marketDraft.trim().toUpperCase(); if (v && !markets.includes(v)) setMarkets([...markets, v]); setMarketDraft(""); }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {markets.map((mk) => (
              <Badge key={mk} variant="secondary" className="gap-1">
                {mk}
                <button type="button" onClick={() => setMarkets(markets.filter((x) => x !== mk))}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            {markets.length === 0 && <span className="text-xs text-muted-foreground">No market restriction set.</span>}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Allowed sessions</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {SESSIONS.map((s) => {
              const on = sessions.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSessions(on ? sessions.filter((x) => x !== s) : [...sessions, s])}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${on ? "bg-primary/10 text-primary border-primary/40" : "border-border text-muted-foreground hover:border-border/80"}`}
                >
                  {s.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Strategies & entry criteria</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setStrategies([...strategies, { name: "", criteria: "" }])}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        {strategies.length === 0 && <p className="text-sm text-muted-foreground">No strategies defined. A trade outside a defined strategy is flagged as “no plan”.</p>}
        <div className="space-y-3">
          {strategies.map((s, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-3 items-start">
              <Input value={s.name} placeholder="Strategy name" onChange={(e) => setStrategies(strategies.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Textarea value={s.criteria} placeholder="Exact entry criteria, invalidation, target logic" className="min-h-16" onChange={(e) => setStrategies(strategies.map((x, j) => (j === i ? { ...x, criteria: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setStrategies(strategies.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Risk limits</h2>
        <p className="text-xs text-muted-foreground -mt-2">These override account settings inside the behavior engine.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Field label="Max risk % / trade" value={risk.max_risk_pct} onChange={(v) => setRisk({ ...risk, max_risk_pct: v })} />
          <Field label="Max trades / day" value={risk.max_trades_per_day} onChange={(v) => setRisk({ ...risk, max_trades_per_day: v })} />
          <Field label="Max daily loss" value={risk.max_daily_loss} onChange={(v) => setRisk({ ...risk, max_daily_loss: v })} />
          <Field label="Max weekly loss" value={risk.max_weekly_loss} onChange={(v) => setRisk({ ...risk, max_weekly_loss: v })} />
          <Field label="Min R:R" value={risk.min_rr} onChange={(v) => setRisk({ ...risk, min_rr: v })} />
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Non-negotiables</h2>
        <div className="flex gap-2">
          <Input value={nnDraft} onChange={(e) => setNnDraft(e.target.value)} placeholder="Never move a stop against the position" />
          <Button type="button" variant="outline" onClick={() => { const v = nnDraft.trim(); if (v) setNonNegotiables([...nonNegotiables, v]); setNnDraft(""); }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ul className="space-y-2">
          {nonNegotiables.map((n, i) => (
            <li key={i} className="flex items-center justify-between text-sm border-b border-border/30 pb-2">
              <span>{n}</span>
              <button type="button" onClick={() => setNonNegotiables(nonNegotiables.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </li>
          ))}
          {nonNegotiables.length === 0 && <li className="text-sm text-muted-foreground">None set yet.</li>}
        </ul>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Routines</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Pre-market</Label>
            <Textarea value={routines.pre_market} onChange={(e) => setRoutines({ ...routines, pre_market: e.target.value })} className="mt-1 min-h-24" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">During session</Label>
            <Textarea value={routines.during_session} onChange={(e) => setRoutines({ ...routines, during_session: e.target.value })} className="mt-1 min-h-24" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Post-market</Label>
            <Textarea value={routines.post_market} onChange={(e) => setRoutines({ ...routines, post_market: e.target.value })} className="mt-1 min-h-24" />
          </div>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Notes & change reason</h2>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" placeholder="Anything else the coach should know." />
        {latest && (
          <div>
            <Label className="text-xs text-muted-foreground">Why are you changing the manual? (required)</Label>
            <Input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="mt-1" placeholder="Cutting max trades from 5 to 3 after overtrading insight" />
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="min-w-40">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {latest ? `Save as v${latest.version + 1}` : "Create manual v1"}
          </Button>
        </div>
      </Card>

      {versions.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Version history</div>
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-4 py-2 border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    v{v.version}
                    {v.is_active && <Badge variant="outline" className="text-primary border-primary/40 text-[10px]">Active</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{v.change_reason ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">{new Date(v.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}