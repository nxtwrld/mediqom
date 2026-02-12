import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/** GET - Get full job details including results */
export const GET: RequestHandler = async ({
  params,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  const { data: job, error: dbError } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (dbError || !job) {
    error(404, { message: "Import job not found" });
  }

  return json({ job });
};

/** DELETE - Remove a job after finalization */
export const DELETE: RequestHandler = async ({
  params,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  const { error: dbError } = await supabase
    .from("import_jobs")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (dbError) {
    console.error("Failed to delete import job:", dbError);
    error(500, { message: "Failed to delete import job" });
  }

  return json({ success: true });
};

/** PATCH - Retry a failed job (reset status) */
export const PATCH: RequestHandler = async ({
  params,
  request,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  // Verify job exists and belongs to user
  const { data: job, error: fetchError } = await supabase
    .from("import_jobs")
    .select("id, status")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !job) {
    error(404, { message: "Import job not found" });
  }

  if (job.status !== "error") {
    error(400, { message: "Only failed jobs can be retried" });
  }

  const { error: updateError } = await supabase
    .from("import_jobs")
    .update({
      status: "created",
      error: null,
      processing_started_at: null,
      stage: null,
      progress: 0,
      message: null,
    })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Failed to reset import job:", updateError);
    error(500, { message: "Failed to reset import job" });
  }

  return json({ success: true });
};
