import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { accountsQuery, tradesQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatPct, pnlTone } from "@/lib/format";
import { PlusCircle, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trades/")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading trades…</div>}>
      <TradesList />
    </Suspense>
  ),
});

function TradesList() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(accounts[0]?.id));
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "open">("all");

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (filter !== "all" && t.result !== filter) return false;
      if (q && !`${t.asset} ${t.setup ?? ""} ${(t.tags ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [trades, q, filter]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trade Journal</h1>
          <p className="text-sm text-muted-foreground mt-1">{trades.length} total trades</p>
        </div>
        <Link to="/trades/new"><Button className="gap-2"><PlusCircle className="h-4 w-4" /> Log trade</Button></Link>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search asset, setup, tag…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {(["all", "win", "loss", "open"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs capitalize ${filter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card className="glow-card border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Asset</th>
                <th className="text-left px-4 py-3">Setup</th>
                <th className="text-left px-4 py-3">Dir</th>
                <th className="text-right px-4 py-3">Risk %</th>
                <th className="text-right px-4 py-3">R:R</th>
                <th className="text-right px-4 py-3">P&L</th>
                <th className="text-left px-4 py-3">Result</th>
                <th className="text-left px-4 py-3">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No trades match.</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => (window.location.href = `/trades/${t.id}`)}>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(t.entered_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-primary">{t.asset}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.setup ?? "—"}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="uppercase text-[10px]">{t.direction}</Badge></td>
                  <td className="px-4 py-3 text-right number-mono text-muted-foreground">{t.risk_pct ? formatPct(Number(t.risk_pct)) : "—"}</td>
                  <td className="px-4 py-3 text-right number-mono text-muted-foreground">{t.realized_rr ?? t.planned_rr ?? "—"}</td>
                  <td className={`px-4 py-3 text-right number-mono text-${pnlTone(Number(t.pnl))}`}>{formatMoney(Number(t.pnl), "USD", { sign: true })}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs uppercase tracking-wider text-${pnlTone(Number(t.pnl))}`}>{t.result}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(t.tags ?? []).slice(0, 3).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}