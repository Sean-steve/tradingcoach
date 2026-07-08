import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";

type Period = "daily" | "weekly" | "monthly";

export const generateCoachReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { period: Period } => {
    const p = (input as { period?: string })?.period;
    if (p !== "daily" && p !== "weekly" && p !== "monthly") throw new Error("period must be daily|weekly|monthly");
    return { period: p };
  })
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { supabase, userId } = context;

    const now = new Date();
    const start = new Date(now);
    if (data.period === "daily") start.setDate(now.getDate() - 1);
    if (data.period === "weekly") start.setDate(now.getDate() - 7);
    if (data.period === "monthly") start.setMonth(now.getMonth() - 1);

    // account + trades
    const { data: accounts } = await supabase.from("accounts").select("*").eq("user_id", userId).eq("is_default", true).limit(1);
    const acct = accounts?.[0];
    if (!acct) throw new Error("No default account");

    const { data: allTrades } = await supabase.from("trades").select("*").eq("user_id", userId);
    const trades = (allTrades ?? []) as unknown as TradeLike[];
    const inPeriod = trades.filter((t) => new Date(t.exited_at ?? t.entered_at) >= start);

    const { data: mistakeRows } = await supabase.from("trade_mistakes").select("mistake_code, trade_id");
    const inPeriodIds = new Set(inPeriod.map((t) => t.id));
    const periodMistakes = (mistakeRows ?? []).filter((m) => inPeriodIds.has(m.trade_id));
    const mistakeCounts: Record<string, number> = {};
    for (const m of periodMistakes) mistakeCounts[m.mistake_code] = (mistakeCounts[m.mistake_code] ?? 0) + 1;

    const m = computeMetrics(inPeriod, Number(acct.starting_balance));
    const score = performanceScore(m);

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
      top_mistakes: Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };

    const prompt = `You are a neutral, analytical trading performance coach. You NEVER predict markets. You coach discipline, risk, psychology, and consistency using ONLY the data provided.

PERIOD: ${data.period}
STATS (JSON): ${JSON.stringify(summaryStats)}

Write a structured review in this exact JSON shape:
{
  "summary": "2-3 sentence factual summary. No hype.",
  "findings": ["finding 1 with a number from stats", "finding 2", "..."],
  "recommendations": ["specific action for next period", "..."]
}
Rules:
- Every finding must cite a specific stat.
- Every recommendation must be actionable and behavior-focused (not market-directional).
- If trades=0, say so and recommend logging trades. Do not fabricate data.
- Never use emojis or exclamation marks.
Return ONLY the JSON.`;

    // Direct fetch to Lovable AI Gateway (chat completions)
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an analytical trading performance coach. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit hit. Try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
      throw new Error(`AI gateway ${res.status}: ${text}`);
    }
    const body = await res.json();
    const raw = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: { summary: string; findings: string[]; recommendations: string[] };
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch {
      parsed = { summary: raw, findings: [], recommendations: [] };
    }

    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);

    const { data: insertRow, error: insertErr } = await supabase.from("coach_reviews").insert({
      user_id: userId,
      account_id: acct.id,
      period: data.period,
      period_start: periodStart,
      period_end: periodEnd,
      summary: parsed.summary ?? "",
      findings: parsed.findings ?? [],
      recommendations: parsed.recommendations ?? [],
      metrics: summaryStats,
      model: "google/gemini-3-flash-preview",
    }).select().single();
    if (insertErr) throw insertErr;
    return insertRow;
  });

function stripFence(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}