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
    // Fail closed: a missing/stale quota RPC is a deployment defect, not
    // permission to generate unlimited AI requests.
    if (quotaError) throw new Error("Unable to verify request quota");
    if (!allowed) throw new Error("Hourly AI request limit reached; try again later.");
    const { runIntelligencePipeline } = await import("@/lib/intelligence.server");
    const { data: phase3Ready, error: phaseError } = await context.supabase.rpc("tradeos_phase3_ready");
    if (phaseError && !["42883","PGRST202"].includes(phaseError.code)) throw phaseError;
    if (phase3Ready === true) {
      // Projection tables are server-maintained in Phase 3, never user-writeable.
      const { privilegedDatabase, verifyOwnedAccount } = await import("@/lib/phase3.server");
      const db = privilegedDatabase();
      await verifyOwnedAccount(db, context.userId, data.accountId);
      return runIntelligencePipeline(db, context.userId, data.accountId);
    }
    return runIntelligencePipeline(context.supabase, context.userId, data.accountId);
  });
