// Server-only: measure whether active interventions are actually working.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { measureOutcome, statusFromOutcome } from "@/lib/interventions";

type DB = SupabaseClient<Database>;

export interface RefreshResult {
  evaluated: number;
  improving: number;
  regressing: number;
  succeeded: number;
}

export async function refreshInterventionOutcomes(supabase: DB, userId: string, accountId: string): Promise<RefreshResult> {
  const [{ data: ivs }, { data: trades }, { data: events }] = await Promise.all([
    supabase.from("interventions").select("*").eq("user_id", userId).eq("account_id", accountId).in("status", ["active", "failed"]),
    supabase.from("trades").select("id,entered_at").eq("account_id", accountId).order("entered_at"),
    supabase.from("behavior_events").select("trade_id,code").eq("user_id", userId).eq("account_id", accountId),
  ]);

  const eventsByTrade = new Map<string, string[]>();
  for (const e of events ?? []) {
    if (!e.trade_id) continue;
    const list = eventsByTrade.get(e.trade_id) ?? [];
    if (!list.includes(e.code)) list.push(e.code);
    eventsByTrade.set(e.trade_id, list);
  }

  let improving = 0, regressing = 0, succeeded = 0, evaluated = 0;

  for (const iv of ivs ?? []) {
    if (!iv.target_behavior_code) continue;
    const o = measureOutcome(iv.target_behavior_code, iv.starts_at, trades ?? [], eventsByTrade);
    const status = statusFromOutcome(o);
    evaluated++;
    if (o.trend === "improving") improving++;
    if (o.trend === "regressing") regressing++;
    if (status === "succeeded") succeeded++;

    const { error } = await supabase
      .from("interventions")
      .update({
        baseline_rate: o.baseline_rate,
        observed_rate: o.observed_rate,
        target_rate: o.target_rate,
        sample_size: o.sample_size,
        confidence: o.confidence,
        trend: o.trend,
        status,
        resolved_at: status === "succeeded" ? new Date().toISOString() : null,
      })
      .eq("id", iv.id);
    if (error) throw error;
  }

  return { evaluated, improving, regressing, succeeded };
}