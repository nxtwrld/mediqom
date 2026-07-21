import type { SupabaseClient } from "@supabase/supabase-js";

export async function isAdminUser(
  supabase: SupabaseClient,
  authId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("auth_id", authId)
    .single();

  if (error) {
    console.error("[Admin] profile lookup error:", error);
    return false;
  }

  return data?.is_admin === true;
}
