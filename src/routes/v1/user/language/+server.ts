import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

const languageSchema = {
  validate: (data: any): data is { language: "en" | "cs" | "de" } => {
    return (
      data &&
      typeof data === "object" &&
      typeof data.language === "string" &&
      ["en", "cs", "de"].includes(data.language)
    );
  },
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = await locals.safeGetSession();

  if (!session || !user) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!languageSchema.validate(body)) {
      return json(
        { success: false, error: "Invalid language" },
        { status: 400 },
      );
    }

    // Use service role client for database update
    const supabase = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const { error } = await supabase
      .from("profiles")
      .update({ language: body.language })
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
