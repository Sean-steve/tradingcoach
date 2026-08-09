// Behavior Event Engine — pure, isomorphic.
// Turns a trade (plus its context: prior trades, check-in, operating manual)
// into canonical behavior events from the shared taxonomy, and into a
// process-quality (decision) score that is independent of P&L.

export type BehaviorCategory = "emotional" | "decision" | "discipline" | "risk" | "cognitive_bias";

export interface BehaviorEventDraft {
  code: string;
  category: BehaviorCategory;
  severity: number;
  detector: string;
  context: Record<string, unknown>;
}

export interface BehaviorTradeLike {
  id: string;
  account_id: string;
  entered_at: string;
  exited_at: string | null;
  pnl: number | string;
  result: string;
  risk_pct: number | null;
  planned_rr: number | null;
  realized_rr: number | null;
  stop_loss: number | null;
  followed_plan: boolean | null;
  checklist_completed: boolean | null;
  setup_quality: number | null;
  confidence: number | null;
  post_notes: string | null;
  lessons: string | null;
}

export interface CheckinLike {
  trade_id: string | null;
  phase: string;
  mood: number | null;
  stress: number | null;
  focus: number | null;
  confidence: number | null;
  sleep_quality: number | null;
  mental_fatigue: number | null;
  frustration: number | null;
}

export interface ManualLimits {
  maxRiskPct: number | null;
  maxTradesPerDay: number | null;
  maxDailyLoss: number | null;
}

const SEV: Record<string, number> = {
  fomo: 4, fear: 3, greed: 4, frustration: 4, overconfidence: 4, stress: 3, fatigue: 3, calm: 1,
  late_entry: 3, early_entry: 3, hesitation: 2, no_plan: 5, moved_stop: 5, early_exit: 3,
  rule_break: 5, checklist_skipped: 3, overtrading: 4, revenge_trade: 5, journal_skipped: 2,
  oversize: 5, risk_escalation: 5, no_stop: 5, daily_loss_breach: 5, correlated_exposure: 3,
  anchoring: 3, recency: 3, confirmation: 3, loss_aversion: 4, gamblers_fallacy: 4, outcome_bias: 3,
};

const CAT: Record<string, BehaviorCategory> = {
  fomo: "emotional", fear: "emotional", greed: "emotional", frustration: "emotional",
  overconfidence: "emotional", stress: "emotional", fatigue: "emotional", calm: "emotional",
  late_entry: "decision", early_entry: "decision", hesitation: "decision", no_plan: "decision",
  moved_stop: "decision", early_exit: "decision",
  rule_break: "discipline", checklist_skipped: "discipline", overtrading: "discipline",
  revenge_trade: "discipline", journal_skipped: "discipline",
  oversize: "risk", risk_escalation: "risk", no_stop: "risk", daily_loss_breach: "risk",
  correlated_exposure: "risk",
  anchoring: "cognitive_bias", recency: "cognitive_bias", confirmation: "cognitive_bias",
  loss_aversion: "cognitive_bias", gamblers_fallacy: "cognitive_bias", outcome_bias: "cognitive_bias",
};

export const behaviorCategoryOf = (code: string): BehaviorCategory => CAT[code] ?? "decision";
export const behaviorSeverityOf = (code: string): number => SEV[code] ?? 3;

const ev = (code: string, detector: string, context: Record<string, unknown> = {}): BehaviorEventDraft => ({
  code,
  category: behaviorCategoryOf(code),
  severity: behaviorSeverityOf(code),
  detector,
  context,
});

const dayKey = (iso: string) => iso.slice(0, 10);

/**
 * Derive behavior events for a single trade, given every trade of the account
 * (used for streak / same-day / sequencing detectors) and the pre-trade check-in.
 */
