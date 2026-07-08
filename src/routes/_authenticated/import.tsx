import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery } from "@/lib/queries";
import { sessionFromDate } from "@/lib/metrics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload as UploadIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/import")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <ImportPage />
    </Suspense>
  ),
});

type TradeInsert = Database["public"]["Tables"]["trades"]["Insert"];

function ImportPage() {
  const navigate = useNavigate();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const FIELDS: { key: keyof TradeInsert; label: string; required?: boolean }[] = [
    { key: "asset", label: "Asset / Symbol", required: true },
    { key: "entered_at", label: "Entry time", required: true },
    { key: "exited_at", label: "Exit time" },
    { key: "direction", label: "Direction (long/short/buy/sell)" },
    { key: "entry_price", label: "Entry price" },
    { key: "exit_price", label: "Exit price" },
    { key: "stop_loss", label: "Stop loss" },
    { key: "take_profit", label: "Take profit" },
    { key: "position_size", label: "Size / Volume" },
    { key: "stake", label: "Stake / Notional" },
    { key: "pnl", label: "P&L / Profit", required: true },
    { key: "fees", label: "Fees / Commission" },
  ];

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { toast.error("Empty file"); return; }
        setRows(res.data);
        const h = Object.keys(res.data[0]);
        setHeaders(h);
        // heuristic auto-mapping
        const auto: Record<string, string> = {};
        const lower = h.map((x) => x.toLowerCase());
        const find = (...aliases: string[]) => {
          for (const a of aliases) { const idx = lower.findIndex((x) => x.includes(a)); if (idx >= 0) return h[idx]; }
          return "";
        };
        auto.asset = find("symbol", "asset", "instrument", "ticker");
        auto.entered_at = find("open time", "open_time", "opentime", "entry time", "entry_time", "date");
        auto.exited_at = find("close time", "close_time", "closetime", "exit time", "exit_time");
        auto.direction = find("type", "direction", "side");
        auto.entry_price = find("open price", "openprice", "open_price", "entry price", "entry_price");
        auto.exit_price = find("close price", "closeprice", "close_price", "exit price", "exit_price");
        auto.stop_loss = find("s/l", "stop", "sl");
        auto.take_profit = find("t/p", "tp", "target");
        auto.position_size = find("volume", "size", "lots", "qty");
        auto.pnl = find("profit", "pnl", "p&l", "p/l", "net");
        auto.fees = find("commission", "fee", "swap");
        setMapping(auto);
      },
      error: (err) => toast.error(err.message),
    });
  };

  const runImport = async () => {
    if (!accountId) { toast.error("Pick an account"); return; }
    for (const f of FIELDS) if (f.required && !mapping[f.key as string]) { toast.error(`Map "${f.label}"`); return; }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id!;
      const inserts: TradeInsert[] = [];
      for (const row of rows) {
        const val = (k: string) => (mapping[k] ? row[mapping[k]] : "");
        const dirRaw = (val("direction") || "long").toLowerCase();
        const direction: TradeInsert["direction"] = dirRaw.includes("sell") || dirRaw.includes("short") ? "short" : "long";
        const enteredAt = parseDate(val("entered_at"));
        if (!enteredAt) continue;
        const exitedAt = parseDate(val("exited_at"));
        const pnl = Number(val("pnl") || 0) - Number(val("fees") || 0);
        const result: TradeInsert["result"] = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
        inserts.push({
          user_id: userId,
          account_id: accountId,
          asset: (val("asset") || "UNKNOWN").toUpperCase(),
          direction,
          session: sessionFromDate(enteredAt),
          entered_at: enteredAt.toISOString(),
          exited_at: exitedAt?.toISOString() ?? null,
          entry_price: numOrNull(val("entry_price")),
          exit_price: numOrNull(val("exit_price")),
          stop_loss: numOrNull(val("stop_loss")),
          take_profit: numOrNull(val("take_profit")),
          position_size: numOrNull(val("position_size")),
          stake: numOrNull(val("stake")),
          pnl,
          fees: Number(val("fees") || 0),
          result,
          duration_seconds: exitedAt ? Math.round((+exitedAt - +enteredAt) / 1000) : null,
        });
      }
      // chunk inserts
      const CHUNK = 500;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const { error } = await supabase.from("trades").insert(inserts.slice(i, i + CHUNK));
        if (error) throw error;
      }
      // update balance
      const acct = accounts.find((a) => a.id === accountId);
      if (acct) {
        const net = inserts.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
        await supabase.from("accounts").update({ current_balance: Number(acct.current_balance) + net }).eq("id", acct.id);
      }
      toast.success(`Imported ${inserts.length} trades`);
      navigate({ to: "/trades" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CSV Import</h1>
        <p className="text-sm text-muted-foreground mt-1">MT4 / MT5 / generic broker exports. We auto-map common columns; adjust as needed.</p>
      </div>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>File</Label>
            <label className="mt-1 flex items-center gap-2 border border-dashed border-border rounded-md p-4 cursor-pointer hover:border-primary/40">
              <UploadIcon className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">Choose CSV…</span>
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            <div className="text-sm text-muted-foreground">{rows.length} rows detected. Map columns:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key as string} className="flex items-center gap-3">
                  <Label className="w-40 text-sm">
                    {f.label} {f.required && <span className="text-loss">*</span>}
                  </Label>
                  <Select value={mapping[f.key as string] || "__none"} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key as string]: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button onClick={runImport} disabled={busy} className="mt-2">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import {rows.length} trades
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(+d) ? null : d;
}
function numOrNull(s: string) {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}