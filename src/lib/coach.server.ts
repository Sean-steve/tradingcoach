// Server-only coaching logic. The coach is truth-gated: it only ever receives
// validated insights, root causes and the active operating manual — never raw
// trade dumps — and must answer as findings -> evidence -> recommendation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";
import { loadTruthContext } from "@/lib/intelligence.server";

type DB = SupabaseClient<Database>;
export type Period = "daily" | "weekly" | "monthly";

const MODEL = "google/gemini-3-flash-preview";

export async function callGateway(system: string, user: string, json: boolean): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit hit. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  const body = await res.json();
  const raw = String(body.choices?.[0]?.message?.content ?? "");
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

You may ONLY reason from the material below. Do not infer new correlations, do not invent numbers,
and do not make any behavioural claim that is not present in VALIDATED_INSIGHTS. If a claim you want
to make is absent, say the evidence is insufficient instead.

PERIOD: ${period}
OPERATING_MANUAL: ${JSON.stringify(truth.manual)}
PERIOD_METRICS: ${JSON.stringify(summaryStats)}
VALIDATED_INSIGHTS: ${JSON.stringify(truth.validated_insights)}
ROOT_CAUSES: ${JSON.stringify(truth.root_causes)}
OPEN_RECOMMENDATIONS: ${JSON.stringify(truth.open_recommendations)}

Return ONLY this JSON:
{
  "summary": "2-3 factual sentences. No hype.",
  "findings": ["finding — evidence: <sample size and confidence or metric it came from>", "..."],
  "recommendations": ["one specific behavioural action", "..."]
}
Rules:
- Every finding must follow the pattern: statement, then the evidence behind it (sample size, confidence, or the exact metric).
- Every recommendation must be behavioural and executable next session. Never market-directional.
- If VALIDATED_INSIGHTS is empty, say the system does not yet have enough evidence and recommend what to log to reach it.
- If trades=0, say so. Never fabricate data.
- No emojis, no exclamation marks.`;

  const raw = await callGateway("You are an analytical, evidence-gated trading performance coach. Output valid JSON only.", prompt, true);
  let parsed: { summary: string; findings: string[]; recommendations: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { summary: raw, findings: [], recommendations: [] };
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

  const advice = await callGateway("You are an analytical trading performance coach. Output plain text only.", prompt, false);
  return { advice, evidence_count: truth.validated_insights.length };
}