export function deriveBehaviorEvents(
  trade: BehaviorTradeLike,
  allTrades: BehaviorTradeLike[],
  checkin: CheckinLike | undefined,
  limits: ManualLimits,
): BehaviorEventDraft[] {
  const out: BehaviorEventDraft[] = [];
  const pnl = Number(trade.pnl);
  const enteredAt = +new Date(trade.entered_at);

  const priors = allTrades
    .filter((t) => t.id !== trade.id && +new Date(t.entered_at) < enteredAt)
    .sort((a, b) => +new Date(a.entered_at) - +new Date(b.entered_at));
  const prev = priors[priors.length - 1];

  // ---- Risk detectors
  if (trade.stop_loss == null) out.push(ev("no_stop", "stop_loss_missing"));
  if (limits.maxRiskPct != null && trade.risk_pct != null && Number(trade.risk_pct) > limits.maxRiskPct) {
    out.push(ev("oversize", "risk_pct_over_manual", { risk_pct: Number(trade.risk_pct), limit: limits.maxRiskPct }));
  }
  if (prev && Number(prev.pnl) < 0 && trade.risk_pct != null && prev.risk_pct != null && Number(trade.risk_pct) > Number(prev.risk_pct) * 1.25) {
    out.push(ev("risk_escalation", "risk_up_after_loss", { from: Number(prev.risk_pct), to: Number(trade.risk_pct) }));
  }

  const sameDay = priors.filter((t) => dayKey(t.entered_at) === dayKey(trade.entered_at));
  const dayPnlBefore = sameDay.reduce((s, t) => s + Number(t.pnl), 0);
  if (limits.maxDailyLoss != null && dayPnlBefore <= -limits.maxDailyLoss) {
    out.push(ev("daily_loss_breach", "traded_past_daily_limit", { day_pnl_before: dayPnlBefore, limit: limits.maxDailyLoss }));
  }
  if (limits.maxTradesPerDay != null && sameDay.length >= limits.maxTradesPerDay) {
    out.push(ev("overtrading", "trade_count_over_manual", { trade_index: sameDay.length + 1, limit: limits.maxTradesPerDay }));
  }

  // ---- Discipline detectors
  if (trade.followed_plan === false) out.push(ev("rule_break", "followed_plan_false"));
  if (trade.checklist_completed === false) out.push(ev("checklist_skipped", "checklist_false"));
  if (!trade.post_notes && !trade.lessons && trade.result !== "open") out.push(ev("journal_skipped", "no_post_notes"));

  if (prev && Number(prev.pnl) < 0) {
    const prevOut = prev.exited_at ? +new Date(prev.exited_at) : +new Date(prev.entered_at);
    const gapMin = (enteredAt - prevOut) / 60000;
    if (gapMin >= 0 && gapMin <= 30) {
      out.push(ev("revenge_trade", "reentry_within_30min_of_loss", { gap_minutes: Math.round(gapMin) }));
    }
  }

  // ---- Decision detectors
  if (trade.planned_rr == null && trade.stop_loss == null) out.push(ev("no_plan", "no_planned_rr_or_stop"));
  if (
    trade.planned_rr != null && trade.realized_rr != null &&
    pnl > 0 && Number(trade.realized_rr) < Number(trade.planned_rr) * 0.5
  ) {
    out.push(ev("early_exit", "realized_rr_below_half_plan", { planned: Number(trade.planned_rr), realized: Number(trade.realized_rr) }));
  }

  // ---- Emotional detectors (from the pre-trade check-in)
  if (checkin) {
    const stress = checkin.stress ?? null;
    const focus = checkin.focus ?? null;
    const mood = checkin.mood ?? null;
    if (stress != null && stress >= 7) out.push(ev("stress", "checkin_stress_high", { stress }));
    if ((checkin.mental_fatigue ?? 0) >= 7 || (checkin.sleep_quality != null && checkin.sleep_quality <= 3)) {
      out.push(ev("fatigue", "checkin_fatigue", { sleep_quality: checkin.sleep_quality, mental_fatigue: checkin.mental_fatigue }));
    }
    if ((checkin.frustration ?? 0) >= 7 || (mood != null && mood <= 3)) {
      out.push(ev("frustration", "checkin_low_mood", { mood, frustration: checkin.frustration }));
    }
    if (stress != null && stress <= 3 && focus != null && focus >= 7) out.push(ev("calm", "checkin_regulated", { stress, focus }));
    if ((checkin.confidence ?? 0) >= 8 && (trade.setup_quality ?? 10) <= 4) {
      out.push(ev("fomo", "high_confidence_low_setup", { confidence: checkin.confidence, setup_quality: trade.setup_quality }));
    }
  }

  // ---- Cognitive bias detectors
  const tail = priors.slice(-3);
  if (tail.length === 3 && tail.every((t) => Number(t.pnl) > 0)) {
    if (trade.risk_pct != null && prev?.risk_pct != null && Number(trade.risk_pct) > Number(prev.risk_pct)) {
      out.push(ev("overconfidence", "size_up_after_3_wins", { risk_pct: Number(trade.risk_pct) }));
    }
    out.push(ev("recency", "after_3_wins", {}));
  }
  if (tail.length === 3 && tail.every((t) => Number(t.pnl) < 0)) {
    out.push(ev("gamblers_fallacy", "after_3_losses", {}));
  }
  if (pnl < 0 && trade.stop_loss != null && trade.realized_rr != null && Number(trade.realized_rr) < -1.5) {
    out.push(ev("loss_aversion", "loss_beyond_planned_stop", { realized_rr: Number(trade.realized_rr) }));
    out.push(ev("moved_stop", "loss_exceeds_1r", { realized_rr: Number(trade.realized_rr) }));
  }

  // de-dupe by code
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.code) ? false : (seen.add(e.code), true)));
}

