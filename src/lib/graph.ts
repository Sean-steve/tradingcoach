// Knowledge Graph — pure, isomorphic.
// Nodes and edges are derived only from validated insights and observed
// behavior co-occurrence, so nothing enters the graph without evidence.

import { labelOf } from "@/lib/memory";

export type NodeType = "behavior" | "state" | "session" | "asset" | "strategy" | "timing" | "risk" | "quality" | "sequencing" | "outcome";

export interface GraphNodeDraft {
  node_key: string;
  node_type: NodeType;
  label: string;
  occurrences: number;
  impact_estimate: number;
  detail: Record<string, unknown>;
}

export interface GraphEdgeDraft {
  edge_key: string;
  source_key: string;
  target_key: string;
  relation: "hurts" | "helps" | "co_occurs";
  weight: number;
  sample_size: number;
  confidence: number;
  impact_estimate: number;
  detail: Record<string, unknown>;
}

export interface GraphInsight {
  insight_key: string;
  category: string;
  claim: string;
  status: string;
  sample_size: number;
  delta: number;
  confidence: number;
  impact_estimate: number;
  detail?: Record<string, unknown> | null;
}

export interface GraphResult {
  nodes: GraphNodeDraft[];
  edges: GraphEdgeDraft[];
  /** highest-cost path of connected nodes ending at the loss outcome */
  damagePath: { keys: string[]; labels: string[]; cost: number };
}

const NODE_TYPES: Record<string, NodeType> = {
  behavior: "behavior",
  psychology: "state",
  session: "session",
  asset: "asset",
  strategy: "strategy",
  timing: "timing",
  risk: "risk",
  quality: "quality",
  sequencing: "sequencing",
};

const LOSS_NODE = "outcome_loss";
const EDGE_NODE = "outcome_edge";

export function buildGraph(insights: GraphInsight[], eventsByTrade?: Map<string, string[]>): GraphResult {
  const validated = insights.filter((i) => i.status === "validated");
  const nodes = new Map<string, GraphNodeDraft>();
  const edges: GraphEdgeDraft[] = [];

  nodes.set(LOSS_NODE, { node_key: LOSS_NODE, node_type: "outcome", label: "Lost money", occurrences: 0, impact_estimate: 0, detail: {} });
  nodes.set(EDGE_NODE, { node_key: EDGE_NODE, node_type: "outcome", label: "Your edge", occurrences: 0, impact_estimate: 0, detail: {} });

  for (const i of validated) {
    const type = NODE_TYPES[i.category] ?? "quality";
    const key = `n_${i.insight_key}`;
    const label = String(i.detail?.["label"] ?? labelOf(i.insight_key));
    const prior = nodes.get(key);
    nodes.set(key, {
      node_key: key,
      node_type: type,
      label,
      occurrences: Math.max(prior?.occurrences ?? 0, i.sample_size),
      impact_estimate: (prior?.impact_estimate ?? 0) + i.impact_estimate,
      detail: { claim: i.claim, confidence: i.confidence, insight_key: i.insight_key },
    });

    const harmful = i.impact_estimate < 0 || i.delta < 0;
    const target = harmful ? LOSS_NODE : EDGE_NODE;
    edges.push({
      edge_key: `e_${i.insight_key}_${target}`,
      source_key: key,
      target_key: target,
      relation: harmful ? "hurts" : "helps",
      weight: Math.abs(i.delta),
      sample_size: i.sample_size,
      confidence: i.confidence,
      impact_estimate: i.impact_estimate,
      detail: { claim: i.claim },
    });

    const outcome = nodes.get(target)!;
    outcome.occurrences += i.sample_size;
    outcome.impact_estimate += i.impact_estimate;
  }

  // behavior co-occurrence: only pairs seen together at least 3 times, and only
  // when both behaviors already earned a validated node.
  if (eventsByTrade) {
    const pairs = new Map<string, number>();
    for (const codes of eventsByTrade.values()) {
      const uniq = [...new Set(codes)].sort();
      for (let a = 0; a < uniq.length; a++) {
        for (let b = a + 1; b < uniq.length; b++) pairs.set(`${uniq[a]}|${uniq[b]}`, (pairs.get(`${uniq[a]}|${uniq[b]}`) ?? 0) + 1);
      }
    }
    for (const [pair, count] of pairs) {
      if (count < 3) continue;
      const [a, b] = pair.split("|");
      const ka = `n_behavior_${a}`;
      const kb = `n_behavior_${b}`;
      if (!nodes.has(ka) || !nodes.has(kb)) continue;
      edges.push({
        edge_key: `e_co_${a}_${b}`,
        source_key: ka,
        target_key: kb,
        relation: "co_occurs",
        weight: count,
        sample_size: count,
        confidence: 0,
        impact_estimate: 0,
        detail: { co_occurrences: count },
      });
    }
  }

  return { nodes: [...nodes.values()], edges, damagePath: findDamagePath([...nodes.values()], edges) };
}

/** Walks co-occurrence links into the loss outcome and keeps the costliest chain. */
export function findDamagePath(nodes: GraphNodeDraft[], edges: GraphEdgeDraft[]): GraphResult["damagePath"] {
  const byKey = new Map(nodes.map((n) => [n.node_key, n]));
  const hurting = edges.filter((e) => e.relation === "hurts");
  if (!hurting.length) return { keys: [], labels: [], cost: 0 };

  const co = new Map<string, string[]>();
  for (const e of edges.filter((x) => x.relation === "co_occurs")) {
    co.set(e.target_key, [...(co.get(e.target_key) ?? []), e.source_key]);
    co.set(e.source_key, [...(co.get(e.source_key) ?? []), e.target_key]);
  }

  let best: GraphResult["damagePath"] = { keys: [], labels: [], cost: 0 };
  for (const e of hurting) {
    const chain = [e.source_key];
    let cost = Math.abs(e.impact_estimate);
    const seen = new Set(chain);
    let cursor = e.source_key;
    for (let depth = 0; depth < 2; depth++) {
      const next = (co.get(cursor) ?? [])
        .filter((k) => !seen.has(k))
        .sort((a, b) => (byKey.get(a)?.impact_estimate ?? 0) - (byKey.get(b)?.impact_estimate ?? 0))[0];
      if (!next) break;
      seen.add(next);
      chain.unshift(next);
      cost += Math.abs(byKey.get(next)?.impact_estimate ?? 0);
      cursor = next;
    }
    if (cost > best.cost) {
      const keys = [...chain, LOSS_NODE];
      best = { keys, labels: keys.map((k) => byKey.get(k)?.label ?? k), cost: Math.round(cost * 100) / 100 };
    }
  }
  return best;
}