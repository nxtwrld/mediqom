import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { setUser } from "$lib/user";
import { waitLocale } from "svelte-i18n";
import { loadProfiles } from "$lib/profiles";
import { log } from "$lib/logging/logger";
import { apiFetch } from "$lib/api/client";

export const load: LayoutLoad = async ({ parent, fetch }) => {
  const { session, user } = await parent();

  // Guard: Only proceed if we have a valid session
  if (!session || !user) {
    redirect(303, "/auth");
  }

  // fetch basic user data - now safe because we have a session
  const userData = await apiFetch('/v1/med/user', { fetch })
    .then((r) => r.json())
    .catch((e) => {
      log.api.error("Error loading user", e);
      redirect(303, "/account");
    });
  await loadProfiles(false, fetch);

  if (
    userData &&
    userData.fullName &&
    userData.private_keys &&
    userData.publicKey
  ) {
    // Language is already set in root layout, no need to set it again
    // Just ensure locale is ready
    await waitLocale();

    // Pass the user session to avoid auth calls during hydration
    await setUser(userData, user);

    return {};
  } else {
    redirect(303, "/account");
  }
};

// @ts-ignore - __CAPACITOR_BUILD__ is defined at build time by vite.config.mobile.ts
const IS_CAPACITOR = typeof __CAPACITOR_BUILD__ !== 'undefined' && __CAPACITOR_BUILD__ === true;

// Disable trailing slash redirects for Capacitor to prevent redirect loops
export const trailingSlash = IS_CAPACITOR ? "ignore" : "always";

// Disable SSR for Capacitor builds - server load functions won't be available
export const ssr = false;
