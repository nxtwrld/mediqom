import { json, error } from "@sveltejs/kit";
import { analyzeSerenityForm } from "$lib/serenity/form-analyzer";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, user },
}) => {
  // Auth check
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const { transcript, formType, language } = await request.json();

  // Validation
  if (!transcript || !formType) {
    error(400, {
      message: "Missing required fields: transcript and formType are required",
    });
  }

  if (formType !== "pre" && formType !== "post") {
    error(400, { message: 'Invalid formType. Must be "pre" or "post"' });
  }

  try {
    const result = await analyzeSerenityForm(
      transcript,
      formType,
      language || "en",
    );
    return json(result);
  } catch (err) {
    console.error("Serenity form analysis failed:", err);
    error(500, { message: `Analysis failed: ${(err as Error).message}` });
  }
};
