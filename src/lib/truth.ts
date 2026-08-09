// Statistical Engine + Truth Engine + Root Cause Engine — pure, isomorphic.
// Nothing here produces a claim without evidence: every insight carries a
// sample size, a baseline, a delta and a confidence level, and is marked
// `insufficient_evidence` until it clears the minimum-evidence gate.

export type InsightStatus = "validated" | "insufficient_evidence" | "invalidated";

export interface TruthTrade {
  id: string;
  asset: string;
  session: string | null;
  strategy_id: string | null;
  entered_at: string;
  exited_at: string | null;
  pnl: number | string;
  result: string;
  risk_pct: number | null;
  setup_quality: number | null;
}

export interface EvidenceDraft {
  label: string;
  value: string | null;
  trade_id?: string | null;
  detail?: Record<string, unknown>;
}

export interface InsightDraft {
  insight_key: string;
  category: string;
  claim: string;
  metric: string;
  status: InsightStatus;
  sample_size: number;
  baseline_value: number;
  observed_value: number;
  delta: number;
  confidence: number;
  impact_estimate: number;
  min_sample: number;
  detail: Record<string, unknown>;
  evidence: EvidenceDraft[];
}

export interface RootCauseDraft {
  cause_key: string;
  title: string;
  explanation: string;
  chain: { step: string; claim: string }[];
  insight_keys: string[];
  confidence: number;
  impact_estimate: number;
}

export interface RecommendationDraft {
  recommendation_key: string;
  title: string;
  action: string;
  rationale: string;
  priority: number;
  impact_estimate: number;
  confidence: number;
  cause_key: string | null;
  insight_key: string | null;
}

export interface TruthInput {
  trades: TruthTrade[];
  /** trade_id -> behavior codes present on that trade */
  eventsByTrade: Map<string, string[]>;
  /** trade_id -> pre-trade check-in */
  checkinByTrade: Map<string, { stress: number | null; sleep_quality: number | null; focus: number | null }>;
  /** trade_id -> 0-100 process score */
  processByTrade?: Map<string, number>;
  strategyNames?: Map<string, string>;
  /** minimum trades needed on BOTH sides before a claim can be validated */
  minSample?: number;
}

const BEHAVIOR_LABELS: Record<string, string> = {
  fomo: "FOMO entries", fear: "fear-driven trades", greed: "greed-driven trades",
  frustration: "trading while frustrated", overconfidence: "overconfident trades",
  stress: "trading under high stress", fatigue: "trading while fatigued", calm: "calm executions",
  late_entry: "late entries", early_entry: "early entries", hesitation: "hesitated entries",
  no_plan: "unplanned trades", moved_stop: "trades where the stop moved", early_exit: "premature exits",
  rule_break: "rule breaks", checklist_skipped: "skipped checklists", overtrading: "overtrading",
  revenge_trade: "revenge trades", journal_skipped: "unjournalled trades",
  oversize: "oversized positions", risk_escalation: "risk escalation after losses",
  no_stop: "trades without a stop", daily_loss_breach: "trading past the daily loss limit",
  correlated_exposure: "correlated exposure",
  anchoring: "anchored decisions", recency: "recency-biased trades", confirmation: "confirmation-biased trades",
  loss_aversion: "loss-averse holds", gamblers_fallacy: "gambler's-fallacy entries", outcome_bias: "outcome-biased reviews",
};

const num = (v: number | string | null) => Number(v ?? 0);

// --- statistics helpers -----------------------------------------------------

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (1.330274429 * t ** 4 - 1.821255978 * t ** 3 + 1.781477937 * t ** 2 - 0.356563782 * t + 0.319381530);
  return z > 0 ? 1 - p : p;
}

/** Two-proportion z-test → confidence (0-100) that the difference is real. */
export function proportionConfidence(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 < 2 || n2 < 2) return 0;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  const z = Math.abs((p1 - p2) / se);
  return Math.round(Math.min(99.9, (2 * normalCdf(z) - 1) * 100) * 10) / 10;
}

interface Segment {
  key: string;
  label: string;
  category: string;
  member: (t: TruthTrade) => boolean;
}

