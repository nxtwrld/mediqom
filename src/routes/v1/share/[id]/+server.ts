import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { auditFromEvent } from "$lib/audit/index.server";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * DELETE /v1/share/[id]
 * Revoke a document share. Removes the recipient's key and marks the share as revoked.
 */
export const DELETE: RequestHandler = async (event) => {
  const {
    params,
    locals: { supabase, safeGetSession, user },
  } = event;
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  // Load the share and verify ownership
  const { data: share, error: shareError } = await supabase
    .from("document_shares")
    .select("id, sharer_id, document_id, owner_id, recipient_id, status")
    .eq("id", params.id)
    .single();

  if (shareError || !share) {
    return error(404, { message: "Share not found" });
  }

  // Verify that the current user is the sharer
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_id", user.id)
    .limit(1);

  if (profileError || !profiles?.length) {
    return error(500, { message: "Could not load user profile" });
  }

  if (share.sharer_id !== profiles[0].id) {
    return error(403, { message: "Not authorized to revoke this share" });
  }

  if (share.status === "revoked") {
    return json({ ok: true }); // Already revoked
  }

  const adminClient = getServiceClient();

  // Mark as revoked
  const { error: revokeError } = await adminClient
    .from("document_shares")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      pending_encrypted_key: null,
    })
    .eq("id", params.id);

  if (revokeError) {
    console.error("[Share] Error revoking share:", revokeError);
    return error(500, { message: "Error revoking share" });
  }

  // If the recipient had their keys inserted, remove the key row
  if (share.recipient_id && share.status === "active") {
    // Get recipient's auth_id
    const { data: recipientProfile } = await adminClient
      .from("profiles")
      .select("auth_id")
      .eq("id", share.recipient_id)
      .single();

    if (recipientProfile?.auth_id) {
      const { error: keyDeleteError } = await adminClient
        .from("keys")
        .delete()
        .eq("document_id", share.document_id)
        .eq("user_id", recipientProfile.auth_id)
        .eq("owner_id", share.owner_id);

      if (keyDeleteError) {
        console.error("[Share] Error removing recipient key:", keyDeleteError);
        // Don't fail — the share is already revoked
      }
    }
  }

  auditFromEvent(event, { action: "revoke", resource_type: "share", resource_id: params.id, metadata: { document_id: share.document_id } });

  return json({ ok: true });
};
