import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, tradesQuery, profitAllocationsQuery, allocationRulesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { isPhase2Active } from "@/lib/foundation-readiness";
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
type AccountCurrency = { currency: string; currency_confirmed_at: string | null };
function money(value: number, account: AccountCurrency, sign = false) {
  return account.currency_confirmed_at ? formatMoney(value, account.currency, {sign})
    : value.toFixed(2) + " (currency unverified)";
}


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
  const [newCurrency, setNewCurrency] = useState("USD");
  const [auditRows, setAuditRows] = useState<Array<{
    account_id: string; account_name: string; currency: string; currency_confirmed: boolean;
    starting_balance: number; current_balance: number; trade_pnl: number;
    net_cash: number; expected_balance: number; variance: number; status: string;
  }> | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const loadBalanceAudit = async () => {
    setAuditBusy(true);
    try {
      if (!(await isPhase2Active())) throw new Error("Financial migrations not active.");
      const { data, error } = await supabase.rpc("tradeos_account_reconciliation");
      if (error) throw error;
      setAuditRows(data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Balance audit unavailable");
    } finally { setAuditBusy(false); }
  };

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

  // Money cannot be added across currencies without verified FX evidence.
  // Unknown historical currency is displayed separately, never assumed USD.
  const byCurrency = useMemo(() => {
    const grouped = new Map<string,{currency: string; verified: boolean; balance: number; pnl: number; allocated: number; count: number}>();
    for (const a of accounts) {
      const verified=!!a.currency_confirmed_at;
      const key=verified ? a.currency : "UNREVIEWED";
      const row=grouped.get(key) ?? {currency:key,verified,balance:0,pnl:0,allocated:0,count:0};
      const stats=perAccount.get(a.id)!;
      row.balance+=Number(a.current_balance);
      row.pnl+=stats.pnl;
      row.allocated+=stats.allocated;
      row.count++;
      grouped.set(key,row);
    }
    return [...grouped.values()].sort((a,b)=>a.currency.localeCompare(b.currency));
  }, [accounts, perAccount]);

  const createAccount = async () => {
    if (!newName.trim()) return;
    if (!/^[A-Z]{3}$/.test(newCurrency)) return toast.error("Choose a three-letter account currency");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("accounts").insert({
      user_id: u.user!.id, name: newName.trim(), account_type: newType, starting_balance: Number(newBalance), currency: newCurrency,
    });
    if (error) return toast.error(error.message);
    setNewName(""); setNewBalance("10000"); setNewCurrency("USD");
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

      {/* Deliberately grouped; NEVER sum currencies without verified FX. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {byCurrency.map(group => (
          <Card key={group.currency} className="glow-card p-6 border-border/40 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {group.verified ? group.currency + " accounts" : "Unreviewed historical currencies"}
            </div>
            <div className="text-2xl font-bold number-mono">
              {group.verified ? formatMoney(group.balance,group.currency) : group.balance.toFixed(2)+" (units unverified)"}
            </div>
            <div className="text-xs text-muted-foreground">Booked balance · {group.count} account(s)</div>
            <div className="text-xs">Realized P&amp;L: {group.verified ? formatMoney(group.pnl,group.currency,{sign:true}) : group.pnl.toFixed(2)+" (unverified)"}</div>
            <div className="text-xs">Earmarked: {group.verified ? formatMoney(group.allocated,group.currency) : group.allocated.toFixed(2)+" (unverified)"}</div>
          </Card>
        ))}
      </div>
      <Card className="glow-card p-6 border-border/40 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Financial Reconciliation (Read-only)</h2>
            <p className="text-xs text-muted-foreground">Compare booked balances with opening capital + realized trading P&amp;L + recorded deposits − withdrawals. Profit allocations are earmarks, not cash. No historical values are automatically changed.</p>
          </div>
          <Button variant="outline" disabled={auditBusy} onClick={loadBalanceAudit}>{auditBusy ? "Checking…" : "Verify balances"}</Button>
        </div>
        {auditRows && <div className="space-y-2">
          {auditRows.map(row => (
            <div key={row.account_id} className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs border border-border/40 rounded p-3">
              <span className="font-semibold">{row.account_name} · {row.currency_confirmed ? row.currency : "currency unreviewed"}</span>
              <span>Booked: {row.current_balance} · Expected: {row.expected_balance}</span>
              <span>Realized: {row.trade_pnl} · Net cash: {row.net_cash}</span>
              <span className={row.status === "balanced" ? "text-profit" : "text-loss"}>
                {row.status} · Variance: {row.variance}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Review any variance and unconfirmed historical currencies against external statements before a supervised correction. This audit never writes balances.</p>
        </div>}
      </Card>

      {/* New account */}
      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> New account</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
          <div><Label>Currency (ISO 4217)</Label><Input maxLength={3} value={newCurrency} onChange={e=>setNewCurrency(e.target.value.toUpperCase())} className="mt-1" /></div>
          <div className="flex items-end"><Button onClick={createAccount} className="w-full">Create</Button></div>
        </div>
      </Card>

      {/* Accounts list */}
      <div className="space-y-4">
        {accounts.map((a) => {
          const stats = perAccount.get(a.id)!;
          const balance = Number(a.current_balance);
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
                  <div className="text-xs text-muted-foreground mt-1">Start: {money(Number(a.starting_balance),a)} · Realized P&amp;L: <span className={`text-${stats.pnl >= 0 ? "profit" : "loss"}`}>{money(stats.pnl,a,true)}</span></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Balance</div>
                    <div className="text-2xl font-bold number-mono">{money(balance,a)}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setActive(a.id)}>Use</Button>
                    {!a.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)}><Star className="h-3 w-3" /></Button>}
                    <Button size="sm" variant="ghost" onClick={() => archive(a.id)}><Trash2 className="h-3 w-3 text-loss" /></Button>
                  </div>
                </div>
              </div>

              <CashMovementPanel account={a} onRecorded={() => { qc.invalidateQueries({queryKey:["accounts"]}); setAuditRows(null); }} />
              <AllocationPanel account={a} rule={rule} byBucket={stats.byBucket} realized={stats.pnl} allocated={stats.allocated} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CashMovementPanel({ account, onRecorded }: {
  account: {id: string} & AccountCurrency; onRecorded: () => void;
}) {
  const [kind,setKind] = useState<"deposit"|"withdrawal">("deposit");
  const [amount,setAmount] = useState("");
  const [reference,setReference] = useState("");
  const [currency,setCurrency] = useState(account.currency);
  const [busy,setBusy] = useState(false);
  const qc = useQueryClient();
  const confirmed=!!account.currency_confirmed_at;
  const submit = async () => {
    const amountNumber=Number(amount);
    if (!confirmed || !Number.isFinite(amountNumber) || amountNumber<=0 ||
        Math.round(amountNumber*100)!==amountNumber*100) {
      toast.error("Confirm the currency and enter a positive, cent-exact amount");
      return;
    }
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("tradeos_record_cash_movement",{
        p_account:account.id,p_kind:kind,p_amount:amountNumber,
        p_idempotency_key:crypto.randomUUID(),p_reference:reference.trim()||null,
      });
      if(error)throw error;
      toast.success(data?.duplicate ? "Already recorded" : "Cash movement recorded — not bank-verified");
      setAmount("");setReference("");
      onRecorded();
      qc.invalidateQueries({queryKey:["account_cash_movements"]});
    }catch(e){toast.error(e instanceof Error?e.message:"Unable to record cash movement")}
    finally{setBusy(false)}
  };
  const confirmCurrency = async () => {
    const wanted=currency.toUpperCase();
    if(!/^[A-Z]{3}$/.test(wanted))return toast.error("Three-letter uppercase currency required");
    const {error}=await supabase.rpc("tradeos_confirm_account_currency",{
      p_account:account.id,p_currency:wanted,
    });
    if(error)return toast.error(error.message);
    onRecorded();
    toast.success("Account currency confirmed");
  };
  return (
    <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">Cash journal · {confirmed ? account.currency : "currency review required"}</div>
      {!confirmed && <div className="space-y-2 text-xs text-amber-600">
        Historical currency is unconfirmed. Accounts with existing trades need supervised reconciliation.
        <div className="flex gap-2 items-center">
          <Input aria-label="Confirm account currency" maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} className="max-w-24 h-8"/>
          <Button type="button" size="sm" variant="outline" onClick={confirmCurrency}>Confirm unused account</Button>
        </div>
      </div>}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Select value={kind} onValueChange={v=>setKind(v as "deposit"|"withdrawal")}>
          <SelectTrigger aria-label="Cash movement type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="withdrawal">Withdrawal</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" min="0.01" step="0.01" aria-label="Cash movement amount" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)}/>
        <Input aria-label="Cash movement reference" placeholder="Optional reference" maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/>
        <Button type="button" disabled={!confirmed||busy} onClick={submit}>{busy?"Recording…":"Record cash movement"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Manual record only; does not verify an external bank or broker transfer. Profit earmarks below do not change booked cash.</p>
    </div>
  );
}

function AllocationPanel({ account, rule, byBucket, realized, allocated }: {
  account: { id: string } & AccountCurrency;
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
    toast.success(`${money(amt,account)} earmarked for ${bucket}`);
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
              <span className="number-mono">{money(byBucket[b],account)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-border/30">
            <span className="text-muted-foreground">Unallocated profit</span>
            <span className={`number-mono text-${unallocated > 0 ? "profit" : "muted"}`}>{money(unallocated,account)}</span>
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