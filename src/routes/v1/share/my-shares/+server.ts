import { error, json, type RequestHandler } from "@sveltejs/kit";

/**
 * GET /v1/share/my-shares
 * Returns all outgoing document shares for the current user.
 */
export const GET: RequestHandler = async ({
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  // Get the current user's profile ID
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_id", user.id)
    .limit(1);

  if (profileError || !profiles?.length) {
    return error(500, { message: "Could not load user profile" });
  }
  const profileId = profiles[0].id;

  const { data: shares, error: sharesError } = await supabase
    .from("document_shares")
    .select(
      `id, recipient_email, recipient_id, document_id, status, created_at, accepted_at, revoked_at,
       document:documents(id, metadata, type)`,
    )
    .eq("sharer_id", profileId)
    .neq("status", "revoked")
    .order("created_at", { ascending: false });

  if (sharesError) {
    console.error("[Share] Error loading shares:", sharesError);
    return error(500, { message: "Error loading shares" });
  }

  return json(shares);
};
