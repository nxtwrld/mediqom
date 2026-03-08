import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * GET /v1/share/pending
 * Returns pending shares addressed to the current user's email.
 * Includes pending_encrypted_key so the client can decrypt with the share_secret.
 */
export const GET: RequestHandler = async ({
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  // Get the user's email from auth
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(
    user.id,
  );

  if (authError || !authUser?.user?.email) {
    return error(500, { message: "Could not load user email" });
  }

  const userEmail = authUser.user.email.toLowerCase().trim();

  const { data: shares, error: sharesError } = await supabase
    .from("document_shares")
    .select(
      `id, sharer_id, owner_id, document_id, pending_encrypted_key, created_at,
       document:documents(id, metadata, type)`,
    )
    .eq("recipient_email", userEmail)
    .eq("status", "pending");

  if (sharesError) {
    console.error("[Share] Error loading pending shares:", sharesError);
    return error(500, { message: "Error loading pending shares" });
  }

  return json(shares);
};