function stats(arr: TruthTrade[]) {
  const wins = arr.filter((t) => num(t.pnl) > 0).length;
  const net = arr.reduce((s, t) => s + num(t.pnl), 0);
  return {
    n: arr.length,
    wins,
    winRate: arr.length ? (wins / arr.length) * 100 : 0,
    expectancy: arr.length ? net / arr.length : 0,
    net,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

// --- insight generation -----------------------------------------------------

export function computeInsights(input: TruthInput): InsightDraft[] {
  const minSample = input.minSample ?? 8;
  const closed = input.trades.filter((t) => t.result !== "open");
  if (closed.length < minSample * 2) {
    return [
      {
        insight_key: "bootstrap_sample",
        category: "coverage",
        claim: `Not enough closed trades to validate behavioral claims yet: ${closed.length} logged, ${minSample * 2} needed.`,
        metric: "sample",
        status: "insufficient_evidence",
        sample_size: closed.length,
        baseline_value: minSample * 2,
        observed_value: closed.length,
        delta: closed.length - minSample * 2,
        confidence: 0,
        impact_estimate: 0,
        min_sample: minSample * 2,
        detail: { reason: "bootstrap" },
        evidence: [{ label: "Closed trades logged", value: String(closed.length) }],
      },
    ];
  }

  const ordered = closed
    .slice()
    .sort((a, b) => +new Date(a.exited_at ?? a.entered_at) - +new Date(b.exited_at ?? b.entered_at));

  // sequencing context
  const lossStreakBefore = new Map<string, number>();
  const winStreakBefore = new Map<string, number>();
  let runL = 0;
  let runW = 0;
  for (const t of ordered) {
    lossStreakBefore.set(t.id, runL);
    winStreakBefore.set(t.id, runW);
    if (num(t.pnl) > 0) { runW++; runL = 0; } else if (num(t.pnl) < 0) { runL++; runW = 0; }
  }

  const risks = closed.map((t) => (t.risk_pct == null ? null : Number(t.risk_pct))).filter((v): v is number => v != null).sort((a, b) => a - b);
  const medianRisk = risks.length ? risks[Math.floor(risks.length / 2)] : null;

  const segments: Segment[] = [];

  // behavior-code segments
  const codeCounts = new Map<string, number>();
  for (const t of closed) for (const c of input.eventsByTrade.get(t.id) ?? []) codeCounts.set(c, (codeCounts.get(c) ?? 0) + 1);
  for (const [code, count] of codeCounts) {
    if (count < 3) continue;
    segments.push({
      key: `behavior_${code}`,
      label: BEHAVIOR_LABELS[code] ?? code.replace(/_/g, " "),
      category: "behavior",
      member: (t) => (input.eventsByTrade.get(t.id) ?? []).includes(code),
    });
  }

  // sequencing
  segments.push({ key: "after_2_losses", label: "trades taken after 2+ consecutive losses", category: "sequencing", member: (t) => (lossStreakBefore.get(t.id) ?? 0) >= 2 });
  segments.push({ key: "after_2_wins", label: "trades taken after 2+ consecutive wins", category: "sequencing", member: (t) => (winStreakBefore.get(t.id) ?? 0) >= 2 });

  // psychology
  segments.push({ key: "state_high_stress", label: "trades entered with stress at 7+", category: "psychology", member: (t) => (input.checkinByTrade.get(t.id)?.stress ?? 0) >= 7 });
  segments.push({ key: "state_poor_sleep", label: "trades after poor sleep (3 or less)", category: "psychology", member: (t) => { const s = input.checkinByTrade.get(t.id)?.sleep_quality; return s != null && s <= 3; } });
  segments.push({ key: "state_low_focus", label: "trades entered with focus at 3 or less", category: "psychology", member: (t) => { const f = input.checkinByTrade.get(t.id)?.focus; return f != null && f <= 3; } });

  // execution context
  if (medianRisk != null) {
    segments.push({ key: "risk_above_median", label: `trades risking more than ${r2(medianRisk)}%`, category: "risk", member: (t) => t.risk_pct != null && Number(t.risk_pct) > medianRisk });
  }
  segments.push({ key: "low_setup_quality", label: "trades on B-grade setups (quality 4 or less)", category: "quality", member: (t) => t.setup_quality != null && Number(t.setup_quality) <= 4 });
  if (input.processByTrade?.size) {
    segments.push({ key: "low_process_score", label: "trades with a process score below 60", category: "quality", member: (t) => (input.processByTrade!.get(t.id) ?? 100) < 60 });
  }

  // dimensions
  const sessions = new Set(closed.map((t) => t.session).filter((s): s is string => !!s));
  for (const s of sessions) segments.push({ key: `session_${s}`, label: `the ${s.replace(/_/g, " ")} session`, category: "session", member: (t) => t.session === s });

  const assetCounts = new Map<string, number>();
  for (const t of closed) assetCounts.set(t.asset, (assetCounts.get(t.asset) ?? 0) + 1);
  for (const [asset, c] of [...assetCounts].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    if (c < 3) continue;
    segments.push({ key: `asset_${asset}`, label: asset, category: "asset", member: (t) => t.asset === asset });
  }

  const stratIds = new Set(closed.map((t) => t.strategy_id).filter((s): s is string => !!s));
  for (const id of stratIds) {
    const name = input.strategyNames?.get(id) ?? "this strategy";
    segments.push({ key: `strategy_${id}`, label: name, category: "strategy", member: (t) => t.strategy_id === id });
  }

  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let d = 0; d < 7; d++) {
    segments.push({ key: `weekday_${d}`, label: `${weekdays[d]}s`, category: "timing", member: (t) => new Date(t.exited_at ?? t.entered_at).getDay() === d });
  }

  const insights: InsightDraft[] = [];
  for (const seg of segments) {
    const inSeg = closed.filter(seg.member);
    const outSeg = closed.filter((t) => !seg.member(t));
    if (inSeg.length === 0 || outSeg.length === 0) continue;

    const a = stats(inSeg);
    const b = stats(outSeg);
    const wrDelta = a.winRate - b.winRate;
    const expDelta = a.expectancy - b.expectancy;
    const confidence = proportionConfidence(a.wins, a.n, b.wins, b.n);

    const gatePassed = a.n >= minSample && b.n >= minSample && confidence >= 80 && Math.abs(wrDelta) >= 5;
    const status: InsightStatus = gatePassed ? "validated" : "insufficient_evidence";

    const direction = wrDelta < 0 ? "drops" : "rises";
    const claim =
      `Win rate ${direction} ${r1(Math.abs(wrDelta))} points on ${seg.label}: ` +
      `${r1(a.winRate)}% over ${a.n} trades versus a ${r1(b.winRate)}% baseline across ${b.n} trades. ` +
      `Expectancy ${expDelta < 0 ? "falls" : "improves"} by ${r2(Math.abs(expDelta))} per trade.`;

    const worst = inSeg
      .slice()
      .sort((x, y) => num(x.pnl) - num(y.pnl))
      .slice(0, 5)
      .map<EvidenceDraft>((t) => ({
        label: `${t.asset} · ${new Date(t.exited_at ?? t.entered_at).toISOString().slice(0, 10)}`,
        value: r2(num(t.pnl)).toString(),
        trade_id: t.id,
      }));

    insights.push({
      insight_key: seg.key,
      category: seg.category,
      claim,
      metric: "win_rate",
      status,
      sample_size: a.n,
      baseline_value: r1(b.winRate),
      observed_value: r1(a.winRate),
      delta: r1(wrDelta),
      confidence,
      impact_estimate: r2(expDelta * a.n),
      min_sample: minSample,
      detail: {
        label: seg.label,
        baseline_sample: b.n,
        observed_expectancy: r2(a.expectancy),
        baseline_expectancy: r2(b.expectancy),
        expectancy_delta: r2(expDelta),
        net_pnl_in_segment: r2(a.net),
        gate: { min_sample: minSample, min_confidence: 80, min_delta_points: 5 },
      },
      evidence: [
        { label: "Sample size", value: `${a.n} trades` },
        { label: "Baseline sample", value: `${b.n} trades` },
        { label: "Observed win rate", value: `${r1(a.winRate)}%` },
        { label: "Baseline win rate", value: `${r1(b.winRate)}%` },
        { label: "Statistical confidence", value: `${confidence}%` },
        { label: "Net P&L in segment", value: r2(a.net).toString() },
        ...worst,
      ],
    });
  }

  return insights.sort((x, y) => {
    if (x.status !== y.status) return x.status === "validated" ? -1 : 1;
    return Math.abs(y.impact_estimate) - Math.abs(x.impact_estimate);
  });
}

// --- root causes ------------------------------------------------------------

const CAUSE_THEMES: { key: string; title: string; explanation: string; match: (i: InsightDraft) => boolean }[] = [
  {
    key: "risk_after_adversity",
    title: "Risk expands after adversity",
    explanation: "Losses are followed by larger risk and faster re-entries instead of a reset, so drawdowns compound.",
    match: (i) => ["after_2_losses", "behavior_revenge_trade", "behavior_risk_escalation", "behavior_oversize", "behavior_daily_loss_breach", "risk_above_median"].includes(i.insight_key),
  },
  {
    key: "state_before_process",
    title: "Unregulated state precedes poor decisions",
    explanation: "Stress, fatigue and low focus at entry line up with the weakest outcomes, meaning state is driving execution.",
    match: (i) => i.category === "psychology" || ["behavior_stress", "behavior_fatigue", "behavior_frustration", "behavior_fomo"].includes(i.insight_key),
  },
  {
    key: "process_breakdown",
    title: "Process is skipped under pressure",
    explanation: "Rule breaks, skipped checklists and unplanned entries cluster with the worst results — the plan exists but is not followed.",
    match: (i) => ["behavior_rule_break", "behavior_checklist_skipped", "behavior_no_plan", "behavior_overtrading", "low_process_score", "low_setup_quality"].includes(i.insight_key),
  },
  {
    key: "exit_management",
    title: "Exits are managed inconsistently",
    explanation: "Stops move and winners are cut early, so realised R lags planned R even when the entry was correct.",
    match: (i) => ["behavior_moved_stop", "behavior_early_exit", "behavior_loss_aversion", "behavior_no_stop"].includes(i.insight_key),
  },
  {
    key: "context_selection",
    title: "Edge is concentrated in specific contexts",
    explanation: "Results differ materially by session, asset, strategy or weekday — allocation, not effort, is the lever.",
    match: (i) => ["session", "asset", "strategy", "timing"].includes(i.category),
  },
];

export function buildRootCauses(insights: InsightDraft[]): RootCauseDraft[] {
  const validated = insights.filter((i) => i.status === "validated");
  const causes: RootCauseDraft[] = [];
  for (const theme of CAUSE_THEMES) {
    const members = validated.filter(theme.match).sort((a, b) => Math.abs(b.impact_estimate) - Math.abs(a.impact_estimate));
    if (members.length < 2) continue;
    causes.push({
      cause_key: theme.key,
      title: theme.title,
      explanation: theme.explanation,
      chain: members.slice(0, 5).map((m, idx) => ({ step: `${idx + 1}`, claim: m.claim })),
      insight_keys: members.map((m) => m.insight_key),
      confidence: Math.round(members.reduce((s, m) => s + m.confidence, 0) / members.length),
      impact_estimate: r2(members.reduce((s, m) => s + m.impact_estimate, 0)),
    });
  }
  return causes.sort((a, b) => Math.abs(b.impact_estimate) - Math.abs(a.impact_estimate));
}

// --- recommendations (with arbitration) ------------------------------------

const CAUSE_ACTIONS: Record<string, { title: string; action: string }> = {
  risk_after_adversity: {
    title: "Hard-reset after two losses",
    action: "After the second consecutive loss, stop for the session. When you return, cap risk at half your normal size for the next three trades.",
  },
  state_before_process: {
    title: "Gate entries on your state, not the chart",
    action: "Complete the pre-trade check-in before every entry. If stress is 7+ or focus is 3 or less, do not trade that setup.",
  },
  process_breakdown: {
    title: "Make the checklist blocking, not optional",
    action: "No entry without a completed checklist and a written plan. Log any skipped step as a rule break the same day.",
  },
  exit_management: {
    title: "Fix the stop before the entry",
    action: "Define the stop and target before entering, and do not move the stop against the position. Review every trade where realised R missed planned R by half.",
  },
  context_selection: {
    title: "Reallocate toward your proven context",
    action: "Trade only your two strongest sessions/assets for the next 20 trades, and paper-track the weak ones instead of funding them.",
  },
};

const INSIGHT_ACTION_FALLBACK = (i: InsightDraft): { title: string; action: string } => {
  const label = String(i.detail?.["label"] ?? i.insight_key.replace(/_/g, " "));
  return i.delta < 0
    ? { title: `Reduce exposure to ${label}`, action: `Stop taking ${label} for the next 20 trades, or halve position size there, and re-measure.` }
    : { title: `Do more of ${label}`, action: `${label} outperforms your baseline. Increase allocation there deliberately and keep risk constant.` };
};

export function buildRecommendations(insights: InsightDraft[], causes: RootCauseDraft[]): RecommendationDraft[] {
  const validated = insights.filter((i) => i.status === "validated");
  const drafts: RecommendationDraft[] = [];

  for (const c of causes) {
    const a = CAUSE_ACTIONS[c.cause_key] ?? { title: c.title, action: c.explanation };
    drafts.push({
      recommendation_key: `cause_${c.cause_key}`,
      title: a.title,
      action: a.action,
      rationale: `${c.explanation} Supported by ${c.insight_keys.length} validated insights at ${c.confidence}% average confidence.`,
      priority: 1,
      impact_estimate: c.impact_estimate,
      confidence: c.confidence,
      cause_key: c.cause_key,
      insight_key: null,
    });
  }

  const claimedKeys = new Set(causes.flatMap((c) => c.insight_keys));
  for (const i of validated.filter((v) => !claimedKeys.has(v.insight_key)).slice(0, 4)) {
    const a = INSIGHT_ACTION_FALLBACK(i);
    drafts.push({
      recommendation_key: `insight_${i.insight_key}`,
      title: a.title,
      action: a.action,
      rationale: i.claim,
      priority: 2,
      impact_estimate: i.impact_estimate,
      confidence: i.confidence,
      cause_key: null,
      insight_key: i.insight_key,
    });
  }

  // Arbitration: one prioritized set, worst-impact first, capped at 5.
  return drafts
    .sort((a, b) => {
      const negA = a.impact_estimate < 0 ? 0 : 1;
      const negB = b.impact_estimate < 0 ? 0 : 1;
      if (negA !== negB) return negA - negB;
      return Math.abs(b.impact_estimate) - Math.abs(a.impact_estimate);
    })
    .slice(0, 5)
    .map((d, idx) => ({ ...d, priority: idx + 1 }));
}
