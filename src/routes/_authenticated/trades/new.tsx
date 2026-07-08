import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, strategiesQuery, mistakeCatalogQuery } from "@/lib/queries";
import { sessionFromDate } from "@/lib/metrics";
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
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: strategies } = useSuspenseQuery(strategiesQuery());
  const { data: catalog } = useSuspenseQuery(mistakeCatalogQuery());

  const [saving, setSaving] = useState(false);
  const [screenshots, setScreenshots] = useState<{ file: File; kind: string; preview: string }[]>([]);
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [form, setForm] = useState({
    account_id: accounts[0]?.id ?? "",
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
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

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

      const enteredAt = new Date(form.entered_at);
      const exitedAt = form.exited_at ? new Date(form.exited_at) : null;
      const duration = exitedAt ? Math.round((+exitedAt - +enteredAt) / 1000) : null;
      const pnl = Number(form.pnl || 0) - Number(form.fees || 0);
      const result: TradeInsert["result"] = form.result === "open" ? "open" : pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";

      const insertData: TradeInsert = {
        user_id: userId,
        account_id: form.account_id,
        strategy_id: form.strategy_id || null,
        asset: form.asset.trim().toUpperCase(),
        setup: form.setup || null,
        direction: form.direction,
        session: sessionFromDate(enteredAt),
        entered_at: enteredAt.toISOString(),
        exited_at: exitedAt?.toISOString() ?? null,
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

      // update account balance
      const acct = accounts.find((a) => a.id === form.account_id);
      if (acct) {
        await supabase.from("accounts").update({ current_balance: Number(acct.current_balance) + pnl }).eq("id", acct.id);
      }

      toast.success("Trade logged");
      navigate({ to: "/trades" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save trade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Log a trade</h1>
        <p className="text-sm text-muted-foreground mt-1">Discipline is measured trade by trade. Fill it honestly.</p>
      </div>

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
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Execution</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>Entered at *</Label>
            <Input required type="datetime-local" value={form.entered_at} onChange={(e) => update("entered_at", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Exited at</Label>
            <Input type="datetime-local" value={form.exited_at} onChange={(e) => update("exited_at", e.target.value)} className="mt-1" />
          </div>
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
          <div>
            <Label>P&L (gross) *</Label>
            <Input required type="number" step="0.01" value={form.pnl} onChange={(e) => update("pnl", e.target.value)} className="mt-1" placeholder="e.g. 125 or -80" />
          </div>
          <div>
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
          </div>
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
        <Button type="submit" disabled={saving} className="min-w-32">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save trade
        </Button>
      </div>
    </form>
  );
}

function num(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="number-mono text-sm">{value}</span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}