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
    return refreshInterventionOutcomes(context.supabase, context.userId, data.accountId);
  });