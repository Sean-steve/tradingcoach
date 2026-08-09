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
    const { generateReview } = await import("@/lib/coach.server");
    return generateReview(context.supabase, context.userId, data.period, data.accountId);
  });
