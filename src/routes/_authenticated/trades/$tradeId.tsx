import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatPct, pnlTone } from "@/lib/format";
import { ArrowLeft, Camera } from "lucide-react";

const tradeByIdQuery = (id: string) =>
  queryOptions({
    queryKey: ["trade", id],
    queryFn: async () => {
      const [{ data: trade, error }, { data: shots }, { data: mistakes }] = await Promise.all([
        supabase.from("trades").select("*").eq("id", id).maybeSingle(),
        supabase.from("trade_screenshots").select("*").eq("trade_id", id).order("created_at"),
        supabase.from("trade_mistakes").select("*, mistake_catalog(name,category,severity,suggested_fix)").eq("trade_id", id),
      ]);
      if (error) throw error;
      return { trade, shots: shots ?? [], mistakes: mistakes ?? [] };
    },
  });

export const Route = createFileRoute("/_authenticated/trades/$tradeId")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <TradeDetail />
    </Suspense>
  ),
});

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold number-mono ${tone ? `text-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function TradeDetail() {
  const { tradeId } = Route.useParams();
  const { data } = useSuspenseQuery(tradeByIdQuery(tradeId));
  const t = data.trade;
  if (!t) return <div className="p-8 text-muted-foreground">Trade not found. <Link to="/trades" className="text-primary underline">Back</Link></div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/trades" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Back to journal</Link>
        <div className="mt-3 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{t.asset}</h1>
              <Badge variant="outline" className="uppercase text-[10px]">{t.direction}</Badge>
              <span className={`text-xs uppercase tracking-wider text-${pnlTone(Number(t.pnl))}`}>{t.result}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{t.setup ?? "—"} · {new Date(t.entered_at).toLocaleString()}</div>
          </div>
          <div className={`text-3xl font-bold number-mono text-${pnlTone(Number(t.pnl))}`}>{formatMoney(Number(t.pnl), "USD", { sign: true })}</div>
        </div>
      </div>

      <Card className="glow-card border-border/40 p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Entry" value={t.entry_price ? String(t.entry_price) : "—"} />
        <Stat label="Exit" value={t.exit_price ? String(t.exit_price) : "—"} />
        <Stat label="Stop" value={t.stop_loss ? String(t.stop_loss) : "—"} />
        <Stat label="Target" value={t.take_profit ? String(t.take_profit) : "—"} />
        <Stat label="Risk %" value={t.risk_pct ? formatPct(Number(t.risk_pct)) : "—"} />
        <Stat label="Planned RR" value={t.planned_rr ? String(t.planned_rr) : "—"} />
        <Stat label="Realized RR" value={t.realized_rr ? String(t.realized_rr) : "—"} />
        <Stat label="Fees" value={formatMoney(Number(t.fees ?? 0))} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glow-card border-border/40 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Confidence</div>
          <div className="text-2xl font-bold number-mono">{t.confidence ?? "—"}/10</div>
        </Card>
        <Card className="glow-card border-border/40 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Setup quality</div>
          <div className="text-2xl font-bold number-mono">{t.setup_quality ?? "—"}/10</div>
        </Card>
        <Card className="glow-card border-border/40 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Plan followed</div>
          <div className={`text-2xl font-bold ${t.followed_plan ? "text-profit" : "text-loss"}`}>{t.followed_plan ? "Yes" : "No"}</div>
        </Card>
      </div>

      {(t.pre_notes || t.post_notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {t.pre_notes && (
            <Card className="glow-card border-border/40 p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Pre-trade notes</div>
              <p className="text-sm whitespace-pre-wrap">{t.pre_notes}</p>
            </Card>
          )}
          {t.post_notes && (
            <Card className="glow-card border-border/40 p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Post-trade reflection</div>
              <p className="text-sm whitespace-pre-wrap">{t.post_notes}</p>
            </Card>
          )}
        </div>
      )}

      {data.mistakes.length > 0 && (
        <Card className="glow-card border-border/40 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Mistakes tagged</div>
          <div className="flex flex-wrap gap-2">
            {data.mistakes.map((m) => (
              <Badge key={m.id} variant="outline" className="text-loss border-loss/40">
                {(m.mistake_catalog as { name?: string } | null)?.name ?? "mistake"}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="glow-card border-border/40 p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Camera className="h-3 w-3" /> Screenshots ({data.shots.length})</div>
        {data.shots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No screenshots. Add during trade logging (before / after / annotated).</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.shots.map((s) => (
              <ScreenshotThumb key={s.id} path={s.storage_path} kind={s.kind} />
            ))}
          </div>
        )}
      </Card>

      {(t.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(t.tags ?? []).map((tag: string) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
        </div>
      )}
    </div>
  );
}

function ScreenshotThumb({ path, kind }: { path: string; kind: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ["shot-url", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("trade-screenshots").createSignedUrl(path, 3600);
      return data?.signedUrl ?? "";
    },
  });
  return (
    <a href={data} target="_blank" rel="noreferrer" className="block group">
      <div className="aspect-video bg-muted/20 rounded border border-border/40 overflow-hidden">
        {data && <img src={data} alt={kind} className="w-full h-full object-cover group-hover:opacity-80 transition" />}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{kind}</div>
    </a>
  );
}