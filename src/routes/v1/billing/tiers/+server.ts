// =====================================================
// GET /v1/billing/tiers - List subscription tiers
// =====================================================

import { json, type RequestHandler } from "@sveltejs/kit";
import { getTiers } from "$lib/billing/subscription.server";

export const GET: RequestHandler = async () => {
  try {
    const tiers = await getTiers();
    return json(tiers);
  } catch (err) {
    console.error("[API] /v1/billing/tiers - Error:", err);
    return json({ error: "Failed to load tiers" }, { status: 500 });
  }
};
