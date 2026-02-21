import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import type { Profile } from "$lib/types.d";
import { profiles, profile, loadProfileDocuments } from "$lib/profiles";
import { getCache } from "$lib/cache";

export const load: LayoutLoad = async ({ parent, params, fetch }) => {
  await parent();

  // Use enriched profile from cache if available (warm cache = instant props)
  const cached = getCache<Profile>(`profiles:enrich:${params.profile}`);
  const p = cached || (profiles.get(params.profile) as Profile);

  if (!p) {
    redirect(303, "/med/p");
  }

  // Set profile immediately so the page renders now
  profile.set(p);

  // Load documents in the background — no await
  loadProfileDocuments(params.profile, fetch);

  return {};
};
