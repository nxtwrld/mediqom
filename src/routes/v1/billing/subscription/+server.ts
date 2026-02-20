// =====================================================
// GET /v1/billing/subscription - Get current user subscription
// =====================================================

import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  getSubscriptionWithUsage,
  ensureSubscription,
} from "$lib/billing/subscription.server";

export const GET: RequestHandler = async ({
  locals: { safeGetSession, user },
}) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: "Unauthorized" });
    }

    // Ensure subscription exists (creates free tier if missing)
    await ensureSubscription(user.id, user.email);

    const subscription = await getSubscriptionWithUsage(user.id);

    if (!subscription) {
      return error(404, { message: "Subscription not found" });
    }

    return json(subscription);
  } catch (err) {
    console.error("[API] /v1/billing/subscription - Error:", err);
    return error(500, { message: "Failed to load subscription" });
  }
};
