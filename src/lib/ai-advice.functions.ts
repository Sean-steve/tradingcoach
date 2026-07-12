import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMetrics, performanceScore, type TradeLike } from "@/lib/metrics";

export const generateDailyAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { supabase, userId } = context;

    const { data: accounts } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .limit(1);
    const acct = accounts?.[0];
    const { data: allTrades } = await supabase.from("trades").select("*").eq("user_id", userId);
    const trades = (allTrades ?? []) as unknown as TradeLike[];
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const recent = trades.filter((t) => new Date(t.exited_at ?? t.entered_at) >= start);
    const m = computeMetrics(recent, Number(acct?.starting_balance ?? 10000));
    const s = performanceScore(m);

    const prompt = `You are a neutral trading performance coach. Based on this 7-day snapshot, produce ONE short paragraph (max 60 words) of actionable advice for today. No hype, no market predictions.
STATS: ${JSON.stringify({
  trades: m.tradesCount,
  net: m.netPnl.toFixed(2),
  wr: m.winRate.toFixed(1),
  pf: Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : null,
  dd: m.maxDrawdownPct.toFixed(1),
  streak: m.currentStreak,
  discipline: s.discipline,
  ruleCompliance: m.ruleCompliancePct.toFixed(0),
})}
If trades=0, tell them to log their first trade. Return plain text only.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an analytical trading performance coach. Output plain text only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Rate limit hit. Try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI gateway ${res.status}`);
    }
    const body = await res.json();
    return { advice: (body.choices?.[0]?.message?.content ?? "").trim() };
  });