// =====================================================
// POST /v1/billing/stripe/embedded-checkout - Create embedded checkout session
// =====================================================

import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  createEmbeddedCheckoutSession,
  createEmbeddedPackCheckoutSession,
} from '$lib/billing/stripe.server';
import type { SubscriptionTierId, BillingCycle } from '$lib/billing/types';

interface EmbeddedCheckoutRequest {
  tier_id?: SubscriptionTierId;
  billing_cycle?: BillingCycle;
  pack_id?: string;
  return_url: string;
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, user } }) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: 'Unauthorized' });
    }

    const body = (await request.json()) as EmbeddedCheckoutRequest;
    const { tier_id, billing_cycle, pack_id, return_url } = body;

    if (!return_url) {
      return error(400, { message: 'return_url is required' });
    }

    // Handle scan pack purchase
    if (pack_id) {
      const result = await createEmbeddedPackCheckoutSession(
        user.id,
        user.email || '',
        pack_id,
        return_url
      );
      return json({ clientSecret: result.clientSecret, sessionId: result.sessionId });
    }

    // Handle subscription checkout
    if (!tier_id) {
      return error(400, { message: 'tier_id is required' });
    }

    if (!billing_cycle || !['monthly', 'yearly'].includes(billing_cycle)) {
      return error(400, { message: 'billing_cycle must be "monthly" or "yearly"' });
    }

    const result = await createEmbeddedCheckoutSession(
      user.id,
      user.email || '',
      tier_id,
      billing_cycle,
      return_url
    );

    return json({ clientSecret: result.clientSecret, sessionId: result.sessionId });
  } catch (err) {
    console.error('[API] /v1/billing/stripe/embedded-checkout - Error:', err);

    if (err instanceof Error) {
      // Don't expose internal errors
      if (err.message.includes('Invalid tier') || err.message.includes('Invalid pack')) {
        return error(400, { message: err.message });
      }
      if (err.message.includes('not configured')) {
        return error(400, { message: 'Payment not available for this product' });
      }
    }

    return error(500, { message: 'Failed to create checkout session' });
  }
};
