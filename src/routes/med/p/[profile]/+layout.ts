import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import type { Profile } from "$lib/types.d";
import { profiles, profile, loadProfileDocuments } from "$lib/profiles";

export const load: LayoutLoad = async ({ parent, params, fetch }) => {
  await parent();

  // profiles are already preloaded - just select it
  const p = profiles.get(params.profile) as Profile;

  if (!p) {
    redirect(303, "/med/p");
  }

  // Set profile immediately so the page renders now
  profile.set(p);

  // Load documents in the background — no await
  loadProfileDocuments(params.profile, fetch);

  return {};
};
