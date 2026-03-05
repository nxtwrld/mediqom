import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  getStripe,
  handleCheckoutCompleted,
} from "$lib/billing/stripe.server";

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) return error(401, { message: "Unauthorized" });

  const { session_id } = await request.json();
  if (!session_id) return error(400, { message: "session_id is required" });

  const stripe = getStripe();
  const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);

  // Verify this session belongs to the authenticated user
  if (checkoutSession.metadata?.user_id !== user.id) {
    return error(403, { message: "Forbidden" });
  }

  // Only process completed, paid one-time purchases or subscriptions
  if (checkoutSession.status !== "complete") {
    return json({ success: false, reason: "Payment not completed" });
  }

  // For payment mode, require paid status
  if (
    checkoutSession.mode === "payment" &&
    checkoutSession.payment_status !== "paid"
  ) {
    return json({ success: false, reason: "Payment not completed" });
  }

  // handleCheckoutCompleted uses session.id as idempotency key — safe to call multiple times
  await handleCheckoutCompleted(checkoutSession, checkoutSession.id);

  return json({ success: true });
};
