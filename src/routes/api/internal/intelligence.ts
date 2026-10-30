import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";
import { runIntelligencePipeline } from "@/lib/intelligence.server";

function validToken(request: Request): boolean {
  const expected = process.env["TRADE_OS_CRON_SECRET"];
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32 || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/internal/intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!validToken(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!url || !key) {
          return Response.json({ error: "Worker not configured" }, { status: 503 });
        }

        // This endpoint is server-only. Do not send the service role key to clients.
        const db = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: jobs, error: claimError } = await db.rpc("claim_intelligence_jobs", { p_limit: 2 });
        if (claimError) {
          console.error("Failed claiming intelligence jobs", claimError.message);
          return Response.json({ error: "Queue temporarily unavailable" }, { status: 503 });
        }

        let processed = 0;
        let failed = 0;
        for (const job of jobs ?? []) {
          const revision = job.claimed_revision;
          if (revision == null) continue;
          let success = false;
          let failure = "";
          try {
            await runIntelligencePipeline(db, job.user_id, job.account_id);
            success = true;
            processed++;
          } catch (error) {
            failed++;
            failure = error instanceof Error ? error.message : "Unknown failure";
            console.error("Intelligence job failed", job.account_id, failure);
          }
          const { error: finishError } = await db.rpc("finish_intelligence_job", {
            p_account: job.account_id,
            p_revision: revision,
            p_success: success,
            p_error: failure || null,
          });
          if (finishError) {
            console.error("Failed finalizing intelligence job", job.account_id, finishError.message);
            return Response.json({ error: "Job finalization failed", processed, failed }, { status: 503 });
          }
        }
        return Response.json({ processed, failed });
      },
    },
  },
});
