import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * GET /v1/share/recipient-info?email=...
 * Returns whether the recipient has a Mediqom account and their public key.
 */
export const GET: RequestHandler = async ({
  url,
  locals: { safeGetSession },
}) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const recipientEmail = url.searchParams.get("email");
  if (!recipientEmail) {
    return error(400, { message: "email parameter required" });
  }

  const supabase = getServiceClient();
  const { data, error: rpcError } = await supabase.rpc("find_profile_by_email", {
    lookup_email: recipientEmail.toLowerCase().trim(),
  });

  if (rpcError) {
    console.error("[Share] find_profile_by_email error:", rpcError);
    return error(500, { message: "Internal server error" });
  }

  if (!data || data.length === 0) {
    return json({ exists: false });
  }

  const profile = data[0];
  return json({
    exists: true,
    profile_id: profile.id,
    auth_id: profile.auth_id,
    publicKey: profile.publicKey ?? null,
  });
};
