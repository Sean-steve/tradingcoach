import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateDailyAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { accountId?: string } => ({
    accountId: (input as { accountId?: string } | undefined)?.accountId,
  }))
  .handler(async ({ data, context }) => {
    const { generateAdvice } = await import("@/lib/coach.server");
    return generateAdvice(context.supabase, context.userId, data.accountId);
  });
