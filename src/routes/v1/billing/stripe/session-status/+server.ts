// =====================================================
// GET /v1/billing/stripe/session-status - Get checkout session status
// =====================================================

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getCheckoutSessionStatus } from '$lib/billing/stripe.server';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, user } }) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: 'Unauthorized' });
    }

    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return error(400, { message: 'session_id is required' });
    }

    const status = await getCheckoutSessionStatus(sessionId);

    return json(status);
  } catch (err) {
    console.error('[API] /v1/billing/stripe/session-status - Error:', err);

    if (err instanceof Error && err.message.includes('No such checkout.session')) {
      return error(404, { message: 'Session not found' });
    }

    return error(500, { message: 'Failed to get session status' });
  }
};
