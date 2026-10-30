import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshInterventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { accountId: string } => {
    const id = (input as { accountId?: string })?.accountId;
    if (!id) throw new Error("accountId is required");
    return { accountId: id };
  })
  .handler(async ({ data, context }) => {
    const { refreshInterventionOutcomes } = await import("@/lib/interventions.server");
    const { data: phase3Ready, error: phaseError } = await context.supabase.rpc("tradeos_phase3_ready");
    if (phaseError && !["42883","PGRST202"].includes(phaseError.code)) throw phaseError;
    if (phase3Ready === true) {
      const { privilegedDatabase, verifyOwnedAccount } = await import("@/lib/phase3.server");
      const db = privilegedDatabase();
      await verifyOwnedAccount(db, context.userId, data.accountId);
      return refreshInterventionOutcomes(db, context.userId, data.accountId);
    }
    return refreshInterventionOutcomes(context.supabase, context.userId, data.accountId);
  });