import type { PageLoad } from "./$types";
import { loadBillingData } from "$lib/billing/store";

export const load: PageLoad = async ({ fetch }) => {
  // Load billing data client-side
  await loadBillingData(fetch);

  return {};
};
