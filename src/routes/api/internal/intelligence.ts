import { createFileRoute } from "@tanstack/react-router";
import { verifyWorkerToken, workerLimit, sanitizedWorkerError } from "@/lib/worker-governance";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runIntelligencePipeline } from "@/lib/intelligence.server";

type DB = SupabaseClient<Database>;
const headers={ "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
const reply=(data:object,status=200)=>Response.json(data,{status,headers});

async function privilegedClient(): Promise<DB | null> {
  if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return null;
  // Opaque and legacy service keys are handled by the shared server-only client.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Only aggregate counts leave this bearer-protected endpoint. */
async function queueStatus(db:DB) {
  const now=new Date();
  const staleRun=new Date(now.valueOf()-15*60_000).toISOString();
  const stalePending=new Date(now.valueOf()-30*60_000).toISOString();
  const states=["pending","running","succeeded","failed"] as const;
  const [
    pending,running,succeeded,failed,staleRunning,stalePendingCount,
  ] = await Promise.all([
    ...states.map(status=>db.from("intelligence_jobs").select("account_id",{head:true,count:"exact"}).eq("status",status)),
    db.from("intelligence_jobs").select("account_id",{head:true,count:"exact"}).eq("status","running").lt("locked_at",staleRun),
    db.from("intelligence_jobs").select("account_id",{head:true,count:"exact"}).eq("status","pending").lt("next_attempt_at",stalePending),
  ]);
  const all=[pending,running,succeeded,failed,staleRunning,stalePendingCount];
  if(all.some(x=>x.error))throw Error("Unable to read intelligence queue");
  const counts={pending:pending.count??0,running:running.count??0,
    succeeded:succeeded.count??0,failed:failed.count??0,
    overdue:(staleRunning.count??0)+(stalePendingCount.count??0)};
  return {status:counts.failed || counts.overdue ? "degraded":"ok",queue:counts};
}

export const Route = createFileRoute("/api/internal/intelligence")({
  server: {
    handlers: {
      GET: async ({request}) => {
        if(!verifyWorkerToken(request.headers.get("authorization"),process.env["TRADE_OS_CRON_SECRET"]))
          return reply({error:"Unauthorized"},401);
        const db=await privilegedClient();
        if(!db)return reply({error:"Worker not configured"},503);
        try {
          const result=await queueStatus(db);
          return reply(result,result.status==="ok"?200:503);
        } catch(error) {
          console.error("queue_monitor_failure",sanitizedWorkerError(error));
          return reply({error:"Queue status temporarily unavailable"},503);
        }
      },
      POST: async ({request}) => {
        if(!verifyWorkerToken(request.headers.get("authorization"),process.env["TRADE_OS_CRON_SECRET"]))
          return reply({error:"Unauthorized"},401);
        if(Number(request.headers.get("content-length")??0)>1024)
          return reply({error:"Request too large"},413);
        const db=await privilegedClient();
        if(!db)return reply({error:"Worker not configured"},503);

        let limit:number;
        try { limit=workerLimit(process.env["TRADE_OS_WORKER_BATCH_SIZE"],4,2); }
        catch {return reply({error:"Invalid worker configuration"},503);}

        const {data:jobs,error:claimError}=await db.rpc("claim_intelligence_jobs",{p_limit:limit});
        if(claimError) {
          console.error("queue_claim_failure",sanitizedWorkerError(claimError.message));
          return reply({error:"Queue temporarily unavailable"},503);
        }

        let processed=0,failed=0;
        for(const job of jobs??[]) {
          const revision=job.claimed_revision;
          if(revision==null)continue;
          let success=false;
          let failure:string|null=null;
          const started=Date.now();
          try {
            await runIntelligencePipeline(db,job.user_id,job.account_id);
            success=true;
            processed++;
          } catch(error) {
            failed++;
            failure=sanitizedWorkerError(error);
            console.error("queue_job_failure",JSON.stringify({error:failure,duration_ms:Date.now()-started}));
          }
          const {error:finishError}=await db.rpc("finish_intelligence_job",{
            p_account:job.account_id,p_revision:revision,p_success:success,p_error:failure,
          });
          if(finishError) {
            console.error("queue_finalize_failure",sanitizedWorkerError(finishError.message));
            return reply({error:"Job finalization failed",processed,failed},503);
          }
        }
        console.info("queue_batch_complete",JSON.stringify({processed,failed}));
        return reply({processed,failed},failed?207:200);
      },
    },
  },
});
