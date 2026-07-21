import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { checkRateLimit } from "$lib/auth/rate-limiter";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /v1/waitlist/join
 * Public, unauthenticated: records an email to notify once invite codes
 * are available. Re-joining with the same email is treated as success.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
    return error(400, { message: "Invalid email address" });
  }

  const rl = checkRateLimit("waitlist-join", email, 5, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  const supabase = getServiceClient();
  const { error: insertError } = await supabase
    .from("waitlist_signups")
    .insert({ email });

  // Unique violation (already on the waitlist) is not an error from the caller's POV
  if (insertError && insertError.code !== "23505") {
    console.error("[Waitlist] insert error:", insertError);
    return error(500, { message: "Internal server error" });
  }

  return json({ success: true });
};
