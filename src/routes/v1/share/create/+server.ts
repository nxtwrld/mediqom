import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { checkRateLimit } from "$lib/auth/rate-limiter";
import { auditFromEvent } from "$lib/audit/index.server";
import type { ShareCreateBody } from "$lib/share/types.d";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * POST /v1/share/create
 * Creates document shares, inserting keys for existing users or pending records for new users.
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

  // Rate limit: 20 requests/min per user
  const rl = checkRateLimit("share-create", user.id, 20, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  const body: ShareCreateBody = await request.json();
  const { recipient_email, share_secret, shares } = body;

  if (!recipient_email || !shares || shares.length === 0) {
    return error(400, { message: "recipient_email and shares are required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipient_email) || recipient_email.length > 254) {
    return error(400, { message: "Invalid email address" });
  }

  const supabase = getServiceClient();

  // Look up the sharer's profile
  const { data: sharerProfiles, error: sharerError } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_id", user.id)
    .limit(1);

  if (sharerError || !sharerProfiles?.length) {
    console.error("[Share] Could not load sharer profile:", sharerError);
    return error(500, { message: "Could not load user profile" });
  }
  const sharerId = sharerProfiles[0].id;

  // Look up recipient
  const { data: recipientRows, error: rpcError } = await supabase.rpc(
    "find_profile_by_email",
    { lookup_email: recipient_email.toLowerCase().trim() },
  );

  if (rpcError) {
    console.error("[Share] find_profile_by_email error:", rpcError);
    return error(500, { message: "Internal server error" });
  }

  const recipient = recipientRows?.[0] ?? null;

  if (recipient) {
    // Case A: recipient already has an account
    // Insert keys for each document and create active share records
    const keysToInsert = shares
      .filter((s) => s.encrypted_key_for_recipient)
      .map((s) => ({
        document_id: s.document_id,
        user_id: recipient.auth_id,
        owner_id: s.owner_id,
        key: s.encrypted_key_for_recipient,
        author_id: user.id,
      }));

    if (keysToInsert.length > 0) {
      const { error: keysError } = await supabase.from("keys").insert(keysToInsert);
      if (keysError) {
        console.error("[Share] Error inserting keys:", keysError);
        return error(500, { message: "Error granting document access" });
      }
    }

    const shareRecords = shares.map((s) => ({
      sharer_id: sharerId,
      owner_id: s.owner_id,
      recipient_email: recipient_email.toLowerCase().trim(),
      recipient_id: recipient.id,
      document_id: s.document_id,
      status: "active",
    }));

    const { error: sharesError } = await supabase
      .from("document_shares")
      .insert(shareRecords);

    if (sharesError) {
      console.error("[Share] Error inserting share records:", sharesError);
      return error(500, { message: "Error creating share records" });
    }

    auditFromEvent(event, { action: "share", resource_type: "share", metadata: { recipient_email, document_count: shares.length, recipient_exists: true } });

    return json({ status: "active", recipient_exists: true });
  } else {
    // Case B: recipient does not have an account yet
    if (!share_secret) {
      return error(400, { message: "share_secret required for new users" });
    }

    const shareRecords = shares.map((s) => ({
      sharer_id: sharerId,
      owner_id: s.owner_id,
      recipient_email: recipient_email.toLowerCase().trim(),
      recipient_id: null,
      document_id: s.document_id,
      pending_encrypted_key: s.pending_encrypted_key,
      status: "pending",
    }));

    const { error: sharesError } = await supabase
      .from("document_shares")
      .insert(shareRecords);

    if (sharesError) {
      console.error("[Share] Error inserting pending share records:", sharesError);
      return error(500, { message: "Error creating share records" });
    }

    // Send invitation email with the share token embedded in the redirect URL
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(`/share/accept?t=${share_secret}`)}`;

    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      recipient_email.trim(),
      { redirectTo },
    );

    if (inviteError) {
      console.error("[Share] Error sending invitation:", inviteError);
      // Don't fail the whole request — the pending shares are created,
      // but the invite email failed. Surface this to the client.
      return json({
        status: "pending",
        recipient_exists: false,
        invite_error: inviteError.message,
      });
    }

    auditFromEvent(event, { action: "share", resource_type: "share", metadata: { recipient_email, document_count: shares.length, recipient_exists: false } });

    return json({ status: "pending", recipient_exists: false });
  }
};
