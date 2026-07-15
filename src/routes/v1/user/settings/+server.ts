import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

/**
 * User-level preferences (Care Plan build row 18). Merges the posted keys into
 * the owner profile's `settings` jsonb (migration 20260414). These are display/
 * accessibility preferences of the account holder, applied across every patient
 * profile they manage — not per-patient medical data.
 *
 * Known keys: `showCertaintyLabelsInline: boolean`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  // Whitelist of accepted preference keys.
  const updates: Record<string, unknown> = {};
  if (typeof body.showCertaintyLabelsInline === "boolean") {
    updates.showCertaintyLabelsInline = body.showCertaintyLabelsInline;
  }
  if (Object.keys(updates).length === 0) {
    return json(
      { success: false, error: "No recognised settings" },
      { status: 400 },
    );
  }

  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  if (readError) {
    console.error("[User Settings API] read error:", readError);
    return json({ success: false, error: "Database error" }, { status: 500 });
  }

  const merged = { ...(existing?.settings ?? {}), ...updates };

  const { error } = await supabase
    .from("profiles")
    .update({ settings: merged })
    .eq("id", user.id);

  if (error) {
    console.error("[User Settings API] write error:", error);
    return json({ success: false, error: "Database error" }, { status: 500 });
  }

  return json({ success: true, settings: merged });
};
