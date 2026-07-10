import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, tradesQuery, profitAllocationsQuery, allocationRulesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { Trash2, Star, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <AccountsPage />
    </Suspense>
  ),
});

const BUCKETS = ["withdraw", "reinvest", "tax", "reserve"] as const;
type Bucket = typeof BUCKETS[number];

function AccountsPage() {
  const qc = useQueryClient();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery());
  const { data: allocations } = useSuspenseQuery(profitAllocationsQuery());
  const { data: rules } = useSuspenseQuery(allocationRulesQuery());
  const { setActive } = useActiveAccountId();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"personal" | "prop_firm" | "funded" | "demo">("personal");
  const [newBalance, setNewBalance] = useState("10000");

  const perAccount = useMemo(() => {
    const m = new Map<string, { pnl: number; allocated: number; byBucket: Record<Bucket, number> }>();
    for (const a of accounts) m.set(a.id, { pnl: 0, allocated: 0, byBucket: { withdraw: 0, reinvest: 0, tax: 0, reserve: 0 } });
    for (const t of trades) {
      const row = m.get(t.account_id);
      if (row && t.result !== "open") row.pnl += Number(t.pnl);
    }
    for (const al of allocations) {
      const row = m.get(al.account_id);
      if (!row) continue;
      row.allocated += Number(al.amount);
      row.byBucket[al.bucket as Bucket] += Number(al.amount);
    }
    return m;
  }, [accounts, trades, allocations]);

  const consolidated = useMemo(() => {
    let bal = 0, pnl = 0, allocated = 0;
    for (const a of accounts) {
      const r = perAccount.get(a.id)!;
      bal += Number(a.starting_balance) + r.pnl - r.allocated;
      pnl += r.pnl;
      allocated += r.allocated;
    }
    return { bal, pnl, allocated };
  }, [accounts, perAccount]);

  const createAccount = async () => {
    if (!newName.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("accounts").insert({
      user_id: u.user!.id, name: newName.trim(), account_type: newType, starting_balance: Number(newBalance), current_balance: Number(newBalance),
    });
    if (error) return toast.error(error.message);
    setNewName(""); setNewBalance("10000");
    toast.success("Account created");
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const setDefault = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", u.user!.id);
    const { error } = await supabase.from("accounts").update({ is_default: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Default set");
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const archive = async (id: string) => {
    if (!confirm("Archive this account? Trades stay but the account is hidden.")) return;
    const { error } = await supabase.from("accounts").update({ is_archived: true }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Multi-Account</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Accounts & Allocation</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage prop firm, personal, funded, and demo accounts. Allocate profits into withdraw / reinvest / tax / reserve buckets.</p>
      </div>

      {/* Consolidated */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glow-card p-6 border-border/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Consolidated Balance</div>
          <div className="mt-2 text-3xl font-bold number-mono">{formatMoney(consolidated.bal)}</div>
          <div className="text-xs text-muted-foreground mt-1">Across {accounts.length} account(s)</div>
        </Card>
        <Card className="glow-card p-6 border-border/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Realized P&L</div>
          <div className={`mt-2 text-3xl font-bold number-mono text-${consolidated.pnl >= 0 ? "profit" : "loss"}`}>{formatMoney(consolidated.pnl, "USD", { sign: true })}</div>
        </Card>
        <Card className="glow-card p-6 border-border/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Allocated</div>
          <div className="mt-2 text-3xl font-bold number-mono">{formatMoney(consolidated.allocated)}</div>
          <div className="text-xs text-muted-foreground mt-1">Withdrawn/moved out of trading balance</div>
        </Card>
      </div>

      {/* New account */}
      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> New account</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="FTMO $100k" className="mt-1" /></div>
          <div>
            <Label>Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as typeof newType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="prop_firm">Prop firm (challenge)</SelectItem>
                <SelectItem value="funded">Funded</SelectItem>
                <SelectItem value="demo">Demo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Starting balance</Label><Input type="number" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} className="mt-1" /></div>
          <div className="flex items-end"><Button onClick={createAccount} className="w-full">Create</Button></div>
        </div>
      </Card>

      {/* Accounts list */}
      <div className="space-y-4">
        {accounts.map((a) => {
          const stats = perAccount.get(a.id)!;
          const balance = Number(a.starting_balance) + stats.pnl - stats.allocated;
          const rule = rules.find((r) => r.account_id === a.id);
          return (
            <Card key={a.id} className="glow-card p-6 border-border/40">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{a.name}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/40 rounded px-1.5 py-0.5">{a.account_type}</span>
                    {a.is_default && <span className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded px-1.5 py-0.5">Default</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Start: {formatMoney(Number(a.starting_balance))} · Realized P&L: <span className={`text-${stats.pnl >= 0 ? "profit" : "loss"}`}>{formatMoney(stats.pnl, "USD", { sign: true })}</span></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Balance</div>
                    <div className="text-2xl font-bold number-mono">{formatMoney(balance)}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setActive(a.id)}>Use</Button>
                    {!a.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)}><Star className="h-3 w-3" /></Button>}
                    <Button size="sm" variant="ghost" onClick={() => archive(a.id)}><Trash2 className="h-3 w-3 text-loss" /></Button>
                  </div>
                </div>
              </div>

              <AllocationPanel account={a} rule={rule} byBucket={stats.byBucket} realized={stats.pnl} allocated={stats.allocated} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AllocationPanel({ account, rule, byBucket, realized, allocated }: {
  account: { id: string };
  rule: { withdraw_pct: number; reinvest_pct: number; tax_pct: number; reserve_pct: number } | undefined;
  byBucket: Record<Bucket, number>;
  realized: number;
  allocated: number;
}) {
  const qc = useQueryClient();
  const [pcts, setPcts] = useState({
    withdraw: String(rule?.withdraw_pct ?? 30),
    reinvest: String(rule?.reinvest_pct ?? 40),
    tax: String(rule?.tax_pct ?? 20),
    reserve: String(rule?.reserve_pct ?? 10),
  });
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState<Bucket>("withdraw");
  const [note, setNote] = useState("");
  const unallocated = Math.max(0, realized - allocated);
  const totalPct = Object.values(pcts).reduce((s, v) => s + Number(v || 0), 0);

  const saveRule = async () => {
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      user_id: u.user!.id, account_id: account.id,
      withdraw_pct: Number(pcts.withdraw), reinvest_pct: Number(pcts.reinvest), tax_pct: Number(pcts.tax), reserve_pct: Number(pcts.reserve),
    };
    const { error } = await supabase.from("allocation_rules").upsert(payload, { onConflict: "account_id" });
    if (error) return toast.error(error.message);
    toast.success("Rule saved");
    qc.invalidateQueries({ queryKey: ["allocation_rules"] });
  };

  const allocate = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profit_allocations").insert({
      user_id: u.user!.id, account_id: account.id, bucket, amount: amt, note: note || null,
    });
    if (error) return toast.error(error.message);
    setAmount(""); setNote("");
    toast.success(`${formatMoney(amt)} → ${bucket}`);
    qc.invalidateQueries({ queryKey: ["profit_allocations"] });
  };

  const autoSplit = async () => {
    if (unallocated <= 0) return toast.error("Nothing to allocate");
    if (Math.abs(totalPct - 100) > 0.5) return toast.error("Rule must sum to 100%");
    const { data: u } = await supabase.auth.getUser();
    const rows = BUCKETS.map((b) => ({
      user_id: u.user!.id, account_id: account.id, bucket: b,
      amount: +(unallocated * (Number(pcts[b]) / 100)).toFixed(2),
      note: "Auto-split from rule",
    })).filter((r) => r.amount > 0);
    const { error } = await supabase.from("profit_allocations").insert(rows);
    if (error) return toast.error(error.message);
    toast.success("Split allocated");
    qc.invalidateQueries({ queryKey: ["profit_allocations"] });
  };

  return (
    <div className="mt-6 pt-6 border-t border-border/40 grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Buckets */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Buckets</div>
        <div className="space-y-2">
          {BUCKETS.map((b) => (
            <div key={b} className="flex items-center justify-between text-sm">
              <span className="capitalize">{b}</span>
              <span className="number-mono">{formatMoney(byBucket[b])}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-border/30">
            <span className="text-muted-foreground">Unallocated profit</span>
            <span className={`number-mono text-${unallocated > 0 ? "profit" : "muted"}`}>{formatMoney(unallocated)}</span>
          </div>
        </div>
      </div>

      {/* Rule */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Split rule (%)</div>
        <div className="grid grid-cols-2 gap-2">
          {BUCKETS.map((b) => (
            <div key={b}>
              <Label className="text-xs capitalize">{b}</Label>
              <Input type="number" value={pcts[b]} onChange={(e) => setPcts({ ...pcts, [b]: e.target.value })} className="mt-1 h-8" />
            </div>
          ))}
        </div>
        <div className={`text-xs mt-2 ${Math.abs(totalPct - 100) < 0.5 ? "text-muted-foreground" : "text-loss"}`}>Total: {totalPct}%</div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={saveRule}>Save rule</Button>
          <Button size="sm" onClick={autoSplit} disabled={unallocated <= 0}>Auto-split unallocated</Button>
        </div>
      </div>

      {/* Manual */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Manual allocation</div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Bucket</Label>
            <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
              <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUCKETS.map((b) => <SelectItem key={b} value={b} className="capitalize">{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-8" />
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-8" />
          </div>
          <Button size="sm" onClick={allocate} className="w-full">Allocate</Button>
        </div>
      </div>
    </div>
  );
}