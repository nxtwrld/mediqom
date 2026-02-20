// =====================================================
// POST /v1/billing/stripe/portal - Create Stripe customer portal session
// =====================================================

import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createPortalSession } from "$lib/billing/stripe.server";

interface PortalRequest {
  return_url: string;
}

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, user },
}) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: "Unauthorized" });
    }

    const body = (await request.json()) as PortalRequest;
    const { return_url } = body;

    if (!return_url) {
      return error(400, { message: "return_url is required" });
    }

    const url = await createPortalSession(user.id, return_url);

    return json({ url });
  } catch (err) {
    console.error("[API] /v1/billing/stripe/portal - Error:", err);

    if (err instanceof Error && err.message.includes("No Stripe customer")) {
      return error(400, { message: "No billing account found" });
    }

    return error(500, { message: "Failed to open billing portal" });
  }
};
