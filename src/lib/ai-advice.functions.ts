import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateDailyAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { accountId?: string } => ({
    accountId: (input as { accountId?: string } | undefined)?.accountId,
  }))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: quotaError } = await context.supabase.rpc("consume_ai_quota", {
      p_function: "generateDailyAdvice",
    });
    // During migration rollout the quota RPC may not exist yet.
    // Only the documented "undefined function" error permits legacy mode.
    if (quotaError && quotaError.code !== "PGRST202" && quotaError.code !== "42883") {
      throw new Error("Unable to verify request quota");
    }
    if (!quotaError && !allowed) throw new Error("Hourly AI request limit reached; try again later.");
    const { generateAdvice } = await import("@/lib/coach.server");
    return generateAdvice(context.supabase, context.userId, data.accountId);
  });
