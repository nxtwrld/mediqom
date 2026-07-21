import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { checkRateLimit } from "$lib/auth/rate-limiter";
import { redeemInviteCode } from "$lib/invite/redeem.server";
import { auditFromEvent } from "$lib/audit/index.server";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /v1/invite/redeem
 * Public, unauthenticated: claims an invite code and sends the redeeming
 * email a Supabase account-invite. This is the only self-service path that
 * can create a new account — signInWithOtp is sign-in-only.
 */
export const POST: RequestHandler = async (event) => {
  const { request } = event;
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!code || !email) {
    return error(400, { message: "Invite code and email are required" });
  }
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    return error(400, { message: "Invalid email address" });
  }

  const rl = checkRateLimit("invite-redeem", email.toLowerCase(), 5, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  const supabase = getServiceClient();
  const origin = new URL(request.url).origin;
  const result = await redeemInviteCode(supabase, code, email, origin);

  if (!result.ok) {
    auditFromEvent(event, {
      action: "create",
      resource_type: "account",
      actor_type: "anonymous",
      actor_email: email,
      metadata: { flow: "invite_redeem" },
      success: false,
      error_message: result.message,
    });
    return error(result.status, { message: result.message });
  }

  auditFromEvent(event, {
    action: "create",
    resource_type: "account",
    actor_type: "anonymous",
    actor_email: email,
    metadata: { flow: "invite_redeem" },
  });

  return json({
    success: true,
    message: "Invite sent! Check your email to finish creating your account.",
  });
};
