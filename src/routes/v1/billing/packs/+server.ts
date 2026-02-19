// =====================================================
// GET /v1/billing/packs - List scan packs
// =====================================================

import { json, type RequestHandler } from '@sveltejs/kit';
import { getScanPacks } from '$lib/billing/subscription.server';

export const GET: RequestHandler = async () => {
  try {
    const packs = await getScanPacks();
    return json(packs);
  } catch (err) {
    console.error('[API] /v1/billing/packs - Error:', err);
    return json({ error: 'Failed to load packs' }, { status: 500 });
  }
};
