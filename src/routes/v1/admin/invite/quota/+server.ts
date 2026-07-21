import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { isAdminUser } from "$lib/auth/admin.server";
import { auditFromEvent } from "$lib/audit/index.server";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * POST /v1/admin/invite/quota
 * Admin-only: grants a target user extra invite codes beyond MAX_INVITES_PER_USER.
 */
export const POST: RequestHandler = async (event) => {
  const {
    request,
    locals: { safeGetSession, user },
  } = event;
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();
  if (!(await isAdminUser(supabase, user.id))) {
    return error(403, { message: "Forbidden" });
  }

  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const bonus = Number(body?.bonus);

  if (!email || !Number.isFinite(bonus) || bonus < 0) {
    return error(400, {
      message: "email and a non-negative bonus are required",
    });
  }

  const { data: recipientRows, error: rpcError } = await supabase.rpc(
    "find_profile_by_email",
    { lookup_email: email },
  );

  if (rpcError) {
    console.error("[Admin Invite] find_profile_by_email error:", rpcError);
    return error(500, { message: "Internal server error" });
  }

  const recipient = recipientRows?.[0] ?? null;
  if (!recipient) {
    return error(404, { message: "No account found for that email" });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ invite_quota_bonus: bonus })
    .eq("auth_id", recipient.auth_id);

  if (updateError) {
    console.error("[Admin Invite] quota update error:", updateError);
    return error(500, { message: "Could not update invite quota" });
  }

  auditFromEvent(event, {
    action: "update",
    resource_type: "account",
    metadata: { flow: "admin_invite_quota", target_email: email, bonus },
  });

  return json({ success: true });
};
