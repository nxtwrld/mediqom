import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { checkScansAvailable } from "$lib/billing/subscription.server";
import type { ImportJobCreateInput } from "$lib/import/types";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/** POST - Create a new import job */
export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const scansCheck = await checkScansAvailable(user.id);
  if (scansCheck.available <= 0) {
    error(403, { message: "Subscription limit reached" });
  }

  const body: ImportJobCreateInput = await request.json();
  if (!body.files || body.files.length === 0) {
    error(400, { message: "No files provided" });
  }

  const supabase = getServiceClient();

  const { data: job, error: dbError } = await supabase
    .from("import_jobs")
    .insert({
      user_id: user.id,
      status: "created",
      file_count: body.files.length,
      file_manifest: body.files,
      language: body.language || "English",
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("Failed to create import job:", dbError);
    error(500, { message: "Failed to create import job" });
  }

  return json({ id: job.id });
};

/** GET - List active/completed jobs for current user */
export const GET: RequestHandler = async ({
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  // Lazily delete expired jobs
  await supabase
    .from("import_jobs")
    .delete()
    .eq("user_id", user.id)
    .lt("expires_at", new Date().toISOString());

  // Fetch active jobs (exclude expired status)
  const { data: jobs, error: dbError } = await supabase
    .from("import_jobs")
    .select(
      "id, status, stage, progress, message, error, file_count, file_manifest, language, created_at, updated_at, expires_at",
    )
    .eq("user_id", user.id)
    .in("status", ["created", "extracting", "analyzing", "completed", "error"])
    .order("created_at", { ascending: false });

  if (dbError) {
    console.error("Failed to list import jobs:", dbError);
    error(500, { message: "Failed to list import jobs" });
  }

  return json({ jobs: jobs || [] });
};
