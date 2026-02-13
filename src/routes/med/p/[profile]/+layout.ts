import { fail, redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import type { Profile } from "$lib/types.d";
import { profiles, profile } from "$lib/profiles";
import { importDocuments } from "$lib/documents";
import { profileContextManager } from "$lib/context/integration/profile-context";

export const load: LayoutLoad = async ({ parent, params, fetch }) => {
  await parent();

  // profiles are already preloaded - just select it
  const p = profiles.get(params.profile) as Profile;

  if (!p) {
    // profile not found
    redirect(303, "/med/p");
  }

  // set the profile
  profile.set(p);

  const documentsResponse = await fetch(
    `/v1/med/profiles/${params.profile}/documents`,
  );

  if (documentsResponse.status === 401) {
    fail(401, { message: "Unauthorized" });
  }

  if (documentsResponse.status !== 200) {
    fail(documentsResponse.status, { message: "Error loading documents" });
  }

  const documents = await importDocuments(await documentsResponse.json());

  // Initialize profile context with simplified medical terms approach
  if (documents.length > 0) {
    try {
      await profileContextManager.initializeProfileContext(params.profile);
    } catch (error) {
      console.warn(
        `Failed to initialize context for profile ${params.profile}:`,
        error,
      );
    }
  }

  return {};
};
