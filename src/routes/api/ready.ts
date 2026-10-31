import { createFileRoute } from "@tanstack/react-router";

/** Readiness verifies a real database round trip; does not expose records. */
export const Route=createFileRoute("/api/ready")({
  server:{handlers:{GET:async()=>{
    const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    if(!process.env["SUPABASE_URL"]||!process.env["SUPABASE_SERVICE_ROLE_KEY"])
      return Response.json({status:"not_ready",database:"not_configured"},{status:503,headers});
    try {
      const { supabaseAdmin }=await import("@/integrations/supabase/client.server");
      const {error}=await supabaseAdmin.from("accounts").select("id",{head:true,count:"estimated"}).limit(1);
      if(error)return Response.json({status:"not_ready",database:"unavailable"},{status:503,headers});
      return Response.json({status:"ready",database:"reachable"},{headers});
    }catch{
      return Response.json({status:"not_ready",database:"unavailable"},{status:503,headers});
    }
  }}}
});
