import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Server-only client for the background intelligence projection writers.
 * An authenticated request MUST validate its account/user before calling
 * any pipeline with this privileged client. Never export this into UI routes.
 */
export function privilegedDatabase() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("TRADE OS background database credentials not configured");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function verifyOwnedAccount(db: ReturnType<typeof privilegedDatabase>, uid: string, accountId: string) {
  const { data, error } = await db.from("accounts").select("id")
    .eq("id", accountId).eq("user_id", uid).maybeSingle();
  if (error || !data) throw new Error("Account is not accessible");
}
