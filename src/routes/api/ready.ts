import { createFileRoute } from "@tanstack/react-router";

/** Readiness verifies a real database round trip; does not expose records. */
export const Route=createFileRoute("/api/ready")({
  server:{handlers:{GET:async()=>{
    const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    if(!process.env["SUPABASE_URL"]||!process.env["SUPABASE_SERVICE_ROLE_KEY"])
      return Response.json({status:"not_ready",database:"not_configured"},{status:503,headers});
    try {
      const target = new URL(process.env["SUPABASE_URL"]!);
      const project = target.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? null;
      const deployEnv = process.env["TRADE_OS_DEPLOYMENT_ENV"];
      const expected = deployEnv === "staging"
        ? process.env["TRADE_OS_STAGING_PROJECT_REF"]
        : deployEnv === "production" ? process.env["TRADE_OS_PRODUCTION_PROJECT_REF"] : null;
      if ((deployEnv === "staging" || deployEnv === "production") &&
          (!expected || expected !== project))
        return Response.json({status:"not_ready",database:"target_mismatch"},{status:503,headers});
      const { supabaseAdmin }=await import("@/integrations/supabase/client.server");
      // Mere connectivity is not release readiness. Verify that the approved
      // financial ledger schema is available without reading any user records.
      const checks = await Promise.all([
        supabaseAdmin.from("accounts").select("id",{head:true,count:"estimated"}).limit(1),
        supabaseAdmin.from("account_cash_movements").select("id",{head:true,count:"estimated"}).limit(1),
        supabaseAdmin.from("trade_import_runs").select("id",{head:true,count:"estimated"}).limit(1),
      ]);
      if (checks.some(check=>check.error))
        return Response.json({status:"not_ready",database:"unavailable",financial_schema:"unverified"},{status:503,headers});
      return Response.json({status:"ready",database:"reachable",financial_schema:"phase-f1",project_ref:project},{headers});
    }catch{
      return Response.json({status:"not_ready",database:"unavailable"},{status:503,headers});
    }
  }}}
});
