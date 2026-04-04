import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import type { FileManifestEntry } from "$lib/import/types";

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * PATCH - Merge layout detections into a job's file_manifest.
 *
 * Called by the client after async DocLayout-YOLO inference completes,
 * while the server is still running OCR (extraction stage).
 *
 * Body: { layoutDetections: { fileIndex: number, detections: PageLayoutDetection[] }[] }
 */
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

  // Fetch the job (must belong to user)
  const { data: job, error: fetchError } = await supabase
    .from("import_jobs")
    .select("id, user_id, file_manifest")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !job) {
    error(404, { message: "Import job not found" });
  }

  const body = await request.json();
  const { layoutDetections } = body as {
    layoutDetections: { fileIndex: number; detections: any[] }[];
  };

  if (!layoutDetections || !Array.isArray(layoutDetections)) {
    error(400, { message: "Missing layoutDetections array" });
  }

  // Merge detections into existing file_manifest
  const manifest: FileManifestEntry[] = job.file_manifest || [];

  for (const entry of layoutDetections) {
    if (entry.fileIndex >= 0 && entry.fileIndex < manifest.length) {
      manifest[entry.fileIndex].layoutDetections = entry.detections;
    }
  }

  // Write back
  const { error: updateError } = await supabase
    .from("import_jobs")
    .update({ file_manifest: manifest })
    .eq("id", job.id);

  if (updateError) {
    console.error("Failed to update layout detections:", updateError);
    error(500, { message: "Failed to update layout detections" });
  }

  return json({ ok: true });
};
