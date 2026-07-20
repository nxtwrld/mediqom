import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { isFeatureEnabled } from "$lib/config/feature-flags";

export const load: PageLoad = async ({ parent, url }) => {
  if (!isFeatureEnabled("CARE_PLAN")) throw error(404, "Not found");
  await parent();
  const region = new URLSearchParams(url.search).get("region") || null;
  return { region };
};
