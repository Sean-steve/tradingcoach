import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, rulesQuery, strategiesQuery } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <SettingsPage />
    </Suspense>
  ),
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: strategies } = useSuspenseQuery(strategiesQuery());
  const { data: rules } = useSuspenseQuery(rulesQuery());

  const acct = accounts[0];
  const [balance, setBalance] = useState(String(acct?.starting_balance ?? 10000));
  const [maxDaily, setMaxDaily] = useState(String(acct?.max_daily_loss ?? ""));
  const [maxRisk, setMaxRisk] = useState(String(acct?.max_risk_pct ?? "1"));

  const [newStrategy, setNewStrategy] = useState("");
  const [newRule, setNewRule] = useState("");

  const saveAccount = async () => {
    const { error } = await supabase.from("accounts").update({
      starting_balance: Number(balance),
      max_daily_loss: maxDaily ? Number(maxDaily) : null,
      max_risk_pct: Number(maxRisk),
    }).eq("id", acct.id);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["accounts"] }); }
  };

  const addStrategy = async () => {
    if (!newStrategy.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("strategies").insert({ user_id: u.user!.id, name: newStrategy.trim() });
    if (error) toast.error(error.message);
    else { setNewStrategy(""); qc.invalidateQueries({ queryKey: ["strategies"] }); }
  };

  const addRule = async () => {
    if (!newRule.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("rules").insert({ user_id: u.user!.id, title: newRule.trim() });
    if (error) toast.error(error.message);
    else { setNewRule(""); qc.invalidateQueries({ queryKey: ["rules"] }); }
  };

  const del = async (table: "strategies" | "rules", id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: [table] });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold">Account & Risk</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Starting balance</Label><Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} className="mt-1" /></div>
          <div><Label>Max daily loss $</Label><Input type="number" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)} className="mt-1" /></div>
          <div><Label>Max risk % / trade</Label><Input type="number" step="0.1" value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)} className="mt-1" /></div>
        </div>
        <Button onClick={saveAccount}>Save</Button>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold">Strategies</h2>
        <div className="flex gap-2">
          <Input value={newStrategy} onChange={(e) => setNewStrategy(e.target.value)} placeholder="e.g. NY Open Reversal" />
          <Button onClick={addStrategy}>Add</Button>
        </div>
        <ul className="space-y-1">
          {strategies.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 border-b border-border/30">
              <span>{s.name}</span>
              <button onClick={() => del("strategies", s.id)} className="text-muted-foreground hover:text-loss"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold">Trading plan rules</h2>
        <div className="flex gap-2">
          <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="e.g. Only trade London session" />
          <Button onClick={addRule}>Add</Button>
        </div>
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 border-b border-border/30">
              <span>{r.title}</span>
              <button onClick={() => del("rules", r.id)} className="text-muted-foreground hover:text-loss"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}