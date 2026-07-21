import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { getMaxInvitesPerUser } from "$lib/config/invite-config";
import { checkRateLimit } from "$lib/auth/rate-limiter";
import { auditFromEvent } from "$lib/audit/index.server";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function generateCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}

/**
 * POST /v1/invite/generate
 * Generates one new invite code for the current user, if their quota allows it.
 */
export const POST: RequestHandler = async (event) => {
  const {
    locals: { safeGetSession, user },
  } = event;
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const rl = checkRateLimit("invite-generate", user.id, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
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

  const limit = getMaxInvitesPerUser() + (profile?.invite_quota_bonus ?? 0);

  const { count, error: countError } = await supabase
    .from("invite_codes")
    .select("code", { count: "exact", head: true })
    .eq("created_by", user.id);

  if (countError) {
    console.error("[Invite] count error:", countError);
    return error(500, { message: "Could not check invite quota" });
  }

  if ((count ?? 0) >= limit) {
    return error(403, { message: "No invites remaining" });
  }

  const code = generateCode();

  const { error: insertError } = await supabase
    .from("invite_codes")
    .insert({ code, created_by: user.id });

  if (insertError) {
    console.error("[Invite] insert error:", insertError);
    return error(500, { message: "Could not generate invite code" });
  }

  auditFromEvent(event, {
    action: "create",
    resource_type: "account",
    metadata: { flow: "invite_generate", code },
  });

  const origin = new URL(event.request.url).origin;

  return json({ code, link: `${origin}/auth?invite=${code}` });
};
