import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, tradesQuery, behaviorEventsAllQuery, twinScenariosQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { replay, defaultTwinRules, skipReasonLabel, type TwinRules, type TwinTrade } from "@/lib/twin";
import { formatMoney, formatPct, pnlTone } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GitCompareArrows, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/twin")({
  head: () => ({
    meta: [
      { title: "Digital Twin — Counterfactual Trading Replay | TRADE OS" },
      { name: "description", content: "Replay your real trade history under stricter discipline rules and see the equity curve you gave up." },
      { property: "og:title", content: "Digital Twin — Counterfactual Trading Replay" },
      { property: "og:description", content: "No prediction. Every number comes from trades you actually took, re-run under different rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading digital twin…</div>}>
      <Twin />
    </Suspense>
  ),
});

const BEHAVIOR_OPTIONS = ["revenge_trade", "oversize", "no_plan", "moved_stop", "overtrading", "fomo", "checklist_skipped", "no_stop"];
const SESSIONS = ["asian", "london", "newyork", "overlap_ln", "overlap_ny", "off_hours"];

function Twin() {
  const { activeId } = useActiveAccountId();
  const qc = useQueryClient();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(active?.id));
  const { data: events } = useSuspenseQuery(behaviorEventsAllQuery(active?.id));
  const { data: scenarios } = useSuspenseQuery(twinScenariosQuery(active?.id));

  const [rules, setRules] = useState<TwinRules>(defaultTwinRules);
  const [name, setName] = useState("Disciplined me");

  const eventsByTrade = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of events) {
      if (!e.trade_id) continue;
      const list = map.get(e.trade_id) ?? [];
      if (!list.includes(e.code)) list.push(e.code);
      map.set(e.trade_id, list);
    }
    return map;
  }, [events]);

  const result = useMemo(
    () => replay(trades as unknown as TwinTrade[], eventsByTrade, rules, Number(active?.starting_balance ?? 10000)),
    [trades, eventsByTrade, rules, active?.starting_balance],
  );

  const set = <K extends keyof TwinRules>(k: K, v: TwinRules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const toggleList = (k: "skipBehaviors" | "allowedSessions", value: string) =>
    setRules((r) => ({ ...r, [k]: r[k].includes(value) ? r[k].filter((v) => v !== value) : [...r[k], value] }));

  const save = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return toast.error("Not signed in");
    const { error } = await supabase.from("twin_scenarios").insert({
      user_id: uid,
      account_id: active?.id ?? null,
      name,
      rules: rules as never,
      result: { actual: result.actual, twin: result.twin, deltaPnl: result.deltaPnl } as never,
    });
    if (error) return toast.error(error.message);
    toast.success("Scenario saved");
    qc.invalidateQueries({ queryKey: ["twin_scenarios"] });
  };

  return (
    <div className="p-8 max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Digital Twin</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Counterfactual replay</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Your real trades, re-run under stricter rules. Nothing is invented — trades that break a rule are
            removed, and oversized trades are scaled down to the risk cap.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">Scenario name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-48 h-9" />
          </div>
          <Button onClick={save} className="gap-2"><Save className="h-4 w-4" /> Save</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="glow-card p-6 border-border/40 space-y-5 lg:col-span-1">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Rules</h2>
          <div>
            <Label className="text-xs">Skip trades tagged</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {BEHAVIOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleList("skipBehaviors", c)}
                  className={`text-[11px] px-2 py-1 rounded border capitalize transition-colors ${
                    rules.skipBehaviors.includes(c) ? "bg-primary/15 text-primary border-primary/40" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {c.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Allowed sessions (none = all)</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SESSIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleList("allowedSessions", s)}
                  className={`text-[11px] px-2 py-1 rounded border capitalize transition-colors ${
                    rules.allowedSessions.includes(s) ? "bg-primary/15 text-primary border-primary/40" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
          <NumRule label="Risk cap %" value={rules.maxRiskPct} onChange={(v) => set("maxRiskPct", v)} step="0.1" />
          <NumRule label="Stop after N losses/day" value={rules.stopAfterLosses} onChange={(v) => set("stopAfterLosses", v)} step="1" />
          <NumRule label="Max trades/day" value={rules.maxTradesPerDay} onChange={(v) => set("maxTradesPerDay", v)} step="1" />
          <Button variant="outline" size="sm" className="w-full" onClick={() => setRules(defaultTwinRules)}>Reset to defaults</Button>
        </Card>

        <Card className="glow-card p-6 border-border/40 lg:col-span-3 space-y-4">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Actual vs twin</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Delta label="P&L gained" value={formatMoney(result.deltaPnl, "USD", { sign: true })} tone={pnlTone(result.deltaPnl)} />
            <Delta label="Win rate" value={formatPct(result.deltaWinRate, { sign: true })} tone={pnlTone(result.deltaWinRate)} />
            <Delta label="Max drawdown" value={formatPct(result.deltaMaxDrawdown, { sign: true })} tone={pnlTone(-result.deltaMaxDrawdown)} />
            <Delta label="Trades removed" value={String(result.actual.trades - result.twin.trades)} tone="muted" />
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={result.curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="i" tick={{ fontSize: 11 }} stroke="oklch(0.7 0.02 260)" />
                <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.7 0.02 260)" domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.19 0.035 260)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatMoney(v, "USD")}
                />
                <Line type="monotone" dataKey="actual" stroke="oklch(0.72 0.02 260)" strokeWidth={2} dot={false} name="Actual" />
                <Line type="monotone" dataKey="twin" stroke="oklch(0.82 0.17 165)" strokeWidth={2} dot={false} name="Twin" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <SideTable title="Actual" side={result.actual} />
            <SideTable title="Twin" side={result.twin} highlight />
          </div>
        </Card>
      </div>

      <Card className="glow-card p-6 border-border/40">
        <h2 className="font-semibold mb-4">What the twin refused to trade</h2>
        {result.skipped.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trades were filtered under these rules.</p>
        ) : (
          <div className="space-y-2">
            {result.skipped.map((s) => (
              <div key={s.reason} className="flex items-center justify-between text-sm border-b border-border/30 pb-2">
                <span>{skipReasonLabel[s.reason]}</span>
                <span className="number-mono">
                  {s.count} trades · <span className={`text-${pnlTone(-s.pnl)}`}>{formatMoney(-s.pnl, "USD", { sign: true })} saved</span>
                </span>
              </div>
            ))}
            {result.scaledTrades > 0 && (
              <div className="text-xs text-muted-foreground pt-2">
                {result.scaledTrades} oversized trades were scaled down to the {rules.maxRiskPct}% risk cap rather than removed.
              </div>
            )}
          </div>
        )}
      </Card>

      {scenarios.length > 0 && (
        <Card className="glow-card p-6 border-border/40">
          <h2 className="font-semibold mb-4">Saved scenarios</h2>
          <div className="space-y-2">
            {scenarios.map((s) => {
              const r = (s.result ?? {}) as { deltaPnl?: number };
              return (
                <div key={s.id} className="flex items-center justify-between text-sm border-b border-border/30 pb-2">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`number-mono text-${pnlTone(Number(r.deltaPnl ?? 0))}`}>{formatMoney(Number(r.deltaPnl ?? 0), "USD", { sign: true })}</span>
                    <Button size="sm" variant="ghost" onClick={() => setRules({ ...defaultTwinRules, ...(s.rules as Partial<TwinRules>) })}>Load</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function NumRule({ label, value, onChange, step }: { label: string; value: number | null; onChange: (v: number | null) => void; step: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Switch checked={value != null} onCheckedChange={(on) => onChange(on ? Number(step) : null)} />
      </div>
      <Input
        type="number"
        step={step}
        disabled={value == null}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 h-9"
      />
    </div>
  );
}

function SideTable({ title, side, highlight }: { title: string; side: { trades: number; netPnl: number; endingBalance: number; winRate: number; maxDrawdown: number; expectancy: number }; highlight?: boolean }) {
  const rows: [string, string][] = [
    ["Trades", String(side.trades)],
    ["Net P&L", formatMoney(side.netPnl, "USD", { sign: true })],
    ["Ending balance", formatMoney(side.endingBalance, "USD")],
    ["Win rate", formatPct(side.winRate)],
    ["Max drawdown", formatPct(side.maxDrawdown)],
    ["Expectancy / trade", formatMoney(side.expectancy, "USD", { sign: true })],
  ];
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="number-mono">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Delta({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-4 border-border/40">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`number-mono text-xl font-bold mt-1 text-${tone}`}>{value}</div>
    </Card>
  );
}