// =====================================================
// POST /v1/billing/iap/restore - Restore mobile purchases
// =====================================================
// This endpoint handles the "Restore Purchases" flow for iOS and Android.
// It re-validates all past purchases and updates the subscription if valid.
// =====================================================

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getSubscriptionWithUsage } from '$lib/billing/subscription.server';

interface RestoreRequest {
  platform: 'ios' | 'android';
  receipts: Array<{
    receipt: string;
    product_id: string;
  }>;
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, user } }) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: 'Unauthorized' });
    }

    const body = (await request.json()) as RestoreRequest;
    const { platform, receipts } = body;

    if (!platform || !['ios', 'android'].includes(platform)) {
      return error(400, { message: 'Invalid platform' });
    }

    if (!receipts || !Array.isArray(receipts)) {
      return error(400, { message: 'receipts array is required' });
    }

    // Process each receipt
    // In production, this would call the verify endpoint for each receipt
    // and aggregate the results
    const results = await Promise.all(
      receipts.map(async ({ receipt, product_id }) => {
        try {
          // For now, call the verify endpoint internally
          // In production, you might want to share validation logic
          const response = await fetch(new URL('/v1/billing/iap/verify', request.url), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify({ platform, receipt, product_id }),
          });

          const result = await response.json();
          return { product_id, ...result };
        } catch {
          return { product_id, success: false, error: 'Validation failed' };
        }
      })
    );

    // Check if any subscription was restored
    const subscription = await getSubscriptionWithUsage(user.id);

    return json({
      success: true,
      restored: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
      subscription,
    });
  } catch (err) {
    console.error('[API] /v1/billing/iap/restore - Error:', err);
    return error(500, { message: 'Failed to restore purchases' });
  }
};
