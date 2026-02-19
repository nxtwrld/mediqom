import { error, json, type RequestHandler } from "@sveltejs/kit";
import assess from "$lib/import.server/assessInputs";
import {
  checkScansAvailable,
  consumeScan,
} from "$lib/billing/subscription.server";

export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  //const str = url.searchParams.get('drug');

  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }
  const scansCheck = await checkScansAvailable(user.id);
  if (scansCheck.available <= 0) {
    error(403, { message: "Subscription limit reached" });
  }

  const data = await request.json();

  if (data.images === undefined && data.text === undefined) {
    error(400, { message: "No image or text provided" });
  }

  const result = await assess(data);

  // Consume scan (atomic operation)
  const consumeResult = await consumeScan(user.id);
  if (!consumeResult.success) {
    error(403, { message: consumeResult.reason || "Failed to consume scan" });
  }

  return json(result);
};
