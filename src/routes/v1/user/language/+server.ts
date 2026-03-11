import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import SUPPORTED_LANGUAGES from "$lib/languages";

const validLanguages = Object.keys(SUPPORTED_LANGUAGES);
const VALID_ROLES = ["individual", "medical"];

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = await locals.safeGetSession();

  if (!session || !user) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      typeof body.language !== "string" ||
      !validLanguages.includes(body.language)
    ) {
      return json(
        { success: false, error: "Invalid language" },
        { status: 400 },
      );
    }

    const userRole = body.user_role;
    if (userRole !== undefined && !VALID_ROLES.includes(userRole)) {
      return json({ success: false, error: "Invalid role value" }, { status: 400 });
    }

    // Use service role client for database update
    const supabase = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const updateFields: Record<string, unknown> = { language: body.language };
    if (userRole !== undefined) updateFields.user_role = userRole;

    const { error } = await supabase
      .from("profiles")
      .update(updateFields)
      .eq("id", user.id);

    if (error) {
      console.error("[Language API] Database error:", error);
      return json({ success: false, error: "Database error" }, { status: 500 });
    }

    return json({ success: true });
  } catch (error) {
    console.error("[Language API] Unexpected error:", error);
    return json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
};
