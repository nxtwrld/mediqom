import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { apiFetch } from "$lib/api/client";
import { log } from "$lib/logging/logger";

export const ssr = false;

export const load: PageLoad = async ({ parent, fetch }) => {
  const { session, user } = await parent();

  if (!session || !user) {
    redirect(303, "/auth");
  }

  const profile = await apiFetch("/v1/med/user", { fetch })
    .then((r) => r.json())
    .catch((e) => {
      log.api.error("Error loading user data", e);
      return null;
    });

  if (
    profile &&
    profile.fullName &&
    profile.private_keys &&
    profile.publicKey
  ) {
    log.api.info("profile loaded - redirecting to med");
    redirect(303, "/med");
  }

  return { session, profile, userEmail: user.email };
};
