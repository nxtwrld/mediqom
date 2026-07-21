import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { getMaxInvitesPerUser } from "$lib/config/invite-config";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * GET /v1/invite/mine
 * Returns the current user's invite codes and remaining quota.
 */
export const GET: RequestHandler = async ({
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("invite_quota_bonus")
    .eq("auth_id", user.id)
    .single();

  if (profileError) {
    console.error("[Invite] profile lookup error:", profileError);
    return error(500, { message: "Could not load profile" });
  }

  const { data: codes, error: codesError } = await supabase
    .from("invite_codes")
    .select("code, status, claimed_email, created_at, claimed_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (codesError) {
    console.error("[Invite] codes lookup error:", codesError);
    return error(500, { message: "Could not load invite codes" });
  }

  const limit = getMaxInvitesPerUser() + (profile?.invite_quota_bonus ?? 0);

  return json({
    used: codes?.length ?? 0,
    limit,
    codes: codes ?? [],
  });
};
