import { supabase } from "@/integrations/supabase/client";

/** Only a missing RPC means Phase 2 has not been activated; other DB errors fail closed. */
export async function isPhase2Active(): Promise<boolean> {
  const { data, error } = await supabase.rpc("tradeos_phase2_ready");
  if (!error) return data === true;
  if (error.code === "PGRST202" || error.code === "42883") return false;
  throw new Error("Cannot determine Phase 2 database readiness: " + error.message);
}
