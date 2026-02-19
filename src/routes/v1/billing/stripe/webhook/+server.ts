// =====================================================
// POST /v1/billing/stripe/webhook - Handle Stripe webhooks
// =====================================================
// IMPORTANT: This endpoint must NOT use body parsing middleware.
// We need the raw body to verify the webhook signature.
// =====================================================

import { json, type RequestHandler } from '@sveltejs/kit';
import { verifyWebhookSignature, handleWebhookEvent } from '$lib/billing/stripe.server';

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('[Webhook] Missing stripe-signature header');
      return json({ error: 'Missing signature' }, { status: 401 });
    }

    // Verify signature and parse event
    let event;
    try {
      event = verifyWebhookSignature(body, signature);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err);
      return json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);

    // Handle the event
    try {
      await handleWebhookEvent(event);
    } catch (err) {
      console.error(`[Webhook] Error handling ${event.type}:`, err);
      // Still return 200 to prevent Stripe retries for application errors
      // The error is logged and can be investigated
      return json({
        received: true,
        event_id: event.id,
        event_type: event.type,
        status: 'error',
      });
    }

    return json({
      received: true,
      event_id: event.id,
      event_type: event.type,
      status: 'processed',
    });
  } catch (err) {
    console.error('[Webhook] Unexpected error:', err);
    return json({ error: 'Internal error' }, { status: 500 });
  }
};
