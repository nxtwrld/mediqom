import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import type { ShareAcceptBody } from "$lib/share/types.d";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * POST /v1/share/accept
 * Called by User B after decrypting the pending AES key and re-encrypting it
 * with their own RSA public key. Inserts the key and marks the share as active.
 */
export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const body: ShareAcceptBody = await request.json();
  const { share_id, encrypted_key_for_me } = body;

  if (!share_id || !encrypted_key_for_me) {
    return error(400, { message: "share_id and encrypted_key_for_me are required" });
  }

  const supabase = getServiceClient();

  // Load the pending share
  const { data: share, error: shareError } = await supabase
    .from("document_shares")
    .select("id, document_id, owner_id, recipient_email, status")
    .eq("id", share_id)
    .single();

  if (shareError || !share) {
    return error(404, { message: "Share not found" });
  }

  if (share.status !== "pending") {
    return error(400, { message: "Share is not in pending state" });
  }

  // Verify the share is addressed to the current user's email
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(
    user.id,
  );

  if (authError || !authUser?.user?.email) {
    return error(500, { message: "Could not verify user email" });
  }

  const userEmail = authUser.user.email.toLowerCase().trim();
  if (share.recipient_email !== userEmail) {
    return error(403, { message: "Share is not addressed to you" });
  }

  // Get recipient's profile ID
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_id", user.id)
    .limit(1);

  if (profileError || !profiles?.length) {
    return error(500, { message: "Could not load user profile" });
  }
  const recipientProfileId = profiles[0].id;

  // Insert the key row
  const { error: keyError } = await supabase.from("keys").insert({
    document_id: share.document_id,
    user_id: user.id,
    owner_id: share.owner_id,
    key: encrypted_key_for_me,
    author_id: user.id,
  });

  if (keyError) {
    console.error("[Share] Error inserting accepted key:", keyError);
    return error(500, { message: "Error accepting share" });
  }

  // Mark share as active
  const { error: updateError } = await supabase
    .from("document_shares")
    .update({
      status: "active",
      recipient_id: recipientProfileId,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", share_id);

  if (updateError) {
    console.error("[Share] Error updating share status:", updateError);
    return error(500, { message: "Error updating share status" });
  }

  return json({ ok: true });
};
