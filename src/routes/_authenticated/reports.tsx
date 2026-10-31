import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountsQuery, tradesQuery, coachReviewsQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { computeMetrics, performanceScore } from "@/lib/metrics";
import type { TradeLike } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPct, formatNum } from "@/lib/format";
import { formatAccountMoney } from "@/lib/account-currency";
import { FileText, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <ReportsPage />
    </Suspense>
  ),
});

function ReportsPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { activeId } = useActiveAccountId();
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const { data: reviews } = useSuspenseQuery(coachReviewsQuery());

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState<"custom" | "week" | "month" | "quarter" | "year" | "all">("month");

  const applyPreset = (p: typeof period) => {
    setPeriod(p);
    const now = new Date();
    const s = new Date(now);
    if (p === "week") s.setDate(now.getDate() - 7);
    else if (p === "month") s.setDate(1);
    else if (p === "quarter") s.setMonth(now.getMonth() - 3);
    else if (p === "year") s.setMonth(0, 1);
    else if (p === "all") s.setFullYear(2000);
    if (p !== "custom") { setFrom(s.toISOString().slice(0, 10)); setTo(now.toISOString().slice(0, 10)); }
  };

  const filtered = trades.filter((t) => {
    const d = new Date(t.exited_at ?? t.entered_at).toISOString().slice(0, 10);
    return d >= from && d <= to;
  });
  const m = computeMetrics(filtered as unknown as TradeLike[], Number(active?.starting_balance ?? 10000));
  const score = performanceScore(m);

  const exportPdf = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt" });
      doc.setFontSize(20); doc.setTextColor(0, 200, 150);
      doc.text("TRADE OS — Performance Report", 40, 50);
      doc.setFontSize(10); doc.setTextColor(120);
      doc.text(`${active?.name ?? "Account"} · ${active?.currency_confirmed_at ? active.currency : "CURRENCY UNREVIEWED"} · ${from} → ${to}`, 40, 68);

      autoTable(doc, {
        startY: 90, theme: "grid",
        head: [["Metric", "Value"]],
        body: [
          ["Trades", String(m.tradesCount)],
          ["Win rate", formatPct(m.winRate)],
          ["Net P&L", formatAccountMoney(m.netPnl, active, { sign: true })],
          ["Profit factor", Number.isFinite(m.profitFactor) ? formatNum(m.profitFactor) : "∞"],
          ["Expectancy", formatAccountMoney(m.expectancy, active, { sign: true })],
          ["Avg R:R", formatNum(m.avgRR)],
          ["Max drawdown", `${formatPct(m.maxDrawdownPct)} (${formatAccountMoney(m.maxDrawdown, active)})`],
          ["Longest win streak", String(m.longestWinStreak)],
          ["Longest loss streak", String(m.longestLossStreak)],
          ["Rule compliance", formatPct(m.ruleCompliancePct)],
          ["Performance score", `${score.total} / 100`],
        ],
        headStyles: { fillColor: [10, 15, 30], textColor: 255 },
        styles: { fontSize: 10 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(12); doc.setTextColor(0);
      doc.text("Trade log", 40, lastY);
      autoTable(doc, {
        startY: lastY + 8, theme: "striped",
        head: [["Date", "Asset", "Dir", "R:R", "P&L", "Result"]],
        body: filtered.slice(0, 200).map((t) => [
          new Date(t.entered_at).toLocaleDateString(),
          t.asset,
          t.direction,
          t.realized_rr ? formatNum(Number(t.realized_rr)) : "—",
          formatAccountMoney(Number(t.pnl), active, { sign: true }),
          t.result,
        ]),
        headStyles: { fillColor: [10, 15, 30], textColor: 255 },
        styles: { fontSize: 9 },
      });

      if (reviews.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const y = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(12); doc.text("Recent coach reviews", 40, y);
        let cursor = y + 16;
        reviews.slice(0, 3).forEach((r) => {
          if (cursor > 750) { doc.addPage(); cursor = 50; }
          doc.setFontSize(10); doc.setTextColor(120);
          doc.text(`${r.period.toUpperCase()} · ${new Date(r.period_start).toLocaleDateString()}`, 40, cursor);
          cursor += 14;
          doc.setFontSize(9); doc.setTextColor(0);
          const text = (r.summary || "").slice(0, 800);
          const lines = doc.splitTextToSize(text, 515);
          doc.text(lines, 40, cursor);
          cursor += lines.length * 11 + 12;
        });
      }

      doc.save(`trade-os-report_${from}_${to}.pdf`);
      toast.success("PDF exported");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const summary = [
        ["Metric", "Value"],
        ["Account", active?.name ?? ""],
        ["Period", `${from} → ${to}`],
        ["Trades", m.tradesCount],
        ["Win rate %", +m.winRate.toFixed(2)],
        ["Currency", active?.currency_confirmed_at ? active.currency : "UNREVIEWED"],
      ["Net P&L", +m.netPnl.toFixed(2)],
        ["Profit factor", Number.isFinite(m.profitFactor) ? +m.profitFactor.toFixed(2) : ""],
        ["Expectancy", +m.expectancy.toFixed(2)],
        ["Avg R:R", +m.avgRR.toFixed(2)],
        ["Max drawdown %", +m.maxDrawdownPct.toFixed(2)],
        ["Max drawdown $", +m.maxDrawdown.toFixed(2)],
        ["Longest win streak", m.longestWinStreak],
        ["Longest loss streak", m.longestLossStreak],
        ["Rule compliance %", +m.ruleCompliancePct.toFixed(2)],
        ["Performance score", score.total],
      ];
      const tradesSheet = [
        ["Entered", "Exited", "Asset", "Direction", "Strategy", "Session", "Risk %", "Planned R:R", "Realized R:R", "P&L", "Result", "Followed plan", "Setup quality", "Confidence"],
        ...filtered.map((t) => [
          t.entered_at, t.exited_at ?? "", t.asset, t.direction, t.strategy_id ?? "", t.session ?? "",
          t.risk_pct, t.planned_rr, t.realized_rr, +Number(t.pnl).toFixed(2), t.result,
          t.followed_plan, t.setup_quality, t.confidence,
        ]),
      ];
      const equity = [["Index", "Balance", "P&L"], ...m.equityCurve.map((e, i) => [i, +e.balance.toFixed(2), +e.pnl.toFixed(2)])];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tradesSheet), "Trades");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(equity), "Equity Curve");
      if (reviews.length) {
        const rev = [["Period", "Start", "End", "Summary"], ...reviews.map((r) => [r.period, r.period_start, r.period_end, r.summary ?? ""])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rev), "Coach Reviews");
      }
      XLSX.writeFile(wb, `trade-os-report_${from}_${to}.xlsx`);
      toast.success("Excel exported");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Exports</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Export analytics + coach reviews for {active?.name ?? "your account"} as PDF or Excel.</p>
      </div>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Period</Label>
            <Select value={period} onValueChange={(v) => applyPreset(v as typeof period)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="quarter">Last 3 months</SelectItem>
                <SelectItem value="year">Year to date</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod("custom"); }} className="mt-1" /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod("custom"); }} className="mt-1" /></div>
          <div className="flex items-end gap-2">
            <Button onClick={exportPdf} className="flex-1 gap-2"><FileText className="h-4 w-4" /> PDF</Button>
            <Button onClick={exportExcel} variant="outline" className="flex-1 gap-2"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </div>
        </div>
      </Card>

      <Card className="glow-card p-6 border-border/40">
        <div className="flex items-center gap-2 mb-4"><Download className="h-4 w-4 text-primary" /><h2 className="font-semibold">Preview — what will be exported</h2></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Trades" value={String(m.tradesCount)} />
          <Stat label="Net P&L" value={formatAccountMoney(m.netPnl, active, { sign: true })} />
          <Stat label="Win rate" value={formatPct(m.winRate)} />
          <Stat label="Profit factor" value={Number.isFinite(m.profitFactor) ? formatNum(m.profitFactor) : "∞"} />
          <Stat label="Expectancy" value={formatAccountMoney(m.expectancy, active, { sign: true })} />
          <Stat label="Avg R:R" value={formatNum(m.avgRR)} />
          <Stat label="Max DD" value={formatPct(m.maxDrawdownPct)} />
          <Stat label="Score" value={`${score.total} / 100`} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/40 text-xs text-muted-foreground">
          PDF includes a summary, up to 200 trades, and the 3 most recent coach reviews. Excel splits Summary, Trades, Equity Curve, and Coach Reviews into separate sheets.
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md border border-border/30">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="number-mono text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}