import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Period } from "@/lib/coach.server";

export const generateCoachReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { period: Period; accountId?: string } => {
    const raw = input as { period?: string; accountId?: string };
    const p = raw?.period;
    if (p !== "daily" && p !== "weekly" && p !== "monthly") throw new Error("period must be daily|weekly|monthly");
    return { period: p, accountId: raw.accountId };
  })
  .handler(async ({ data, context }) => {
    const { data: allowed, error: quotaError } = await context.supabase.rpc("consume_ai_quota", {
      p_function: "generateCoachReview",
    });
    // During migration rollout the quota RPC may not exist yet.
    // Only the documented "undefined function" error permits legacy mode.
    if (quotaError && quotaError.code !== "PGRST202" && quotaError.code !== "42883") {
      throw new Error("Unable to verify request quota");
    }
    if (!quotaError && !allowed) throw new Error("Hourly AI request limit reached; try again later.");
    const { generateReview } = await import("@/lib/coach.server");
    return generateReview(context.supabase, context.userId, data.period, data.accountId);
  });
