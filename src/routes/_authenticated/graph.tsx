import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { graphEdgesQuery, graphNodesQuery } from "@/lib/queries";
import { useActiveAccountId } from "@/lib/active-account";
import { findDamagePath, type GraphEdgeDraft, type GraphNodeDraft, type NodeType } from "@/lib/graph";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Network } from "lucide-react";

export const Route = createFileRoute("/_authenticated/graph")({
  head: () => ({
    meta: [
      { title: "Knowledge Graph — How Your Behaviors Connect | TRADE OS" },
      { name: "description", content: "A map of the behaviors, states and setups that feed your losses and your edge, built only from statistically validated evidence." },
      { property: "og:title", content: "Knowledge Graph — How Your Behaviors Connect" },
      { property: "og:description", content: "See the costliest chain of behaviors leading to losses, and which patterns actually protect your edge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading graph…</div>}>
      <GraphPage />
    </Suspense>
  ),
});

const TYPE_TONE: Record<string, string> = {
  behavior: "var(--destructive)",
  state: "var(--secondary)",
  session: "var(--primary)",
  asset: "var(--primary)",
  strategy: "var(--secondary)",
  timing: "var(--warn)",
  risk: "var(--destructive)",
  quality: "var(--warn)",
  sequencing: "var(--warn)",
  outcome: "var(--success)",
};

function GraphPage() {
  const { activeId } = useActiveAccountId();
  const { data: rawNodes } = useSuspenseQuery(graphNodesQuery(activeId ?? undefined));
  const { data: rawEdges } = useSuspenseQuery(graphEdgesQuery(activeId ?? undefined));
  const [selected, setSelected] = useState<string | null>(null);

  const nodes = useMemo<GraphNodeDraft[]>(
    () =>
      rawNodes.map((n) => ({
        node_key: n.node_key,
        node_type: n.node_type as NodeType,
        label: n.label,
        occurrences: n.occurrences,
        impact_estimate: n.impact_estimate == null ? 0 : Number(n.impact_estimate),
        detail: (n.detail ?? {}) as Record<string, unknown>,
      })),
    [rawNodes],
  );

  const edges = useMemo<GraphEdgeDraft[]>(
    () =>
      rawEdges.map((e) => ({
        edge_key: e.edge_key,
        source_key: e.source_key,
        target_key: e.target_key,
        relation: e.relation as GraphEdgeDraft["relation"],
        weight: Number(e.weight),
        sample_size: e.sample_size,
        confidence: Number(e.confidence),
        impact_estimate: e.impact_estimate == null ? 0 : Number(e.impact_estimate),
        detail: (e.detail ?? {}) as Record<string, unknown>,
      })),
    [rawEdges],
  );

  const damage = useMemo(() => findDamagePath(nodes, edges), [nodes, edges]);
  const damageKeys = new Set(damage.keys);

  const W = 900;
  const H = 560;
  const layout = useMemo(() => {
    const outcomes = nodes.filter((n) => n.node_type === "outcome");
    const rest = nodes.filter((n) => n.node_type !== "outcome");
    const pos = new Map<string, { x: number; y: number }>();
    outcomes.forEach((n, i) => pos.set(n.node_key, { x: W / 2, y: outcomes.length === 1 ? H / 2 : i === 0 ? H * 0.28 : H * 0.72 }));
    const r = Math.min(W, H) * 0.42;
    rest.forEach((n, i) => {
      const a = (i / Math.max(rest.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.node_key, { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r * 0.92 });
    });
    return pos;
  }, [nodes]);

  const byKey = new Map(nodes.map((n) => [n.node_key, n]));
  const active = selected ? byKey.get(selected) : null;
  const activeEdges = selected ? edges.filter((e) => e.source_key === selected || e.target_key === selected) : [];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" /> Knowledge Graph
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Only validated patterns become nodes. Links are drawn from measured impact and repeated co-occurrence — never from guesses.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Nodes" value={String(nodes.length)} />
        <Stat label="Links" value={String(edges.length)} />
        <Stat label="Damage path cost" value={damage.cost ? `${damage.cost}` : "—"} />
      </div>

      {damage.labels.length > 0 && (
        <Card className="glow-card p-6 border-destructive/30">
          <div className="text-xs uppercase tracking-wider text-destructive mb-2">Costliest chain</div>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {damage.labels.map((l, i) => (
              <span key={`${l}-${i}`} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded border border-destructive/30 bg-destructive/10">{l}</span>
                {i < damage.labels.length - 1 && <span className="text-muted-foreground">→</span>}
              </span>
            ))}
          </div>
        </Card>
      )}

      {nodes.length === 0 ? (
        <Card className="glow-card p-10 border-border/40 text-center text-muted-foreground">
          The graph is empty. Run the intelligence pipeline from Insights once you have enough trades and validated patterns will appear here.
        </Card>
      ) : (
        <Card className="glow-card p-4 border-border/40 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[680px]" role="img" aria-label="Knowledge graph of validated trading patterns">
            {edges.map((e) => {
              const a = layout.get(e.source_key);
              const b = layout.get(e.target_key);
              if (!a || !b) return null;
              const inDamage = damageKeys.has(e.source_key) && damageKeys.has(e.target_key);
              const stroke =
                e.relation === "hurts" ? "var(--destructive)" : e.relation === "helps" ? "var(--success)" : "var(--muted-foreground)";
              return (
                <line
                  key={e.edge_key}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeWidth={inDamage ? 2.5 : e.relation === "co_occurs" ? 0.8 : 1.4}
                  strokeOpacity={selected ? (e.source_key === selected || e.target_key === selected ? 0.9 : 0.12) : inDamage ? 0.9 : 0.35}
                  strokeDasharray={e.relation === "co_occurs" ? "4 4" : undefined}
                />
              );
            })}
            {nodes.map((n) => {
              const p = layout.get(n.node_key);
              if (!p) return null;
              const size = n.node_type === "outcome" ? 16 : Math.max(6, Math.min(14, 6 + Math.log1p(n.occurrences) * 2));
              const color = TYPE_TONE[n.node_type] ?? "var(--primary)";
              const dim = selected != null && selected !== n.node_key && !activeEdges.some((e) => e.source_key === n.node_key || e.target_key === n.node_key);
              return (
                <g
                  key={n.node_key}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => setSelected(selected === n.node_key ? null : n.node_key)}
                  className="cursor-pointer"
                  opacity={dim ? 0.25 : 1}
                >
                  <circle r={size} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={selected === n.node_key ? 2.5 : 1.2} />
                  <text y={size + 12} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                    {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex gap-4 flex-wrap text-xs text-muted-foreground px-2 pb-1">
            <Legend color="var(--destructive)" label="hurts" />
            <Legend color="var(--success)" label="helps" />
            <Legend color="var(--muted-foreground)" label="co-occurs" />
          </div>
        </Card>
      )}

      {active && (
        <Card className="glow-card p-6 border-border/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-primary">{active.node_type}</div>
              <div className="font-semibold mt-0.5">{active.label}</div>
            </div>
            <div className="text-xs text-muted-foreground">
              {active.occurrences} occurrences · impact {active.impact_estimate.toFixed(2)}
            </div>
          </div>
          {typeof active.detail["claim"] === "string" && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{active.detail["claim"] as string}</p>
          )}
          <div className="mt-4 space-y-1.5">
            {activeEdges.map((e) => {
              const other = e.source_key === active.node_key ? e.target_key : e.source_key;
              return (
                <div key={e.edge_key} className="flex items-center justify-between gap-3 text-sm border-b border-border/30 py-1.5 last:border-0">
                  <span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider mr-2",
                        e.relation === "hurts" ? "text-destructive" : e.relation === "helps" ? "text-[color:var(--success)]" : "text-muted-foreground",
                      )}
                    >
                      {e.relation.replace(/_/g, " ")}
                    </span>
                    {byKey.get(other)?.label ?? other}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    n={e.sample_size}
                    {e.confidence > 0 ? ` · ${Math.round(e.confidence * 100)}% conf` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-px w-5 inline-block" style={{ backgroundColor: color }} /> {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="glow-card p-5 border-border/40">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}