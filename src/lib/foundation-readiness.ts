import { supabase } from "@/integrations/supabase/client";

/**
 * Allows code to be safely merged before the corresponding Supabase
 * migration is installed. Only a missing RPC means legacy mode; network,
 * authorization and SQL errors must fail closed.
 */
export async function isFoundationMigrationActive(): Promise<boolean> {
  const { data, error } = await supabase.rpc("tradeos_foundation_ready");
  if (!error) return data === true;
  if (error.code === "PGRST202" || error.code === "42883") return false;
  throw new Error("Unable to determine database migration state: " + error.message);
}

/** Phase 2 write paths must fail closed until the binary settlement migration exists. */
export async function isPhase2Active(): Promise<boolean> {
  const { data, error } = await supabase.rpc("tradeos_phase2_ready");
  if (!error) return data === true;
  if (error.code === "PGRST202" || error.code === "42883") return false;
  throw new Error("Unable to verify binary-contract database readiness: " + error.message);
}
