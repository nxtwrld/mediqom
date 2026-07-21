import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { isAdminUser } from "$lib/auth/admin.server";
import { redeemInviteCode } from "$lib/invite/redeem.server";
import { auditFromEvent } from "$lib/audit/index.server";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function generateCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /v1/admin/invite/send
 * Admin-only: mints a code outside anyone's quota and immediately redeems
 * it for the given email, bypassing the normal user-to-user invite chain.
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
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
    return error(400, { message: "Invalid email address" });
  }

  const code = generateCode();
  const { error: insertError } = await supabase
    .from("invite_codes")
    .insert({ code, created_by: null });

  if (insertError) {
    console.error("[Admin Invite] insert error:", insertError);
    return error(500, { message: "Could not create invite code" });
  }

  const origin = new URL(request.url).origin;
  const result = await redeemInviteCode(supabase, code, email, origin);

  if (!result.ok) {
    return error(result.status, { message: result.message });
  }

  auditFromEvent(event, {
    action: "create",
    resource_type: "account",
    metadata: { flow: "admin_invite_send", target_email: email },
  });

  return json({ success: true });
};
