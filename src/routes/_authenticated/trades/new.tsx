import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, strategiesQuery, mistakeCatalogQuery, tradesQuery, interventionsQuery, tomQuery, behaviorEventsQuery } from "@/lib/queries";
import { sessionFromDate } from "@/lib/metrics";
import { todayPnl, weekPnl } from "@/lib/metrics";
import type { TradeLike } from "@/lib/metrics";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { evaluateTrigger, type InterventionLike, type TriggerContext } from "@/lib/interventions";
import { useActiveAccountId } from "@/lib/active-account";
import { isFoundationMigrationActive, isPhase2Active } from "@/lib/foundation-readiness";
import { binaryNetPnl, binaryBreakevenWinRate, type BinarySettlement } from "@/lib/binary-options";

export const Route = createFileRoute("/_authenticated/trades/new")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <NewTrade />
    </Suspense>
  ),
});

type TradeInsert = Database["public"]["Tables"]["trades"]["Insert"];

function NewTrade() {
  const navigate = useNavigate();
  const { activeId } = useActiveAccountId();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: strategies } = useSuspenseQuery(strategiesQuery());
  const { data: catalog } = useSuspenseQuery(mistakeCatalogQuery());
  const { data: allTrades } = useSuspenseQuery(tradesQuery());
  const { data: interventions } = useSuspenseQuery(interventionsQuery());
  const { data: manualVersions } = useSuspenseQuery(tomQuery());
  const activeManual = manualVersions.find((m) => m.is_active);

  const [saving, setSaving] = useState(false);
  const [reflection, setReflection] = useState("");
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [screenshots, setScreenshots] = useState<{ file: File; kind: string; preview: string }[]>([]);
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [acked, setAcked] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    account_id: activeId ?? accounts[0]?.id ?? "",
    contract_type: "spot" as "spot" | "binary",
    binary_outcome: "win" as BinarySettlement,
    expires_at: new Date(Date.now() + 5 * 60000).toISOString().slice(0,16),
    payout_percent: "80",
    refund_amount: "",
    strategy_id: "",
    asset: "",
    setup: "",
    direction: "long" as "long" | "short",
    entered_at: new Date().toISOString().slice(0, 16),
    exited_at: new Date().toISOString().slice(0, 16),
    entry_price: "",
    exit_price: "",
    stop_loss: "",
    take_profit: "",
    position_size: "",
    stake: "",
    risk_pct: "",
    planned_rr: "",
    realized_rr: "",
    pnl: "",
    fees: "0",
    result: "win" as "win" | "loss" | "breakeven" | "open",
    confidence: 5,
    setup_quality: 5,
    checklist_completed: true,
    followed_plan: true,
    pre_notes: "",
    post_notes: "",
    reason_entry: "",
    reason_exit: "",
    lessons: "",
    tags: "",
    // psychology (pre)
    p_mood: 5,
    p_stress: 5,
    p_focus: 5,
    p_confidence: 5,
    // decision quality (process, 1–5)
    d_plan_adherence: 3,
    d_entry_quality: 3,
    d_risk_control: 3,
    d_patience: 3,
    d_exit_quality: 3,
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const { data: recentEvents } = useSuspenseQuery(behaviorEventsQuery(form.account_id));
  const isBinary = form.contract_type === "binary";
  const binaryPreview = (() => {
    if (!isBinary || !form.stake || !form.payout_percent) return null;
    try {
      return binaryNetPnl({
        stake: Number(form.stake), payoutPercent: Number(form.payout_percent),
        fees: Number(form.fees || 0), settlement: form.binary_outcome,
        refundAmount: form.refund_amount ? Number(form.refund_amount) : undefined,
      });
    } catch { return null; }
  })();

  // Loss-lock computation for the currently selected account
  const selectedAcct = accounts.find((a) => a.id === form.account_id) ?? accounts[0];
  const acctTrades = (allTrades ?? []).filter((t) => t.account_id === selectedAcct?.id) as unknown as TradeLike[];
  const dayPnlNow = todayPnl(acctTrades);
  const weekPnlNow = weekPnl(acctTrades);
  const manualLimits = (activeManual?.risk_limits ?? {}) as Record<string, unknown>;
  const manualLimit = (key: string, fallback: number | null | undefined): number | null => {
    const n = Number(manualLimits[key]);
    return manualLimits[key] != null && Number.isFinite(n) ? n : fallback ?? null;
  };
  const dLimit = manualLimit("max_daily_loss", selectedAcct?.max_daily_loss == null ? null : Number(selectedAcct.max_daily_loss));
  const wLimit = manualLimit("max_weekly_loss", selectedAcct?.max_weekly_loss == null ? null : Number(selectedAcct.max_weekly_loss));
  const dailyLocked = dLimit != null && dayPnlNow <= -dLimit;
  const weeklyLocked = wLimit != null && weekPnlNow <= -wLimit;
  const isLocked = !unlocked && (dailyLocked || weeklyLocked);

  // ---- Active guardrails (Intervention Layer) ----
  const enteredDate = new Date(form.entered_at);
  const closed = acctTrades.filter((t) => t.result !== "open").slice();
  let lossStreak = 0;
  for (const t of closed) {
    if (Number(t.pnl) < 0) lossStreak++;
    else break;
  }
  const dayKey = enteredDate.toISOString().slice(0, 10);
  const tradesToday = acctTrades.filter((t) => String(t.entered_at).slice(0, 10) === dayKey).length;
  const triggerCtx: TriggerContext = {
    lossStreak,
    stress: form.p_stress,
    riskPct: form.risk_pct ? Number(form.risk_pct) : null,
    tradesToday,
    session: sessionFromDate(enteredDate),
    recentBehaviorCodes: recentEvents
      .filter(event => new Date(event.occurred_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .map(event => event.code),
  };
  const activeGuardrails = (interventions as unknown as InterventionLike[]).filter(
    (i) => i.status === "active" && (i as unknown as { account_id: string | null }).account_id === selectedAcct?.id,
  );
  const evaluated = activeGuardrails.map((iv) => ({ iv, ...evaluateTrigger(iv, triggerCtx) }));
  const fired = evaluated.filter((e) => e.triggered);
  const blocking = fired.filter(
    (e) => e.iv.hard_block && !acked.includes(e.iv.id) && (overrides[e.iv.id]?.trim().length ?? 0) < 20,
  );
  const guardrailBlocked = blocking.length > 0;

  const submitReflection = async () => {
    if (reflection.trim().length < 40) {
      toast.error("Reflection must be at least 40 characters. Be honest with yourself.");
      return;
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      await supabase.from("psychology_checkins").insert({
        user_id: uid,
        phase: "post",
        mood: 5,
        stress: 8,
        focus: 5,
        confidence: 5,
        discipline: 8,
        notes: `[LOSS LOCK REFLECTION] ${reflection}`,
      });
      await supabase.from("notifications").insert({
        user_id: uid,
        kind: "rule_breach",
        title: dailyLocked ? "Daily loss lock reflected" : "Weekly loss lock reflected",
        body: reflection.slice(0, 240),
      });
      toast.success("Reflection saved. Trade wisely.");
      setUnlocked(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save reflection");
    }
  };

  const handleFiles = (files: FileList | null, kind: string) => {
    if (!files) return;
    const next = Array.from(files).map((f) => ({ file: f, kind, preview: URL.createObjectURL(f) }));
    setScreenshots((s) => [...s, ...next]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const foundationActive = await isFoundationMigrationActive();
      if (!foundationActive) throw new Error("Database financial migrations are required before recording trades.");
      if (isBinary && !(await isPhase2Active())) throw new Error("Binary contracts require the Phase 2 database migration. Standard journaling remains available.");
      if (foundationActive && !activeManual) throw new Error("Publish your Trading Operating Manual before logging a new trade.");

      const enteredAt = new Date(form.entered_at);
      const exitedAt = form.exited_at ? new Date(form.exited_at) : null;
      const expiresAt = isBinary ? new Date(form.expires_at) : null;
      if (isBinary && (!expiresAt || !Number.isFinite(+expiresAt) || +expiresAt <= +enteredAt)) {
        throw new Error("Binary option expiry must be later than entry time.");
      }
      const binaryPnl = isBinary ? binaryNetPnl({
        stake: Number(form.stake), payoutPercent: Number(form.payout_percent),
        fees: Number(form.fees || 0), settlement: form.binary_outcome,
        refundAmount: form.refund_amount ? Number(form.refund_amount) : undefined,
      }) : null;
      const pnl = binaryPnl ?? (Number(form.pnl || 0) - Number(form.fees || 0));
      const result: TradeInsert["result"] = isBinary && form.binary_outcome === "pending"
        ? "open" : form.result === "open" && !isBinary
          ? "open" : pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
      if (result === "open" && pnl !== 0) throw new Error("Open trades cannot have realized P&L.");
      const actualExit = isBinary
        ? (form.binary_outcome === "pending" ? null : expiresAt) : exitedAt;
      const duration = isBinary && expiresAt ? Math.round((+expiresAt - +enteredAt) / 1000)
        : actualExit ? Math.round((+actualExit - +enteredAt) / 1000) : null;

      const insertData: TradeInsert = {
        user_id: userId,
        account_id: form.account_id,
        contract_type: form.contract_type,
        ...(isBinary ? {
          binary_outcome: form.binary_outcome,
          payout_percent: Number(form.payout_percent),
          expires_at: expiresAt!.toISOString(),
          refund_amount: form.refund_amount ? Number(form.refund_amount) : null,
        } : {}),
        strategy_id: form.strategy_id || null,
        // Pin the effective manual for future audits; historical imports may remain unpinned.
        tom_version_id: activeManual?.id ?? null,
        asset: form.asset.trim().toUpperCase(),
        setup: form.setup || null,
        direction: form.direction,
        session: sessionFromDate(enteredAt),
        entered_at: enteredAt.toISOString(),
        exited_at: actualExit?.toISOString() ?? null,
        entry_price: num(form.entry_price),
        exit_price: num(form.exit_price),
        stop_loss: num(form.stop_loss),
        take_profit: num(form.take_profit),
        position_size: num(form.position_size),
        stake: num(form.stake),
        risk_pct: num(form.risk_pct),
        planned_rr: num(form.planned_rr),
        realized_rr: num(form.realized_rr),
        pnl,
        fees: Number(form.fees || 0),
        result,
        duration_seconds: duration,
        confidence: form.confidence,
        setup_quality: form.setup_quality,
        checklist_completed: form.checklist_completed,
        followed_plan: form.followed_plan,
        pre_notes: form.pre_notes || null,
        post_notes: form.post_notes || null,
        reason_entry: form.reason_entry || null,
        reason_exit: form.reason_exit || null,
        lessons: form.lessons || null,
        tags: form.tags ? form.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };

      const { data: trade, error } = await supabase.from("trades").insert(insertData).select().single();
      if (error) throw error;

      // guardrail adherence log — one row per evaluated guardrail
      if (evaluated.length) {
        await supabase.from("guardrail_checks").insert(
          evaluated.map((e) => ({
            user_id: userId,
            intervention_id: e.iv.id,
            trade_id: trade.id,
            triggered: e.triggered,
            outcome: (!e.triggered
              ? "not_triggered"
              : acked.includes(e.iv.id)
                ? "respected"
                : "overridden") as "respected" | "overridden" | "not_triggered",
            note: overrides[e.iv.id]?.trim() || null,
            context: { reason: e.reason, loss_streak: lossStreak, trades_today: tradesToday, stress: form.p_stress } as never,
          })),
        );
      }

      // upload screenshots
      for (const s of screenshots) {
        const path = `${userId}/${trade.id}/${Date.now()}-${s.file.name}`;
        const up = await supabase.storage.from("trade-screenshots").upload(path, s.file);
        if (up.error) throw up.error;
        await supabase.from("trade_screenshots").insert({ trade_id: trade.id, user_id: userId, storage_path: path, kind: s.kind });
      }

      // mistakes
      if (selectedMistakes.length) {
        await supabase.from("trade_mistakes").insert(
          selectedMistakes.map((code) => ({ trade_id: trade.id, user_id: userId, mistake_code: code })),
        );
      }

      // pre-trade psychology snapshot
      await supabase.from("psychology_checkins").insert({
        user_id: userId,
        trade_id: trade.id,
        phase: "pre",
        mood: form.p_mood,
        stress: form.p_stress,
        focus: form.p_focus,
        confidence: form.p_confidence,
      });

      // decision quality score (process, independent of P&L)
      const dq = [form.d_plan_adherence, form.d_entry_quality, form.d_risk_control, form.d_patience, form.d_exit_quality];
      await supabase.from("decision_scores").upsert(
        {
          user_id: userId,
          trade_id: trade.id,
          plan_adherence: form.d_plan_adherence,
          entry_quality: form.d_entry_quality,
          risk_control: form.d_risk_control,
          patience: form.d_patience,
          exit_quality: form.d_exit_quality,
          process_score: Math.round((dq.reduce((s, v) => s + v, 0) / dq.length) * 20),
          source: "manual",
        },
        { onConflict: "trade_id" },
      );

      toast.success("Trade logged — intelligence refresh queued");
      navigate({ to: "/trades" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save trade");
    } finally {
      setSaving(false);
    }
  };

  return (
    isLocked ? (
      <div className="p-8 max-w-2xl mx-auto space-y-4">
        <Card className="glow-card border-2 border-loss/60 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-loss mt-0.5" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {dailyLocked ? "Daily loss lock triggered" : "Weekly loss lock triggered"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                You breached your {dailyLocked ? "daily" : "weekly"} loss limit on <b>{selectedAcct?.name}</b>. New entries are blocked until you complete a written reflection (min 40 characters).
              </p>
            </div>
          </div>
          <div>
            <Label>Reflection: what went wrong, what you'll change</Label>
            <Textarea value={reflection} onChange={(e) => setReflection(e.target.value)} className="mt-2 min-h-32" placeholder="Be specific. Emotions, rule breaks, setup quality, position sizing…" />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={submitReflection}>Save reflection & unlock</Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Back to dashboard</Button>
          </div>
        </Card>
      </div>
    ) : (
    <form onSubmit={submit} className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Log a trade</h1>
        <p className="text-sm text-muted-foreground mt-1">Discipline is measured trade by trade. Fill it honestly.</p>
      </div>

      {fired.length > 0 && (
        <Card className={`p-6 space-y-4 border-2 ${guardrailBlocked ? "border-loss/60" : "border-primary/40"}`}>
          <div className="flex items-center gap-2">
            {guardrailBlocked ? <ShieldAlert className="h-5 w-5 text-loss" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
            <h2 className="font-semibold">{fired.length} guardrail{fired.length > 1 ? "s" : ""} triggered</h2>
          </div>
          {fired.map((e) => (
            <div key={e.iv.id} className="border border-border/50 rounded-lg p-4 space-y-2">
              <div className="font-medium text-sm">{e.iv.title}</div>
              <p className="text-sm">{e.iv.action}</p>
              <div className="text-[11px] text-muted-foreground">{e.reason}{e.iv.evidence ? ` · ${e.iv.evidence}` : ""}</div>
              <div className="flex items-center justify-between p-2 border border-border rounded-md">
                <Label className="text-sm">I am following this guardrail</Label>
                <Switch
                  checked={acked.includes(e.iv.id)}
                  onCheckedChange={(v) => setAcked((a) => (v ? [...a, e.iv.id] : a.filter((x) => x !== e.iv.id)))}
                />
              </div>
              {!acked.includes(e.iv.id) && (
                <div>
                  <Label className="text-xs">
                    Override reason {e.iv.hard_block ? "(required, min 20 characters)" : "(optional)"}
                  </Label>
                  <Textarea
                    value={overrides[e.iv.id] ?? ""}
                    onChange={(ev) => setOverrides((o) => ({ ...o, [e.iv.id]: ev.target.value }))}
                    className="mt-1 min-h-16"
                    placeholder="Why are you breaking your own rule?"
                  />
                </div>
              )}
            </div>
          ))}
          {guardrailBlocked && (
            <p className="text-xs text-loss">Accept the guardrail or write an override reason before logging this trade.</p>
          )}
        </Card>
      )}

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Setup</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Account</Label>
            <Select value={form.account_id} onValueChange={(v) => update("account_id", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Asset *</Label>
            <Input required value={form.asset} onChange={(e) => update("asset", e.target.value)} placeholder="EURUSD, BTCUSD, SPY…" className="mt-1" />
          </div>
          <div>
            <Label>Setup</Label>
            <Input value={form.setup} onChange={(e) => update("setup", e.target.value)} placeholder="Breakout, reversal…" className="mt-1" />
          </div>
          <div>
            <Label>Strategy</Label>
            <Select value={form.strategy_id} onValueChange={(v) => update("strategy_id", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {strategies.length === 0 && <SelectItem value="_empty" disabled>No strategies yet</SelectItem>}
                {strategies.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={form.direction} onValueChange={(v) => update("direction", v as "long" | "short")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tags</Label>
            <Input value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="a+, news, gap-fill" className="mt-1" />
          </div>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Contract</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Product type</Label><Select value={form.contract_type} onValueChange={(v) => update("contract_type", v as "spot" | "binary")}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="spot">Standard trade</SelectItem><SelectItem value="binary">Binary option</SelectItem></SelectContent>
          </Select></div>
          {isBinary && <>
            <div><Label>Expiry *</Label><Input required type="datetime-local" value={form.expires_at} onChange={e => update("expires_at", e.target.value)} className="mt-1" /></div>
            <div><Label>Payout on win (%) *</Label><Input required type="number" min="0" max="500" step="0.001" value={form.payout_percent} onChange={e => update("payout_percent", e.target.value)} className="mt-1" /></div>
            <div><Label>Contract outcome</Label><Select value={form.binary_outcome} onValueChange={v => update("binary_outcome", v as BinarySettlement)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="win">Win</SelectItem><SelectItem value="loss">Loss</SelectItem><SelectItem value="push">Tie / push</SelectItem><SelectItem value="void">Void / cancelled</SelectItem></SelectContent>
            </Select></div>
            {(form.binary_outcome === "push" || form.binary_outcome === "void") && <div><Label>Stake refunded (blank = full stake)</Label><Input type="number" min="0" step="0.01" value={form.refund_amount} onChange={e => update("refund_amount", e.target.value)} className="mt-1" /></div>}
          </>}
        </div>
        {isBinary && <p className="text-sm text-muted-foreground">
          Computed net P&amp;L: <strong>{binaryPreview == null ? "Enter valid stake and payout" : binaryPreview.toFixed(2)}</strong>.
          {Number(form.payout_percent) > 0 && <> No-fee break-even win rate: {binaryBreakevenWinRate(Number(form.payout_percent)).toFixed(2)}%.</>}
          {" "}The database independently calculates final settlement; stake is risk capital, not revenue.
        </p>}
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Execution</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>Entered at *</Label>
            <Input required type="datetime-local" value={form.entered_at} onChange={(e) => update("entered_at", e.target.value)} className="mt-1" />
          </div>
          {!isBinary && <div>
            <Label>Exited at</Label>
            <Input type="datetime-local" value={form.exited_at} onChange={(e) => update("exited_at", e.target.value)} className="mt-1" />
          </div>}
          <div>
            <Label>Entry</Label>
            <Input type="number" step="any" value={form.entry_price} onChange={(e) => update("entry_price", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Exit</Label>
            <Input type="number" step="any" value={form.exit_price} onChange={(e) => update("exit_price", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Stop loss</Label>
            <Input type="number" step="any" value={form.stop_loss} onChange={(e) => update("stop_loss", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Take profit</Label>
            <Input type="number" step="any" value={form.take_profit} onChange={(e) => update("take_profit", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Size</Label>
            <Input type="number" step="any" value={form.position_size} onChange={(e) => update("position_size", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Stake $</Label>
            <Input type="number" step="any" value={form.stake} onChange={(e) => update("stake", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Risk %</Label>
            <Input type="number" step="0.01" value={form.risk_pct} onChange={(e) => update("risk_pct", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Planned R:R</Label>
            <Input type="number" step="0.1" value={form.planned_rr} onChange={(e) => update("planned_rr", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Realized R:R</Label>
            <Input type="number" step="0.1" value={form.realized_rr} onChange={(e) => update("realized_rr", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Fees</Label>
            <Input type="number" step="0.01" value={form.fees} onChange={(e) => update("fees", e.target.value)} className="mt-1" />
          </div>
          {!isBinary && <div>
            <Label>P&L (gross) *</Label>
            <Input required type="number" step="0.01" value={form.pnl} onChange={(e) => update("pnl", e.target.value)} className="mt-1" placeholder="e.g. 125 or -80" />
          </div>}
          {!isBinary && <div>
            <Label>Result</Label>
            <Select value={form.result} onValueChange={(v) => update("result", v as typeof form.result)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="win">Win</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="breakeven">Breakeven</SelectItem>
                <SelectItem value="open">Still open</SelectItem>
              </SelectContent>
            </Select>
          </div>}
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Discipline & Quality</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScoreInput label="Confidence (1–10)" value={form.confidence} onChange={(v) => update("confidence", v)} />
          <ScoreInput label="Setup quality (1–10)" value={form.setup_quality} onChange={(v) => update("setup_quality", v)} />
          <div className="flex items-center justify-between p-3 border border-border rounded-md">
            <Label className="text-sm">Followed plan</Label>
            <Switch checked={form.followed_plan} onCheckedChange={(v) => update("followed_plan", v)} />
          </div>
          <div className="flex items-center justify-between p-3 border border-border rounded-md">
            <Label className="text-sm">Checklist completed</Label>
            <Switch checked={form.checklist_completed} onCheckedChange={(v) => update("checklist_completed", v)} />
          </div>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Pre-trade psychology</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ScoreInput label="Mood" value={form.p_mood} onChange={(v) => update("p_mood", v)} />
          <ScoreInput label="Stress" value={form.p_stress} onChange={(v) => update("p_stress", v)} />
          <ScoreInput label="Focus" value={form.p_focus} onChange={(v) => update("p_focus", v)} />
          <ScoreInput label="Confidence" value={form.p_confidence} onChange={(v) => update("p_confidence", v)} />
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Decision quality (process, not P&amp;L)</h2>
        <p className="text-xs text-muted-foreground -mt-2">Rate the decision 1–5 regardless of the outcome. This feeds the Process Score.</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <ScoreInput label="Plan adherence" max={5} value={form.d_plan_adherence} onChange={(v) => update("d_plan_adherence", v)} />
          <ScoreInput label="Entry quality" max={5} value={form.d_entry_quality} onChange={(v) => update("d_entry_quality", v)} />
          <ScoreInput label="Risk control" max={5} value={form.d_risk_control} onChange={(v) => update("d_risk_control", v)} />
          <ScoreInput label="Patience" max={5} value={form.d_patience} onChange={(v) => update("d_patience", v)} />
          <ScoreInput label="Exit quality" max={5} value={form.d_exit_quality} onChange={(v) => update("d_exit_quality", v)} />
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Notes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Reason for entry</Label>
            <Textarea value={form.reason_entry} onChange={(e) => update("reason_entry", e.target.value)} className="mt-1 min-h-20" />
          </div>
          <div>
            <Label>Reason for exit</Label>
            <Textarea value={form.reason_exit} onChange={(e) => update("reason_exit", e.target.value)} className="mt-1 min-h-20" />
          </div>
          <div>
            <Label>Pre-trade notes</Label>
            <Textarea value={form.pre_notes} onChange={(e) => update("pre_notes", e.target.value)} className="mt-1 min-h-20" />
          </div>
          <div>
            <Label>Post-trade notes & lessons</Label>
            <Textarea value={form.lessons} onChange={(e) => update("lessons", e.target.value)} className="mt-1 min-h-20" />
          </div>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Mistakes made (if any)</h2>
        <div className="flex flex-wrap gap-2">
          {catalog.map((m) => {
            const on = selectedMistakes.includes(m.code);
            return (
              <button
                key={m.code}
                type="button"
                onClick={() => setSelectedMistakes((s) => on ? s.filter((x) => x !== m.code) : [...s, m.code])}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${on ? "bg-loss-soft text-loss border-loss/40" : "border-border text-muted-foreground hover:border-border/80"}`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Screenshots</h2>
        <div className="flex flex-wrap gap-3">
          {(["before", "after", "annotated"] as const).map((kind) => (
            <label key={kind} className="border border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/40 flex items-center gap-2">
              <UploadIcon className="h-4 w-4" />
              <span className="text-sm capitalize">{kind}</span>
              <input type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files, kind)} />
            </label>
          ))}
        </div>
        {screenshots.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {screenshots.map((s, i) => (
              <div key={i} className="relative rounded-md overflow-hidden border border-border">
                <img src={s.preview} alt="" className="w-full h-24 object-cover" />
                <div className="absolute top-1 left-1 text-[10px] bg-background/80 px-1.5 rounded">{s.kind}</div>
                <button
                  type="button"
                  onClick={() => setScreenshots((arr) => arr.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 bg-background/80 rounded p-0.5"
                ><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-4">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/trades" })}>Cancel</Button>
        <Button type="submit" disabled={saving || guardrailBlocked} className="min-w-32">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save trade
        </Button>
      </div>
    </form>
    )
  );
}

function num(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ScoreInput({ label, value, onChange, max = 10 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="number-mono text-sm">{value}</span>
      </div>
      <input type="range" min={1} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}