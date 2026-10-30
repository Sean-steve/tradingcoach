import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { accountId: string } => {
    const id = (input as { accountId?: string })?.accountId;
    if (!id) throw new Error("accountId is required");
    return { accountId: id };
  })
  .handler(async ({ data, context }) => {
    const { data: allowed, error: quotaError } = await context.supabase.rpc("consume_ai_quota", {
      p_function: "runIntelligence",
    });
    if (quotaError) throw new Error("Unable to verify request quota");
    if (!allowed) throw new Error("Hourly AI request limit reached; try again later.");
    const { runIntelligencePipeline } = await import("@/lib/intelligence.server");
    return runIntelligencePipeline(context.supabase, context.userId, data.accountId);
  });