export interface DecisionScoreDraft {
  plan_adherence: number;
  entry_quality: number;
  risk_control: number;
  patience: number;
  exit_quality: number;
  process_score: number;
}

const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

/** Process quality 1–5 per dimension, 0–100 composite. Never uses P&L. */
export function deriveDecisionScore(
  trade: BehaviorTradeLike,
  events: BehaviorEventDraft[],
  checkin: CheckinLike | undefined,
): DecisionScoreDraft {
  const has = (c: string) => events.some((e) => e.code === c);

  let plan = trade.followed_plan === false ? 1 : trade.followed_plan ? 5 : 3;
  if (has("checklist_skipped")) plan -= 1;
  if (has("no_plan")) plan -= 2;

  const entry = trade.setup_quality != null ? clamp5(Number(trade.setup_quality) / 2) : 3;

  let risk = 5;
  if (has("no_stop")) risk -= 2;
  if (has("oversize")) risk -= 2;
  if (has("risk_escalation")) risk -= 2;
  if (has("daily_loss_breach")) risk -= 2;

  let patience = 5;
  if (has("revenge_trade")) patience -= 3;
  if (has("fomo")) patience -= 2;
  if (has("overtrading")) patience -= 1;
  if (has("stress")) patience -= 1;
  if (has("calm")) patience += 1;
  if (checkin?.focus != null && checkin.focus <= 3) patience -= 1;

  let exit = 3;
  if (trade.planned_rr != null && trade.realized_rr != null) {
    const ratio = Number(trade.realized_rr) / Math.max(0.1, Number(trade.planned_rr));
    exit = clamp5(1 + ratio * 3);
  }
  if (has("early_exit")) exit -= 1;
  if (has("moved_stop")) exit -= 2;

  const dims = {
    plan_adherence: clamp5(plan),
    entry_quality: clamp5(entry),
    risk_control: clamp5(risk),
    patience: clamp5(patience),
    exit_quality: clamp5(exit),
  };
  const avg = (dims.plan_adherence + dims.entry_quality + dims.risk_control + dims.patience + dims.exit_quality) / 5;
  return { ...dims, process_score: Math.round(avg * 20) };
}
