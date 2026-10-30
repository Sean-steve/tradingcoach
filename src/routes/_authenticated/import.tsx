import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isFoundationMigrationActive } from "@/lib/foundation-readiness";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery } from "@/lib/queries";
import { sessionFromDate } from "@/lib/metrics";
import { isPhase2Active } from "@/lib/phase2-readiness";
import { calculateBinarySettlement, validateBinaryExpiry, type BinarySettlement } from "@/lib/binary-options";
import { importFingerprint, distinctImportKeys } from "@/lib/import-integrity";
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
  const [preset, setPreset] = useState<"generic" | "mt4" | "mt5" | "binary">("generic");
  const [fileName, setFileName] = useState("");
  const [brokerUtcOffsetHours, setBrokerUtcOffsetHours] = useState("0");
  const [summary, setSummary] = useState("");

  const applyPreset = (p: "generic" | "mt4" | "mt5" | "binary") => {
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
    } else if (p === "binary") {
      setMapping({
        asset: find(["symbol", "asset", "underlying"]),
        entered_at: find(["entry time", "open time", "entry_at", "created"]),
        exited_at: find(["expiry", "expiration", "close time"]),
        direction: find(["direction", "call/put", "option"]),
        stake: find(["stake", "investment"]),
        payout_pct: find(["payout percent", "payout rate", "profit %", "payout"]),
        settlement: find(["settlement", "outcome", "result"]),
        fees: find(["fees", "commission"]),
        refund_amount: find(["refund", "rebate"]),
        source_trade_id: find(["trade id", "contract id", "ticket", "order id"]),
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

  const FIELDS: { key: string; label: string; required?: boolean }[] = [
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
    { key: "source_trade_id", label: "Broker trade / contract ID" },
    { key: "payout_pct", label: "Binary payout (% NET profit)" },
    { key: "settlement", label: "Binary settlement (WIN/LOSS/PUSH/VOID)" },
    { key: "refund_amount", label: "Binary partial rebate / refund" },
  ];

  const handleFile = (file: File) => {
    setFileName(file.name);
    setSummary("");
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
        auto.source_trade_id = find("trade id", "ticket", "order id", "contract id");
        auto.payout_pct = find("payout percent", "payout rate", "profit %");
        auto.settlement = find("settlement", "outcome", "result");
        auto.refund_amount = find("refund", "rebate");
        setMapping(auto);
      },
      error: (err) => toast.error(err.message),
    });
  };

  const runImport = async () => {
    if (!accountId) return toast.error("Pick an account");
    if (!rows.length || rows.length > 10000) return toast.error("Import a CSV with 1–10,000 rows");
    const binary = preset === "binary";
    const required = binary ? ["asset","entered_at","exited_at","stake","payout_pct","settlement"] : ["asset","entered_at","pnl"];
    for (const field of required) if (!mapping[field]) return toast.error("Map required column: " + field);
    setBusy(true);
    try {
      const ready = await isPhase2Active();
      if (!ready) throw new Error("Safe, idempotent importing requires Phase 2 database activation. No records were written.");
      const utcOffset = Number(brokerUtcOffsetHours);
      if (!Number.isFinite(utcOffset) || utcOffset < -12 || utcOffset > 14) throw new Error("Invalid broker UTC offset");
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error("Sign in to import");
      const userId = userData.user.id;
      const inserts: TradeInsert[] = [];
      const invalid: string[] = [];
      const source = preset === "binary" ? "binary_csv" : preset === "generic" ? "csv" : preset;
      for (const [i,row] of rows.entries()) {
        try {
          const val = (key: string): string => (mapping[key] ? String(row[mapping[key]] ?? "").trim() : "");
          const enteredAt = parseDate(val("entered_at"), utcOffset);
          if (!enteredAt) throw new Error("Invalid entry date");
          const exitedAt = parseDate(val("exited_at"), utcOffset);
          const dirRaw = (val("direction") || "long").toLowerCase();
          const direction: TradeInsert["direction"] = /^(sell|short|put)/.test(dirRaw) ? "short" : "long";
          const asset = val("asset").toUpperCase();
          if (!asset) throw new Error("Missing asset");
          const parsedFees = Number(val("fees") || 0);
          const fees = preset === "mt4" || preset === "mt5" ? Math.abs(parsedFees) : parsedFees;
          if (!Number.isFinite(fees) || fees < 0) throw new Error("Invalid fees");
          const rawPnl = Number(val("pnl") || 0);
          if (!binary && !Number.isFinite(rawPnl)) throw new Error("Invalid P&L");
          let settlement: BinarySettlement = "open";
          let binaryData: Partial<TradeInsert> = {};
          let finalPnl = rawPnl - fees;
          let result: TradeInsert["result"] = !exitedAt ? "open" : finalPnl > 0 ? "win" : finalPnl < 0 ? "loss" : "breakeven";
          if (binary) {
            if (!exitedAt) throw new Error("Missing binary contract expiry");
            validateBinaryExpiry(enteredAt.toISOString(),exitedAt.toISOString());
            const input = val("settlement").toLowerCase();
            settlement = input === "cancelled" || input === "canceled" ? "void" : input as BinarySettlement;
            if (!["win","loss","push","void","open"].includes(settlement)) throw new Error("Unknown binary settlement");
            const stake = Number(val("stake")), payoutPercent = Number(val("payout_pct"));
            const calc = calculateBinarySettlement({
              stake,payoutPercent,fees,settlement,
              refundAmount: settlement === "loss" && val("refund_amount") ? Number(val("refund_amount")) : undefined,
            });
            finalPnl = calc.pnl;
            result = calc.result;
            binaryData = {
              instrument_type: "binary_option",
              binary_expiry_at: exitedAt.toISOString(),
              binary_payout_ratio: payoutPercent / 100,
              binary_settlement: settlement === "open" ? null : settlement,
              binary_refund_amount: calc.refundedPrincipal,
            };
          }
          const identity = {
            accountId, provider: source,
            brokerTradeId: val("source_trade_id") || undefined,
            asset, enteredAt: enteredAt.toISOString(), exitedAt: exitedAt?.toISOString(),
            direction, grossPnl: binary ? finalPnl : rawPnl, fees,
            stake: numOrNull(val("stake")),
          };
          const import_fingerprint = await importFingerprint(identity);
          inserts.push({
            user_id: userId, account_id: accountId, asset, direction,
            session: sessionFromDate(enteredAt),
            entered_at: enteredAt.toISOString(),
            exited_at: binary && settlement === "open" ? null : exitedAt?.toISOString() ?? null,
            entry_price: numOrNull(val("entry_price")),
            exit_price: numOrNull(val("exit_price")),
            stop_loss: numOrNull(val("stop_loss")),
            take_profit: numOrNull(val("take_profit")),
            position_size: numOrNull(val("position_size")),
            stake: numOrNull(val("stake")),
            pnl: result === "open" ? 0 : finalPnl,
            fees: result === "open" ? 0 : fees,
            result,
            duration_seconds: exitedAt && result !== "open" ? Math.round((+exitedAt - +enteredAt) / 1000) : null,
            import_source: source,
            source_trade_id: val("source_trade_id") || null,
            import_fingerprint,
            ...binaryData,
          });
        } catch (error) {
          invalid.push("Row " + (i + 2) + ": " + (error instanceof Error ? error.message : "invalid"));
        }
      }
      if (invalid.length) {
        setSummary("Import aborted — " + invalid.length + " invalid rows. " + invalid.slice(0,6).join(" | "));
        throw new Error("Correct invalid rows before importing; no records were written.");
      }
      const { unique, repeated } = distinctImportKeys(inserts);
      const existing = new Set<string>();
      for (let i=0;i<unique.length;i+=150) {
        const keys = unique.slice(i,i+150).map(r=>r.import_fingerprint!);
        const { data: found, error } = await supabase.from("trades")
          .select("import_fingerprint").eq("account_id",accountId).in("import_fingerprint",keys);
        if (error) throw error;
        for (const item of found ?? []) if (item.import_fingerprint) existing.add(item.import_fingerprint);
      }
      const newRows = unique.filter(r=>!existing.has(r.import_fingerprint!));
      const duplicates = repeated.length + existing.size;
      if (!confirm(
        "Import preview: " + rows.length + " source rows; " + newRows.length +
        " new, " + duplicates + " duplicates.\nNo existing trades will be overwritten. Proceed?"
      )) return;
      if (!newRows.length) {
        setSummary("Nothing imported. All " + rows.length + " rows already exist or repeat in the CSV.");
        return;
      }
      const { data: run, error: runError } = await supabase.from("trade_import_runs")
        .insert({ user_id: userId, account_id: accountId, source,
          filename: fileName || null, attempted_rows: rows.length })
        .select("id").single();
      if (runError || !run) throw runError ?? new Error("Could not create audit record");
      let inserted = 0;
      for (let i=0;i<newRows.length;i+=150) {
        const batch = newRows.slice(i,i+150).map(r=>({...r,import_run_id:run.id}));
        const { data: saved, error } = await supabase.from("trades")
          .upsert(batch,{onConflict:"account_id,import_fingerprint",ignoreDuplicates:true})
          .select("id");
        if (error) throw new Error("Import partially completed. Re-run same file safely. " + error.message);
        inserted += saved?.length ?? 0;
      }
      setSummary("Import " + run.id + " (UTC offset " + brokerUtcOffsetHours + "h): " + inserted + " inserted, " +
        (rows.length-inserted) + " already present / duplicated. No existing trades overwritten.");
      toast.success("Imported " + inserted + " new trades; " + (rows.length - inserted) + " duplicates skipped");
      // Stay on import page to display reconciliation outcome and audit run.
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
        <p className="text-sm text-muted-foreground mt-1">MT4, MT5, generic and binary-option CSV. Existing trades are never overwritten; map the source broker's time zone and verify whether Profit is gross of fees.</p>
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
            <Label>Broker timestamp UTC offset (hours)</Label>
            <Input type="number" min="-12" max="14" step="0.5"
              value={brokerUtcOffsetHours} onChange={e=>setBrokerUtcOffsetHours(e.target.value)}
              className="mt-1" />
            <p className="text-[11px] text-muted-foreground mt-1">Applied only to timestamps WITHOUT an explicit Z or ±HH:MM offset. Example: Nairobi = +3. Broker server time may differ.</p>
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
                {(["generic", "mt4", "mt5", "binary"] as const).map((p) => (
                  <Button key={p} type="button" size="sm" variant={preset === p ? "default" : "outline"} onClick={() => applyPreset(p)} className="text-xs h-7 uppercase">{p}</Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key as string} className="flex items-center gap-3">
                  <Label className="w-40 text-sm">
                    {f.label} {(preset === "binary" ? ["asset","entered_at","exited_at","stake","payout_pct","settlement"].includes(f.key) : f.required) && <span className="text-loss">*</span>}
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
      <Card className="p-4 text-sm border-border/40">
        <p className="font-semibold">Import reconciliation</p>
        <p className="text-muted-foreground mt-1">Imports are account-scoped and never overwrite existing trades. Use a broker trade ID to avoid ambiguity when two separate contracts have identical details. Payout percent means NET profit on stake.</p>
        {summary && <p className="mt-2 whitespace-pre-wrap">{summary}</p>}
      </Card>
    </div>
  );
}

function parseDate(s: string, utcOffsetHours = 0): Date | null {
  if (!s) return null;
  const normalized = s.trim()
    .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3")
    .replace(" ", "T");
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = Date.parse(explicitZone ? normalized : normalized + "Z");
  if (!Number.isFinite(parsed)) return null;
  const ts = explicitZone ? parsed : parsed - utcOffsetHours * 3600000;
  const result = new Date(ts);
  return Number.isFinite(+result) ? result : null;
}
function numOrNull(s: string) {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}