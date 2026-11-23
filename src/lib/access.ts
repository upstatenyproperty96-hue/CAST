import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function profileFlags(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("profiles").select("beta_access, is_admin").eq("id", userId).maybeSingle();
  return { betaAccess: !!data?.beta_access, isAdmin: !!data?.is_admin };
}
