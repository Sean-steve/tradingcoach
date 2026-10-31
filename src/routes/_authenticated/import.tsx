import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isPhase2Active } from "@/lib/foundation-readiness";
import { normalizeCsvRows } from "@/lib/csv-import";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
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
  const { activeId } = useActiveAccountId();
  const [accountId, setAccountId] = useState(activeId ?? accounts[0]?.id ?? "");
  useEffect(() => {
    if (activeId && accounts.some(a => a.id === activeId)) setAccountId(activeId);
  }, [activeId, accounts]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<"generic" | "mt4" | "mt5">("generic");
  const [contractType, setContractType] = useState<"spot" | "binary">("spot");
  const [importFeedback, setImportFeedback] = useState("");

  const applyPreset = (p: "generic" | "mt4" | "mt5") => {
    setPreset(p);
    if (!headers.length) return;
    const find = (aliases: string[]) => {
      const lower = headers.map((h) => h.toLowerCase());
      for (const a of aliases) {
        const idx = lower.findIndex((x) => x === a.toLowerCase() || x.includes(a.toLowerCase()));
        if (idx >= 0) return headers[idx];
      }
      return "";
    };
    if (p === "mt4") {
      setMapping({
        asset: find(["Symbol"]),
        entered_at: find(["Open Time", "OpenTime"]),
        exited_at: find(["Close Time", "CloseTime"]),
        direction: find(["Type"]),
        entry_price: find(["Open Price", "Price"]),
        exit_price: find(["Close Price"]),
        stop_loss: find(["S / L", "S/L", "SL"]),
        take_profit: find(["T / P", "T/P", "TP"]),
        position_size: find(["Size", "Lots"]),
        pnl: find(["Profit"]),
        fees: find(["Commission", "Swap"]),
      });
    } else if (p === "mt5") {
      setMapping({
        asset: find(["Symbol"]),
        entered_at: find(["Time", "Open Time"]),
        exited_at: find(["Close Time"]),
        direction: find(["Type", "Direction"]),
        entry_price: find(["Price"]),
        exit_price: find(["Price.1", "Close"]),
        stop_loss: find(["S / L", "SL"]),
        take_profit: find(["T / P", "TP"]),
        position_size: find(["Volume"]),
        pnl: find(["Profit"]),
        fees: find(["Commission", "Fee", "Swap"]),
      });
    }
  };

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
    { key: "source_key", label: "Broker ticket / trade ID (recommended)" },
    { key: "expires_at", label: "Binary expiry" },
    { key: "binary_outcome", label: "Binary outcome" },
    { key: "payout_percent", label: "Binary payout %" },
    { key: "refund_amount", label: "Binary refund amount" },
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
        auto.source_key = find("ticket", "order id", "trade id", "deal", "transaction id");
        auto.expires_at = find("expiry", "expiration");
        auto.binary_outcome = find("outcome", "status");
        auto.payout_percent = find("payout rate", "payout percent", "payout %");
        auto.refund_amount = find("refund amount", "refund");
        setMapping(auto);
      },
      error: (err) => toast.error(err.message),
    });
  };

  const runImport = async () => {
    if (!accountId) { toast.error("Pick an account"); return; }
    const required = contractType === "binary"
      ? ["asset","entered_at","expires_at","stake","payout_percent","binary_outcome"]
      : ["asset","entered_at","pnl"];
    for (const field of required) {
      if (!mapping[field]) { toast.error("Map required column: " + field); return; }
    }
    setBusy(true);
    setImportFeedback("");
    let committed = 0;
    let duplicates = 0;
    try {
      if (!(await isPhase2Active())) {
        throw new Error("Apply Phase 2 database migration before using protected imports");
      }
      // Normalization validates each input before ANY database write.
      const normalized = await normalizeCsvRows(rows, mapping, contractType);
      // Every call is atomic. A partially completed multi-batch import is
      // safely resumable using deterministic source_key collision detection.
      for (let i = 0; i < normalized.length; i += 500) {
        const { data, error } = await supabase.rpc("tradeos_import_trades", {
          p_account: accountId,
          p_rows: normalized.slice(i,i+500) as never,
        });
        if (error) throw error;
        committed += Number(data?.inserted ?? 0);
        duplicates += Number(data?.skipped_duplicates ?? 0);
      }
      setImportFeedback("Imported " + committed + " unique trades; skipped " + duplicates + " duplicates.");
      toast.success("Imported " + committed + " trades; " + duplicates + " duplicates skipped");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Import failed";
      setImportFeedback(reason + ". " + committed + " earlier rows committed; retry is safe.");
      toast.error(reason);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <Label>Product type</Label>
            <Select value={contractType} onValueChange={(v) => setContractType(v as "spot" | "binary")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="spot">Standard trade</SelectItem><SelectItem value="binary">Binary options</SelectItem></SelectContent>
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">{rows.length} rows detected. Map columns:</div>
              <div className="flex gap-1">
                {(["generic", "mt4", "mt5"] as const).map((p) => (
                  <Button key={p} type="button" size="sm" variant={preset === p ? "default" : "outline"} onClick={() => applyPreset(p)} className="text-xs h-7 uppercase">{p}</Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIELDS.filter((f) => contractType === "binary" || !["expires_at", "binary_outcome", "payout_percent", "refund_amount"].includes(f.key as string)).map((f) => (
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
            <p className="text-xs text-muted-foreground">Each batch is an atomic database transaction. Broker ticket IDs prevent accidental duplicate imports; if no ticket exists, identical normalized rows are treated as duplicates. CSV times without timezone offsets use your browser timezone.</p>
            {importFeedback && <p role="status" className="text-sm text-muted-foreground">{importFeedback}</p>}
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