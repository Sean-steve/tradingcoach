// Server-only coaching logic. The coach is truth-gated: it only ever receives
// validated insights, root causes and the active operating manual — never raw
// trade dumps — and must answer as findings -> evidence -> recommendation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";
import { loadTruthContext } from "@/lib/intelligence.server";

type DB = SupabaseClient<Database>;
export type Period = "daily" | "weekly" | "monthly";

const MODEL = process.env["AI_MODEL"]?.trim() || "not-configured";

export function aiProviderConfigured(): boolean {
  return Boolean(process.env["AI_API_BASE_URL"]?.trim() && process.env["AI_MODEL"]?.trim());
}

/**
 * Provider-independent OpenAI-compatible endpoint.
 * For offline development, use Ollama: AI_API_BASE_URL=http://127.0.0.1:11434/v1.
 * Requests are SERVER ONLY. Never send trade data to a provider without
 * separately configuring and consenting to that provider.
 */
export async function callGateway(system: string, user: string, json: boolean): Promise<string> {
  const base = process.env["AI_API_BASE_URL"]?.trim();
  if (!base || !aiProviderConfigured()) {
    throw new Error("AI provider not configured. Offline deterministic coach remains available.");
  }
  let endpoint: URL;
  try { endpoint = new URL(base.replace(/\\/$/, "") + "/chat/completions"); }
  catch { throw new Error("Invalid AI_API_BASE_URL"); }
  if (!["https:", "http:"].includes(endpoint.protocol)) throw new Error("Unsupported AI provider URL");
  // Never permit plaintext remote endpoints for sensitive trading and behavioral data.
  if (endpoint.protocol === "http:" && !["localhost","127.0.0.1","::1"].includes(endpoint.hostname)) {
    throw new Error("AI provider must use HTTPS unless it is on localhost");
  }
  const timeout = Number(process.env["AI_TIMEOUT_MS"] || 30000);
  const apiKey = process.env["AI_API_KEY"]?.trim();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: aiProviderConfigured() ? MODEL : "offline-deterministic",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      stream: false,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(Number.isFinite(timeout) ? Math.max(1000,Math.min(120000,timeout)) : 30000),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI provider rate limit reached");
    throw new Error(`AI provider returned HTTP ${res.status}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: {content?: string} }> };
  const raw = String(data.choices?.[0]?.message?.content ?? "");
  if (!raw.trim()) throw new Error("AI provider returned an empty completion");
  return json ? stripFence(raw) : raw.trim();
}

export function stripFence(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

async function resolveAccount(supabase: DB, userId: string, accountId?: string) {
  if (accountId) {
    const { data } = await supabase.from("accounts").select("*").eq("id", accountId).limit(1);
    if (data?.[0]) return data[0];
  }
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("is_default", { ascending: false })
    .limit(1);
  const acct = data?.[0];
  if (!acct) throw new Error("No account found");
  return acct;
}

export async function generateReview(supabase: DB, userId: string, period: Period, accountId?: string) {
  const acct = await resolveAccount(supabase, userId, accountId);

  const now = new Date();
  const start = new Date(now);
  if (period === "daily") start.setDate(now.getDate() - 1);
  if (period === "weekly") start.setDate(now.getDate() - 7);
  if (period === "monthly") start.setMonth(now.getMonth() - 1);

  const { data: allTrades } = await supabase.from("trades").select("*").eq("account_id", acct.id);
  const trades = (allTrades ?? []) as unknown as TradeLike[];
  const inPeriod = trades.filter((t) => new Date(t.exited_at ?? t.entered_at) >= start);
  const m = computeMetrics(inPeriod, Number(acct.starting_balance));
  const score = performanceScore(m);

  const truth = await loadTruthContext(supabase, userId, acct.id);

  const summaryStats = {
    trades: m.tradesCount,
    wins: m.wins,
    losses: m.losses,
    net_pnl: Number(m.netPnl.toFixed(2)),
    win_rate_pct: Number(m.winRate.toFixed(1)),
    profit_factor: Number.isFinite(m.profitFactor) ? Number(m.profitFactor.toFixed(2)) : null,
    expectancy: Number(m.expectancy.toFixed(2)),
    avg_rr: Number(m.avgRR.toFixed(2)),
    max_drawdown_pct: Number(m.maxDrawdownPct.toFixed(1)),
    current_streak: m.currentStreak,
    rule_compliance_pct: Number(m.ruleCompliancePct.toFixed(1)),
    checklist_pct: Number(m.checklistPct.toFixed(1)),
    performance_score: score.total,
    pillars: score,
  };

  const prompt = `You are a neutral, analytical trading performance coach. You NEVER predict markets.

You may ONLY reason from the material below. The adjusted_q_value is a multiple-testing-corrected statistical screening quantity, NOT the probability a conclusion is true. Confidence fields are compatibility evidence indexes, not calibrated certainty.
Treat root causes as hypotheses or associated patterns, never proven causes.
Do not infer new correlations, do not invent numbers,
and do not make any behavioural claim that is not present in VALIDATED_INSIGHTS. If a claim you want
to make is absent, say the evidence is insufficient instead.

PERIOD: ${period}
OPERATING_MANUAL: ${JSON.stringify(truth.manual)}
PERIOD_METRICS: ${JSON.stringify(summaryStats)}
VALIDATED_INSIGHTS: ${JSON.stringify(truth.validated_insights)}
ROOT_CAUSES: ${JSON.stringify(truth.root_causes)}
OPEN_RECOMMENDATIONS: ${JSON.stringify(truth.open_recommendations)}
MEMORY_TIMELINE: ${JSON.stringify(truth.memory_timeline)}
DAMAGE_CHAINS: ${JSON.stringify(truth.graph_damage_edges)}
PAST_ADVICE_RESPONSE: ${JSON.stringify(truth.advice_history)}

Return ONLY this JSON:
{
  "summary": "2-3 factual sentences. No hype.",
  "findings": ["finding — evidence: <sample size and confidence or metric it came from>", "..."],
  "recommendations": ["one specific behavioural action", "..."]
}
Rules:
- Every finding must follow the pattern: statement, then the evidence behind it (sample size, confidence, or the exact metric).
- Every recommendation must be behavioural and executable next session. Never market-directional.
- Use MEMORY_TIMELINE to reference history explicitly when relevant ("found in June, fixed in July, returned last week").
- Use PAST_ADVICE_RESPONSE: do not repeat advice types the trader consistently dismissed; prefer types that worked.
- If VALIDATED_INSIGHTS is empty, say the system does not yet have enough evidence and recommend what to log to reach it.
- If trades=0, say so. Never fabricate data.
- No emojis, no exclamation marks.`;

  let parsed: { summary: string; findings: string[]; recommendations: string[] };
  if (!aiProviderConfigured()) {
    parsed = {
      summary: `Offline review: ${summaryStats.trades} recorded trades, net P&L ${summaryStats.net_pnl} and ${summaryStats.rule_compliance_pct}% rule compliance. These are descriptive records, not profit forecasts.`,
      findings: [`Recorded trade count: ${summaryStats.trades}; evidence-validated insight count: ${truth.validated_insights.length}.`],
      recommendations: ["Review the applicable Trading Operating Manual and complete the next trade checklist."],
    };
  } else {
    const raw = await callGateway("You are an analytical, evidence-gated trading performance coach. Output valid JSON only.", prompt, true);
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { summary: "AI response could not be parsed into validated findings.", findings: [], recommendations: [] };
    }
  }

  const { data: insertRow, error } = await supabase
    .from("coach_reviews")
    .insert({
      user_id: userId,
      account_id: acct.id,
      period,
      period_start: start.toISOString().slice(0, 10),
      period_end: now.toISOString().slice(0, 10),
      summary: parsed.summary ?? "",
      findings: parsed.findings ?? [],
      recommendations: parsed.recommendations ?? [],
      metrics: { ...summaryStats, evidence_count: truth.validated_insights.length } as never,
      model: MODEL,
    })
    .select()
    .single();
  if (error) throw error;
  return insertRow;
}

export async function generateAdvice(supabase: DB, userId: string, accountId?: string) {
  const acct = await resolveAccount(supabase, userId, accountId);
  const { data: allTrades } = await supabase.from("trades").select("*").eq("account_id", acct.id);
  const trades = (allTrades ?? []) as unknown as TradeLike[];
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const recent = trades.filter((t) => new Date(t.exited_at ?? t.entered_at) >= start);
  const m = computeMetrics(recent, Number(acct.starting_balance ?? 10000));
  const s = performanceScore(m);
  const truth = await loadTruthContext(supabase, userId, acct.id);

  const prompt = `Write ONE short paragraph (max 60 words) of advice for today. Neutral tone, no hype, no market predictions.
Ground it in the validated evidence below. If VALIDATED_INSIGHTS is empty, do not assert behavioural patterns.

7_DAY_METRICS: ${JSON.stringify({
    trades: m.tradesCount,
    net: m.netPnl.toFixed(2),
    win_rate: m.winRate.toFixed(1),
    profit_factor: Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : null,
    max_dd_pct: m.maxDrawdownPct.toFixed(1),
    streak: m.currentStreak,
    discipline: s.discipline,
    rule_compliance: m.ruleCompliancePct.toFixed(0),
  })}
OPERATING_MANUAL: ${JSON.stringify(truth.manual)}
VALIDATED_INSIGHTS: ${JSON.stringify(truth.validated_insights.slice(0, 5))}
TOP_RECOMMENDATION: ${JSON.stringify(truth.open_recommendations[0] ?? null)}

If trades=0, tell them to log their first trade. Return plain text only.`;

  const advice = !aiProviderConfigured()
    ? `Offline coaching: ${m.tradesCount} recorded trades in the last seven days and ${truth.validated_insights.length} validated insights. Focus on documented plan adherence and reviewing completed trades; no market predictions.`
    : await callGateway("You are an analytical trading performance coach. Output plain text only.", prompt, false);
  return { advice, evidence_count: truth.validated_insights.length };
}
