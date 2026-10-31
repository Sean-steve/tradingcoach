// Server-only outcome evaluation for active interventions.
// Evidence remains observational; an improved rate is not proof of causation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { measureBehavior, classifyInterventionFamily, interventionStatus } from "@/lib/intervention-measurement";

type DB = SupabaseClient<Database>;

export interface RefreshResult {
  evaluated: number;
  improving: number;
  regressing: number;
  succeeded: number;
}

export async function refreshInterventionOutcomes(
  supabase: DB, userId: string, accountId: string,
): Promise<RefreshResult> {
  const [owned, interventions, tradesResponse, eventsResponse] = await Promise.all([
    supabase.from("accounts").select("id").eq("id", accountId).eq("user_id", userId).maybeSingle(),
    supabase.from("interventions").select("*").eq("user_id", userId).eq("account_id", accountId).in("status", ["active","failed"]),
    supabase.from("trades").select("id,entered_at").eq("account_id", accountId).eq("user_id", userId).order("entered_at"),
    supabase.from("behavior_events").select("trade_id,code").eq("user_id", userId).eq("account_id", accountId),
  ]);
  if (owned.error || !owned.data) throw new Error("Trading account not found");
  if (interventions.error) throw interventions.error;
  if (tradesResponse.error) throw tradesResponse.error;
  if (eventsResponse.error) throw eventsResponse.error;

  const eventsByTrade = new Map<string, string[]>();
  for (const event of eventsResponse.data ?? []) {
    if (!event.trade_id) continue;
    const codes = eventsByTrade.get(event.trade_id) ?? [];
    if (!codes.includes(event.code)) codes.push(event.code);
    eventsByTrade.set(event.trade_id, codes);
  }

  const withTargets = (interventions.data ?? []).filter(iv => !!iv.target_behavior_code);
  const preliminary = withTargets.map(iv => measureBehavior(
    iv.target_behavior_code!, iv.starts_at, tradesResponse.data ?? [], eventsByTrade,
  ));
  const evaluated = classifyInterventionFamily(preliminary);
  let improving = 0, regressing = 0, succeeded = 0;

  for (const [index, intervention] of withTargets.entries()) {
    const result = evaluated[index];
    const status = interventionStatus(result);
    if (result.trend === "improving") improving++;
    if (result.trend === "regressing") regressing++;
    if (status === "succeeded") succeeded++;
    const { error } = await supabase.from("interventions").update({
      baseline_rate: result.baseline_rate,
      observed_rate: result.observed_rate,
      target_rate: result.target_rate,
      baseline_n: result.before_n,
      observed_n: result.observed_n,
      win_rate_effect_points: result.delta_points,
      adjusted_q: result.adjusted_q,
      sample_size: result.sample_size,
      confidence: result.confidence,
      trend: result.trend,
      status,
      resolved_at: status === "succeeded" ? new Date().toISOString() : null,
    }).eq("id", intervention.id).eq("user_id", userId).eq("account_id", accountId);
    if (error) throw error;
  }
  return { evaluated: withTargets.length, improving, regressing, succeeded };
}
