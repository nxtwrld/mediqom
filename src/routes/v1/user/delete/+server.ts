import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { deleteUserStorage } from "$lib/storage/cleanup";
import { auditFromEvent } from "$lib/audit/index.server";

export const DELETE: RequestHandler = async (event) => {
  const { locals } = event;
  const { session, user } = await locals.safeGetSession();

  if (!session || !user) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use service role client for storage cleanup (needs to read profile/documents)
    const serviceClient = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // Clean up storage files (avatars, attachments) before deleting user.
    // Must run first: it resolves the objects via profiles/documents, which the
    // cascade removes.
    const storageResult = await deleteUserStorage(user.id, serviceClient);

    // Erasure has to be complete (GDPR Art. 17). If storage objects survived, stop
    // rather than delete the DB rows that tell us which objects they were.
    if (storageResult.totalErrors > 0) {
      console.error(
        "[User Delete] Storage cleanup incomplete, aborting:",
        storageResult.errors,
      );
      return json(
        {
          success: false,
          error: "Failed to delete stored files. Account was not deleted.",
        },
        { status: 500 },
      );
    }

    // Delete auth user - database cascades handle all related data automatically
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(
      user.id,
    );

    if (deleteError) {
      console.error("[User Delete] Failed to delete auth user:", deleteError);
      return json(
        { success: false, error: "Failed to delete account" },
        { status: 500 },
      );
    }

    auditFromEvent(event, { action: "delete", resource_type: "account" });

    return json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    console.error("[User Delete] Unexpected error:", error);
    return json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
};
